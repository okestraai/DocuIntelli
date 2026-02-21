import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'DocuIntelli Billing',
    version: '1.0.0',
  },
});

const starterPriceId = Deno.env.get('STRIPE_STARTER_PRICE_ID')!;
const proPriceId = Deno.env.get('STRIPE_PRO_PRICE_ID')!;

function corsResponse(body: string | object | null, status = 200) {
  const headers = {
    'Access-Control-Allow-Origin': Deno.env.get("ALLOWED_ORIGIN") || "http://localhost:5173",
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  };

  if (status === 204) {
    return new Response(null, { status, headers });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return corsResponse({}, 204);
    }

    if (req.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405);
    }

    const { success_url, cancel_url } = await req.json();

    if (!success_url || typeof success_url !== 'string') {
      return corsResponse({ error: 'Missing required parameter: success_url' }, 400);
    }

    if (!cancel_url || typeof cancel_url !== 'string') {
      return corsResponse({ error: 'Missing required parameter: cancel_url' }, 400);
    }

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return corsResponse({ error: 'Missing authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: getUserError,
    } = await supabase.auth.getUser(token);

    if (getUserError || !user) {
      return corsResponse({ error: 'Failed to authenticate user' }, 401);
    }

    // Get Stripe customer ID
    const { data: customer, error: getCustomerError } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (getCustomerError) {
      console.error('Failed to fetch customer information:', getCustomerError);
      return corsResponse({ error: 'Failed to fetch customer information' }, 500);
    }

    if (!customer || !customer.customer_id) {
      return corsResponse(
        { error: 'No active subscription found. Please subscribe to a plan first.' },
        400
      );
    }

    // Get current subscription from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.customer_id,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return corsResponse({ error: 'No active subscription found' }, 400);
    }

    const subscription = subscriptions.data[0];
    const currentPriceId = subscription.items.data[0].price.id;

    // Verify user is on the Starter plan
    if (currentPriceId === proPriceId) {
      return corsResponse({ error: 'You are already on the Pro plan' }, 400);
    }

    if (currentPriceId !== starterPriceId) {
      return corsResponse(
        { error: 'Upgrade checkout is only available for Starter plan subscribers' },
        400
      );
    }

    console.log(
      `Creating upgrade checkout for user ${user.id}, subscription ${subscription.id}`
    );

    // Get the actual prices from Stripe to calculate proration
    const currentPrice = subscription.items.data[0].price;
    const proPrice = await stripe.prices.retrieve(proPriceId);

    const starterAmount = currentPrice.unit_amount!; // e.g. 700 ($7.00)
    const proAmount = proPrice.unit_amount!;          // e.g. 1900 ($19.00)
    const currency = currentPrice.currency;

    // Calculate proration manually:
    // prorated_charge = (days_remaining / total_days) × (pro_price − starter_price)
    const periodStart = subscription.current_period_start; // unix timestamp
    const periodEnd = subscription.current_period_end;     // unix timestamp
    const now = Math.floor(Date.now() / 1000);

    const totalSeconds = periodEnd - periodStart;
    const usedSeconds = now - periodStart;
    const remainingSeconds = Math.max(totalSeconds - usedSeconds, 0);

    const totalDays = totalSeconds / 86400;
    const daysUsed = usedSeconds / 86400;
    const daysRemaining = remainingSeconds / 86400;

    const priceDifference = proAmount - starterAmount; // e.g. 1200 ($12.00)
    // Calculate in cents, round to nearest cent
    const proratedAmount = Math.round((daysRemaining / totalDays) * priceDifference);

    console.log(
      `Proration: totalDays=${totalDays.toFixed(1)}, daysUsed=${daysUsed.toFixed(1)}, ` +
      `daysRemaining=${daysRemaining.toFixed(1)}, starter=${starterAmount}, pro=${proAmount}, ` +
      `diff=${priceDifference}, proratedAmount=${proratedAmount} ${currency}`
    );

    // If the prorated amount is zero or negative (e.g. at the very end of a
    // billing period), cancel the Starter and create a new Pro subscription directly.
    if (proratedAmount <= 0) {
      // Cancel the Starter subscription immediately
      await stripe.subscriptions.cancel(subscription.id);
      console.log(`Canceled Starter subscription ${subscription.id}`);

      // Create a new Pro subscription starting from the anniversary date
      const newSub = await stripe.subscriptions.create({
        customer: customer.customer_id,
        items: [{ price: proPriceId }],
        trial_end: periodEnd,
        metadata: {
          upgraded_from: 'starter',
          previous_subscription_id: subscription.id,
        },
      });
      console.log(`Created new Pro subscription ${newSub.id} with trial_end=${periodEnd}`);

      return corsResponse({
        upgraded_directly: true,
        prorated_amount: 0,
        currency,
        current_plan: 'starter',
        new_plan: 'pro',
      });
    }

    // Create a Stripe Checkout Session in payment mode for the prorated amount.
    // This shows the user a Stripe-hosted page with the exact charge and requires
    // explicit confirmation. The subscription switch happens in the webhook after
    // the user confirms payment.
    const session = await stripe.checkout.sessions.create({
      customer: customer.customer_id,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: 'Upgrade to Pro Plan',
              description:
                `Prorated charge for ${Math.ceil(daysRemaining)} remaining days of your billing period`,
            },
            unit_amount: proratedAmount,
          },
          quantity: 1,
        },
      ],
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: 'Pro Plan Upgrade - Prorated charge for remainder of billing period',
          metadata: {
            type: 'subscription_upgrade',
            user_id: user.id,
          },
        },
      },
      metadata: {
        type: 'subscription_upgrade',
        user_id: user.id,
        customer_id: customer.customer_id,
        subscription_id: subscription.id,
        target_price_id: proPriceId,
        period_end: String(subscription.current_period_end),
      },
      payment_intent_data: {
        metadata: {
          type: 'subscription_upgrade',
          user_id: user.id,
          customer_id: customer.customer_id,
          subscription_id: subscription.id,
          target_price_id: proPriceId,
          period_end: String(subscription.current_period_end),
        },
      },
      success_url: `${success_url}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url,
    });

    console.log(
      `Created upgrade checkout session ${session.id} for customer ${customer.customer_id}`
    );

    return corsResponse({
      url: session.url,
      sessionId: session.id,
      prorated_amount: proratedAmount,
      currency,
      current_plan: 'starter',
      new_plan: 'pro',
    });
  } catch (error: any) {
    console.error(`Upgrade checkout error: ${error.message}`);
    return corsResponse({ error: 'Failed to create upgrade session. Please try again.' }, 500);
  }
});
