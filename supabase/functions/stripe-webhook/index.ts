import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'Bolt Integration',
    version: '1.0.0',
  },
});

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// Mailjet config for sending emails directly from edge function
const MAILJET_API_KEY = Deno.env.get('SMTP_USER') || '';
const MAILJET_SECRET_KEY = Deno.env.get('SMTP_PASS') || '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'noreply@docuintelli.com';
const FROM_NAME = 'DocuIntelli AI';
const APP_URL = Deno.env.get('APP_URL') || 'https://app.docuintelli.com';

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!MAILJET_API_KEY || !MAILJET_SECRET_KEY) {
    console.warn('[EMAIL] Mailjet not configured, skipping');
    return false;
  }
  try {
    const resp = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + btoa(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`),
      },
      body: JSON.stringify({
        Messages: [{
          From: { Email: FROM_EMAIL, Name: FROM_NAME },
          To: [{ Email: to }],
          Subject: subject,
          HTMLPart: html,
        }],
      }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[EMAIL] Mailjet error for ${to}:`, err);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[EMAIL] Send failed for ${to}:`, err);
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // get the signature from the header
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return new Response('No signature found', { status: 400 });
    }

    // get the raw body
    const body = await req.text();

    // verify the webhook signature
    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
    } catch (error: any) {
      console.error(`Webhook signature verification failed: ${error.message}`);
      return new Response(`Webhook signature verification failed: ${error.message}`, { status: 400 });
    }

    // Await the handler directly so errors propagate as HTTP 500.
    // This ensures Stripe retries on failure instead of silently swallowing errors.
    await handleEvent(event);

    return Response.json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function handleEvent(event: Stripe.Event) {
  console.info(`Webhook event received: type=${event.type}, id=${event.id}`);

  const stripeData = event?.data?.object ?? {};

  if (!stripeData) {
    return;
  }

  if (!('customer' in stripeData)) {
    console.info(`Skipping event ${event.type} — no customer field`);
    return;
  }

  // Skip payment_intent.succeeded events that are handled elsewhere:
  // - One-time payments without invoice (no action needed)
  // - Upgrade checkout payments (handled by checkout.session.completed)
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.invoice === null || pi.metadata?.type === 'subscription_upgrade') {
      return;
    }
  }

  const { customer: customerId } = stripeData;

  if (!customerId || typeof customerId !== 'string') {
    console.error(`No customer received on event: ${JSON.stringify(event)}`);
  } else {
    let isSubscription = true;

    if (event.type === 'checkout.session.completed') {
      const { mode } = stripeData as Stripe.Checkout.Session;

      isSubscription = mode === 'subscription';

      console.info(`Processing ${isSubscription ? 'subscription' : 'one-time payment'} checkout session`);
    }

    // Log subscription update events (e.g. plan upgrades via Billing Portal)
    if (event.type === 'customer.subscription.updated') {
      const sub = stripeData as Stripe.Subscription;
      const priceId = sub.items?.data?.[0]?.price?.id;
      console.info(`Subscription updated for customer ${customerId}: price=${priceId}, status=${sub.status}`);
    }

    // Log invoice.paid events (e.g. proration charges from upgrades)
    if (event.type === 'invoice.paid') {
      const invoice = stripeData as Stripe.Invoice;
      console.info(`Invoice paid for customer ${customerId}: amount=${invoice.amount_paid}, billing_reason=${invoice.billing_reason}`);
    }

    // ── Dunning: payment failure → start dunning flow ──
    if (event.type === 'invoice.payment_failed') {
      const invoice = stripeData as Stripe.Invoice;
      console.info(`[DUNNING] invoice.payment_failed for customer ${customerId}, attempt=${invoice.attempt_count}`);

      // Look up user_id from stripe_customers
      const { data: custData } = await supabase
        .from('stripe_customers')
        .select('user_id')
        .eq('customer_id', customerId)
        .single();

      if (custData?.user_id) {
        // Check if already in dunning
        const { data: sub } = await supabase
          .from('user_subscriptions')
          .select('payment_status, plan')
          .eq('user_id', custData.user_id)
          .single();

        if (sub && sub.payment_status === 'active' && sub.plan !== 'free') {
          const failureReason = (invoice as any).last_finalization_error?.message
            || (invoice as any).status_transitions?.finalized_at ? 'Payment method declined' : 'Payment failed';

          await supabase
            .from('user_subscriptions')
            .update({
              payment_status: 'past_due',
              payment_failed_at: new Date().toISOString(),
              dunning_step: 1,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', custData.user_id);

          await supabase.from('dunning_log').insert({
            user_id: custData.user_id,
            step: 1,
            action: 'dunning_started',
            details: { failureReason, invoiceId: invoice.id, attemptCount: invoice.attempt_count },
          });

          console.info(`[DUNNING] Started dunning for user ${custData.user_id}`);
        }
      }
    }

    // ── Dunning: payment success → recover from dunning ──
    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
      const { data: custData } = await supabase
        .from('stripe_customers')
        .select('user_id')
        .eq('customer_id', customerId)
        .single();

      if (custData?.user_id) {
        const { data: sub } = await supabase
          .from('user_subscriptions')
          .select('payment_status, dunning_step, previous_plan, plan')
          .eq('user_id', custData.user_id)
          .single();

        if (sub && sub.payment_status !== 'active' && sub.dunning_step > 0 && sub.dunning_step < 8) {
          const restoredPlan = sub.previous_plan || sub.plan;
          const planLimits: Record<string, Record<string, number>> = {
            free: { document_limit: 3, ai_questions_limit: 5, monthly_upload_limit: 3, bank_account_limit: 0 },
            starter: { document_limit: 25, ai_questions_limit: 999999, monthly_upload_limit: 30, bank_account_limit: 2 },
            pro: { document_limit: 100, ai_questions_limit: 999999, monthly_upload_limit: 150, bank_account_limit: 5 },
          };
          const limits = planLimits[restoredPlan] || planLimits.free;

          await supabase
            .from('user_subscriptions')
            .update({
              payment_status: 'active',
              dunning_step: 0,
              payment_failed_at: null,
              restricted_at: null,
              downgraded_at: null,
              previous_plan: null,
              deletion_scheduled_at: null,
              plan: restoredPlan,
              status: 'active',
              document_limit: limits.document_limit,
              ai_questions_limit: limits.ai_questions_limit,
              monthly_upload_limit: limits.monthly_upload_limit,
              bank_account_limit: limits.bank_account_limit,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', custData.user_id);

          await supabase.from('dunning_log').insert({
            user_id: custData.user_id,
            step: sub.dunning_step,
            action: 'recovered',
            details: { restoredPlan, trigger: event.type },
          });

          console.info(`[DUNNING] Recovered user ${custData.user_id} → ${restoredPlan}`);
        }
      }
    }

    const { mode, payment_status, metadata } = stripeData as Stripe.Checkout.Session;

    console.info(`Event routing: type=${event.type}, isSubscription=${isSubscription}, mode=${mode}, payment_status=${payment_status}, metadata_type=${metadata?.type}`);

    if (isSubscription) {
      console.info(`Starting subscription sync for customer: ${customerId}`);
      await syncCustomerFromStripe(customerId);
    } else if (mode === 'payment' && payment_status === 'paid') {
      // Legacy subscription upgrade checkout (new upgrades use Express /api/subscription/upgrade)
      if (metadata?.type === 'subscription_upgrade') {
        console.info(
          `Legacy subscription_upgrade checkout completed for customer ${customerId}. Syncing subscription state.`
        );
        await syncCustomerFromStripe(customerId);
      } else {
        try {
          // Regular one-time payment — insert into stripe_orders
          const {
            id: checkout_session_id,
            payment_intent,
            amount_subtotal,
            amount_total,
            currency,
          } = stripeData as Stripe.Checkout.Session;

          const { error: orderError } = await supabase.from('stripe_orders').insert({
            checkout_session_id,
            payment_intent_id: payment_intent,
            customer_id: customerId,
            amount_subtotal,
            amount_total,
            currency,
            payment_status,
            status: 'completed',
          });

          if (orderError) {
            console.error('Error inserting order:', orderError);
            return;
          }
          console.info(`Successfully processed one-time payment for session: ${checkout_session_id}`);
        } catch (error) {
          console.error('Error processing one-time payment:', error);
        }
      }
    }
  }
}

// based on the excellent https://github.com/t3dotgg/stripe-recommendations
async function syncCustomerFromStripe(customerId: string) {
  try {
    // Fetch the latest non-canceled subscription first (active, trialing, past_due, etc.)
    let subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      expand: ['data.default_payment_method'],
    });

    // If no active subscriptions, check all (including canceled) for cleanup purposes
    if (subscriptions.data.length === 0) {
      subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
        status: 'all',
        expand: ['data.default_payment_method'],
      });
    }

    // Get user_id from stripe_customers
    const { data: customerData, error: customerError } = await supabase
      .from('stripe_customers')
      .select('user_id')
      .eq('customer_id', customerId)
      .single();

    if (customerError) {
      console.error('Error fetching customer data:', customerError);
      throw new Error('Failed to fetch customer data');
    }

    const userId = customerData.user_id;

    // Fetch current plan BEFORE sync so we can detect free→paid transitions
    const { data: prevSub } = await supabase
      .from('user_subscriptions')
      .select('plan')
      .eq('user_id', userId)
      .single();
    const previousPlan = prevSub?.plan || 'free';

    // TODO verify if needed
    if (subscriptions.data.length === 0) {
      console.info(`No active subscriptions found for customer: ${customerId}`);
      const { error: noSubError } = await supabase.from('stripe_subscriptions').upsert(
        {
          customer_id: customerId,
          subscription_status: 'not_started',
        },
        {
          onConflict: 'customer_id',
        },
      );

      if (noSubError) {
        console.error('Error updating subscription status:', noSubError);
        throw new Error('Failed to update subscription status in database');
      }

      // Update user_subscriptions to free plan
      console.info(`Setting user ${userId} to free plan (no active subscription)`);
      await supabase
        .from('user_subscriptions')
        .update({
          plan: 'free',
          status: 'active',
          document_limit: 3,
          ai_questions_limit: 5,
          bank_account_limit: 0,
          stripe_customer_id: customerId,
          stripe_subscription_id: null,
          stripe_price_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      // Run downgrade document cleanup if documents_to_keep was set
      await handleDowngradeCleanup(userId);

      return;
    }

    // assumes that a customer can only have a single subscription
    const subscription = subscriptions.data[0];
    const priceId = subscription.items.data[0].price.id;

    // Get price IDs from environment
    const starterPriceId = Deno.env.get('STRIPE_STARTER_PRICE_ID');
    const proPriceId = Deno.env.get('STRIPE_PRO_PRICE_ID');

    console.info(`Environment price IDs: starter=${starterPriceId}, pro=${proPriceId}, actual=${priceId}`);

    if (!starterPriceId || !proPriceId) {
      console.error('CRITICAL: STRIPE_STARTER_PRICE_ID or STRIPE_PRO_PRICE_ID not set in environment!');
    }

    // Map price_id to plan and limits (matching our 3-tier system)
    const planMapping: Record<string, { plan: 'starter' | 'pro'; documentLimit: number; aiQuestionsLimit: number; bankAccountLimit: number }> = {};
    if (starterPriceId) {
      planMapping[starterPriceId] = { plan: 'starter', documentLimit: 25, aiQuestionsLimit: 999999, bankAccountLimit: 2 };
    }
    if (proPriceId) {
      planMapping[proPriceId] = { plan: 'pro', documentLimit: 100, aiQuestionsLimit: 999999, bankAccountLimit: 5 };
    }

    const planDetails = planMapping[priceId];
    if (!planDetails) {
      console.error(`CRITICAL: Price ID ${priceId} not found in plan mapping! Available mappings: ${JSON.stringify(Object.keys(planMapping))}`);
      throw new Error(`Unknown price ID: ${priceId}. Ensure STRIPE_STARTER_PRICE_ID and STRIPE_PRO_PRICE_ID are set.`);
    }

    console.info(`Mapped price ${priceId} to plan: ${planDetails.plan}`);

    // store subscription state in stripe_subscriptions
    const { error: subError } = await supabase.from('stripe_subscriptions').upsert(
      {
        customer_id: customerId,
        subscription_id: subscription.id,
        price_id: priceId,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        ...(subscription.default_payment_method && typeof subscription.default_payment_method !== 'string'
          ? {
              payment_method_brand: subscription.default_payment_method.card?.brand ?? null,
              payment_method_last4: subscription.default_payment_method.card?.last4 ?? null,
            }
          : {}),
        status: subscription.status,
      },
      {
        onConflict: 'customer_id',
      },
    );

    if (subError) {
      console.error('Error syncing subscription:', subError);
      throw new Error('Failed to sync subscription in database');
    }

    // Update user_subscriptions table
    const subscriptionStatus = subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : 'expired';

    const { error: userSubError } = await supabase
      .from('user_subscriptions')
      .update({
        plan: planDetails.plan,
        status: subscriptionStatus,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        document_limit: planDetails.documentLimit,
        ai_questions_limit: planDetails.aiQuestionsLimit,
        bank_account_limit: planDetails.bankAccountLimit,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (userSubError) {
      console.error('Error updating user subscription:', userSubError);
      throw new Error('Failed to update user subscription');
    }

    console.info(`Successfully synced subscription for customer: ${customerId}`);

    // Send subscription confirmation email on new subscription (free → paid)
    if (previousPlan === 'free' && (planDetails.plan === 'starter' || planDetails.plan === 'pro')) {
      try {
        // Get user email and display name
        const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId);
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('display_name')
          .eq('id', userId)
          .single();

        const userEmail = authUser?.email;
        const userName = profile?.display_name || authUser?.user_metadata?.display_name || 'there';
        const planLabel = planDetails.plan === 'pro' ? 'Pro' : 'Starter';
        const price = subscription.items.data[0].price;
        const amount = price.unit_amount ? `$${(price.unit_amount / 100).toFixed(2)}` : planDetails.plan === 'pro' ? '$19' : '$7';
        const nextBilling = new Date(subscription.current_period_end * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        if (userEmail) {
          const firstName = userName.split(' ')[0];
          const subject = `DocuIntelli AI ${planLabel} — Subscription Confirmed`;
          const html = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
              <div style="text-align:center;margin-bottom:24px;">
                <div style="display:inline-block;background:linear-gradient(135deg,#059669,#0d9488);border-radius:16px;padding:16px;">
                  <span style="font-size:32px;">🎉</span>
                </div>
              </div>
              <h1 style="text-align:center;color:#0f172a;font-size:24px;margin-bottom:8px;">Welcome to DocuIntelli AI ${planLabel}!</h1>
              <p style="text-align:center;color:#64748b;font-size:16px;margin-bottom:32px;">Hi ${firstName}, your subscription is now active.</p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:24px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:12px 16px;color:#64748b;font-size:14px;">Plan</td>
                  <td style="padding:12px 16px;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${planLabel}</td>
                </tr>
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:12px 16px;color:#64748b;font-size:14px;">Amount</td>
                  <td style="padding:12px 16px;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${amount}/month</td>
                </tr>
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:12px 16px;color:#64748b;font-size:14px;">Document limit</td>
                  <td style="padding:12px 16px;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${planDetails.documentLimit} documents</td>
                </tr>
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:12px 16px;color:#64748b;font-size:14px;">AI questions</td>
                  <td style="padding:12px 16px;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">Unlimited</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;color:#64748b;font-size:14px;">Next billing</td>
                  <td style="padding:12px 16px;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${nextBilling}</td>
                </tr>
              </table>
              <div style="text-align:center;margin-bottom:24px;">
                <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#059669,#0d9488);color:white;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:16px;">Go to Dashboard</a>
              </div>
              <p style="text-align:center;color:#94a3b8;font-size:12px;">You can manage your subscription anytime from Account Settings.</p>
            </div>
          `;

          await sendEmail(userEmail, subject, html);
          console.info(`📧 Subscription confirmation email sent to ${userEmail}`);
        }
      } catch (emailErr) {
        console.error('📧 Failed to send subscription confirmation email:', emailErr);
        // Non-blocking — don't fail the sync
      }
    }

    // Run downgrade document cleanup if a downgrade took effect
    // (e.g., paid-to-paid downgrade where the new billing cycle started at the lower price)
    if (subscription.status !== 'active' || subscription.cancel_at_period_end === false) {
      // Only run cleanup when the subscription has actually transitioned
      // (canceled, or renewed without cancel_at_period_end meaning the downgrade took effect)
      await handleDowngradeCleanup(userId);
    }

    // Sync billing data (payment methods, invoices, transactions)
    try {
      await syncBillingData(customerId, userId);
    } catch (billingError) {
      console.error('Error syncing billing data:', billingError);
      // Don't throw - billing sync is secondary to subscription sync
    }
  } catch (error) {
    console.error(`Failed to sync subscription for customer ${customerId}:`, error);
    throw error;
  }
}

