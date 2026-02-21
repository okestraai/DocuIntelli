import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  appInfo: {
    name: 'DocuIntelli Billing Sync',
    version: '1.0.0',
  },
});

/**
 * Sync payment methods from Stripe to database
 */
async function syncPaymentMethods(customerId: string, userId: string) {
  try {
    console.log(`Syncing payment methods for customer ${customerId}`);

    // Get payment methods from Stripe
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    // Get customer to check default payment method
    const customer = await stripe.customers.retrieve(customerId);
    const defaultPMId = typeof customer !== 'string' && customer.invoice_settings?.default_payment_method;

    // Sync each payment method
    for (const pm of paymentMethods.data) {
      const card = pm.card!;

      await supabase.from('payment_methods').upsert({
        user_id: userId,
        payment_method_id: pm.id,
        customer_id: customerId,
        type: pm.type,
        brand: card.brand,
        name_on_card: pm.billing_details?.name || null,
        last4: card.last4,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        is_default: pm.id === defaultPMId,
      }, {
        onConflict: 'payment_method_id',
      });
    }

    console.log(`Synced ${paymentMethods.data.length} payment methods`);
  } catch (error) {
    console.error('Error syncing payment methods:', error);
  }
}

/**
 * Sync invoices from Stripe to database
 */
async function syncInvoices(customerId: string, userId: string, limit: number = 10) {
  try {
    console.log(`Syncing invoices for customer ${customerId}`);

    // Get invoices from Stripe
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit,
    });

    // Sync each invoice
    for (const invoice of invoices.data) {
      await supabase.from('invoices').upsert({
        user_id: userId,
        invoice_id: invoice.id,
        customer_id: customerId,
        subscription_id: invoice.subscription as string || null,
        invoice_number: invoice.number,
        status: invoice.status,
        amount_due: invoice.amount_due,
        amount_paid: invoice.amount_paid,
        amount_remaining: invoice.amount_remaining,
        subtotal: invoice.subtotal,
        tax: invoice.tax || 0,
        total: invoice.total,
        currency: invoice.currency,
        invoice_pdf: invoice.invoice_pdf,
        hosted_invoice_url: invoice.hosted_invoice_url,
        billing_reason: invoice.billing_reason,
        due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
        paid_at: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : null,
        created_at: new Date(invoice.created * 1000).toISOString(),
      }, {
        onConflict: 'invoice_id',
      });
    }

    console.log(`Synced ${invoices.data.length} invoices`);
  } catch (error) {
    console.error('Error syncing invoices:', error);
  }
}

/**
 * Sync transactions (charges) from Stripe to database
 */
async function syncTransactions(customerId: string, userId: string, limit: number = 20) {
  try {
    console.log(`Syncing transactions for customer ${customerId}`);

    // Get charges from Stripe
    const charges = await stripe.charges.list({
      customer: customerId,
      limit,
    });

    // Sync each charge as a transaction
    for (const charge of charges.data) {
      await supabase.from('transactions').upsert({
        user_id: userId,
        transaction_id: charge.id,
        customer_id: customerId,
        invoice_id: charge.invoice as string || null,
        charge_id: charge.id,
        payment_intent_id: charge.payment_intent as string || null,
        amount: charge.amount,
        currency: charge.currency,
        status: charge.status,
        description: charge.description || null,
        receipt_url: charge.receipt_url,
        payment_method_id: charge.payment_method as string || null,
        payment_method_brand: charge.payment_method_details?.card?.brand || null,
        payment_method_last4: charge.payment_method_details?.card?.last4 || null,
        refunded: charge.refunded,
        refund_amount: charge.amount_refunded,
        failure_code: charge.failure_code,
        failure_message: charge.failure_message,
        created_at: new Date(charge.created * 1000).toISOString(),
      }, {
        onConflict: 'transaction_id',
      });
    }

    console.log(`Synced ${charges.data.length} transactions`);
  } catch (error) {
    console.error('Error syncing transactions:', error);
  }
}