/**
 * Handle document cleanup when a downgrade takes effect.
 * Reads `documents_to_keep` from user_subscriptions and deletes the rest.
 * Idempotent — safe to call multiple times.
 */
async function handleDowngradeCleanup(userId: string) {
  try {
    // Check if there's a pending downgrade with documents to keep
    const { data: userSub, error: subError } = await supabase
      .from('user_subscriptions')
      .select('pending_plan, documents_to_keep')
      .eq('user_id', userId)
      .single();

    if (subError || !userSub) {
      // columns may not exist if migration not applied — skip silently
      return;
    }

    const documentsToKeep: string[] | null = userSub.documents_to_keep;

    if (!documentsToKeep || documentsToKeep.length === 0) {
      // No document selections saved — clear pending_plan if set and return
      if (userSub.pending_plan) {
        await supabase
          .from('user_subscriptions')
          .update({ pending_plan: null, documents_to_keep: null })
          .eq('user_id', userId);
      }
      return;
    }

    console.info(`🗑️ Starting downgrade document cleanup for user ${userId}`);
    console.info(`   Keeping ${documentsToKeep.length} documents, removing the rest`);

    // Get all user's document IDs
    const { data: allDocs, error: docsError } = await supabase
      .from('documents')
      .select('id')
      .eq('user_id', userId);

    if (docsError || !allDocs) {
      console.error('Error fetching documents for cleanup:', docsError);
      return;
    }

    // Find documents to delete (NOT in the keep list)
    const docsToDelete = allDocs
      .map((d: { id: string }) => d.id)
      .filter((id: string) => !documentsToKeep.includes(id));

    if (docsToDelete.length === 0) {
      console.info('   No documents to delete');
    } else {
      console.info(`   Deleting ${docsToDelete.length} documents and their chunks/chats`);

      // Delete document chunks (embeddings) first
      const { error: chunksError } = await supabase
        .from('document_chunks')
        .delete()
        .in('document_id', docsToDelete);

      if (chunksError) {
        console.error('Error deleting document chunks:', chunksError);
      }

      // Delete document chats
      const { error: chatsError } = await supabase
        .from('document_chats')
        .delete()
        .in('document_id', docsToDelete);

      if (chatsError) {
        console.error('Error deleting document chats:', chatsError);
      }

      // Delete documents
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .in('id', docsToDelete);

      if (deleteError) {
        console.error('Error deleting documents:', deleteError);
      } else {
        console.info(`   ✅ Deleted ${docsToDelete.length} documents successfully`);
      }
    }

    // Clear pending downgrade info
    const { error: clearError } = await supabase
      .from('user_subscriptions')
      .update({
        pending_plan: null,
        documents_to_keep: null,
      })
      .eq('user_id', userId);

    if (clearError) {
      console.error('Error clearing pending downgrade:', clearError);
    }

    console.info(`✅ Downgrade cleanup complete for user ${userId}`);
  } catch (error) {
    console.error(`Downgrade cleanup failed for user ${userId}:`, error);
    // Don't throw — cleanup failure should not break the webhook
  }
}

/**
 * Sync billing data from Stripe to database
 */
async function syncBillingData(customerId: string, userId: string) {
  try {
    console.info(`Syncing billing data for customer ${customerId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(`${supabaseUrl}/functions/v1/stripe-sync-billing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        customer_id: customerId,
        user_id: userId,
      }),
    });

    if (!response.ok) {
      console.error(`Billing sync failed with status ${response.status}`);
    } else {
      console.info('Billing data synced successfully');
    }
  } catch (error) {
    console.error('Error calling billing sync function:', error);
  }
}