/**
 * Sync single invoice (for webhook events)
 */
async function syncSingleInvoice(invoiceId: string, userId: string) {
  try {
    console.log(`Syncing single invoice ${invoiceId}`);

    const invoice = await stripe.invoices.retrieve(invoiceId);

    await supabase.from('invoices').upsert({
      user_id: userId,
      invoice_id: invoice.id,
      customer_id: invoice.customer as string,
      subscription_id: invoice.subscription as string || null,
      invoice_number: invoice.number,
      status: invoice.status,
      amount_due: invoice.amount_due,
      amount_paid: invoice.amount_paid,
      amount_remaining: invoice.amount_remaining,
      subtotal: invoice.subtotal,
      tax: invoice.tax || 0,
      total: invoice.total,
      currency: invoice.currency,
      invoice_pdf: invoice.invoice_pdf,
      hosted_invoice_url: invoice.hosted_invoice_url,
      billing_reason: invoice.billing_reason,
      due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
      paid_at: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : null,
      created_at: new Date(invoice.created * 1000).toISOString(),
    }, {
      onConflict: 'invoice_id',
    });

    console.log(`Synced invoice ${invoiceId}`);
  } catch (error) {
    console.error('Error syncing single invoice:', error);
  }
}

/**
 * Sync single charge/transaction (for webhook events)
 */
async function syncSingleCharge(chargeId: string, userId: string) {
  try {
    console.log(`Syncing single charge ${chargeId}`);

    const charge = await stripe.charges.retrieve(chargeId);

    await supabase.from('transactions').upsert({
      user_id: userId,
      transaction_id: charge.id,
      customer_id: charge.customer as string,
      invoice_id: charge.invoice as string || null,
      charge_id: charge.id,
      payment_intent_id: charge.payment_intent as string || null,
      amount: charge.amount,
      currency: charge.currency,
      status: charge.status,
      description: charge.description || null,
      receipt_url: charge.receipt_url,
      payment_method_id: charge.payment_method as string || null,
      payment_method_brand: charge.payment_method_details?.card?.brand || null,
      payment_method_last4: charge.payment_method_details?.card?.last4 || null,
      refunded: charge.refunded,
      refund_amount: charge.amount_refunded,
      failure_code: charge.failure_code,
      failure_message: charge.failure_message,
      created_at: new Date(charge.created * 1000).toISOString(),
    }, {
      onConflict: 'transaction_id',
    });

    console.log(`Synced charge ${chargeId}`);
  } catch (error) {
    console.error('Error syncing single charge:', error);
  }
}

// Helper function to create responses with CORS headers
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

    const { customer_id, user_id, sync_type, resource_id } = await req.json();

    if (!customer_id || !user_id) {
      return corsResponse({ error: 'customer_id and user_id are required' }, 400);
    }

    console.log(`Starting billing data sync for customer ${customer_id}, sync_type: ${sync_type || 'full'}`);

    // Perform sync based on type
    if (sync_type === 'payment_methods' || !sync_type) {
      await syncPaymentMethods(customer_id, user_id);
    }

    if (sync_type === 'invoices' || !sync_type) {
      await syncInvoices(customer_id, user_id);
    }

    if (sync_type === 'transactions' || !sync_type) {
      await syncTransactions(customer_id, user_id);
    }

    // Handle specific resource syncs
    if (sync_type === 'single_invoice' && resource_id) {
      await syncSingleInvoice(resource_id, user_id);
    }

    if (sync_type === 'single_charge' && resource_id) {
      await syncSingleCharge(resource_id, user_id);
    }

    return corsResponse({ success: true, message: 'Billing data synced successfully' });
  } catch (error: any) {
    console.error(`Billing sync error: ${error.message}`);
    return corsResponse({ error: error.message }, 500);
  }
});
