/**
 * Stripe Routes
 *
 * Converted from Supabase Edge Functions to Express routes.
 * Handles: checkout, customer portal, billing sync, webhooks, and upgrade checkout.
 */

import { Router, Request, Response, raw } from 'express';
import Stripe from 'stripe';
import { query, getClient } from '../services/db';
import { verifyAccessToken } from '../services/authService';
import { sendNotificationEmail, resolveUserInfo } from '../services/emailService';
import { invalidateSubscriptionCache } from '../middleware/subscriptionGuard';

const router = Router();

// ─── Stripe Client ───────────────────────────────────────────────────────────

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  appInfo: {
    name: 'DocuIntelli Billing',
    version: '1.0.0',
  },
});

// ─── Environment ─────────────────────────────────────────────────────────────

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const STRIPE_STARTER_PRICE_ID = process.env.STRIPE_STARTER_PRICE_ID;
const STRIPE_PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID;

const MAILJET_API_KEY = process.env.SMTP_USER || '';
const MAILJET_SECRET_KEY = process.env.SMTP_PASS || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@docuintelli.com';
const FROM_NAME = 'DocuIntelli AI';
const APP_URL = process.env.APP_URL || 'https://docuintelli.com';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract and verify Bearer token from Authorization header.
 * Returns { userId, email } on success, or null on failure.
 */
function extractUser(req: Request): { userId: string; email: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const token = authHeader.replace('Bearer ', '');
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

type ExpectedType = 'string' | { values: string[] };
type Expectations<T> = { [K in keyof T]: ExpectedType };

function validateParameters<T extends Record<string, unknown>>(
  values: T,
  expected: Expectations<T>,
): string | undefined {
  for (const parameter in values) {
    const expectation = expected[parameter];
    const value = values[parameter];

    if (expectation === 'string') {
      if (value == null) {
        return `Missing required parameter ${parameter}`;
      }
      if (typeof value !== 'string') {
        return `Expected parameter ${parameter} to be a string got ${JSON.stringify(value)}`;
      }
    } else {
      if (!expectation.values.includes(value as string)) {
        return `Expected parameter ${parameter} to be one of ${expectation.values.join(', ')}`;
      }
    }
  }
  return undefined;
}

/**
 * Send an email via Mailjet REST API (used by webhook for subscription confirmation).
 */
async function sendMailjetEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!MAILJET_API_KEY || !MAILJET_SECRET_KEY) {
    console.warn('[EMAIL] Mailjet not configured, skipping');
    return false;
  }
  try {
    const resp = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`).toString('base64'),
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

// ─── Plan Mapping ────────────────────────────────────────────────────────────

interface PlanDetails {
  plan: 'starter' | 'pro';
  documentLimit: number;
  aiQuestionsLimit: number;
  bankAccountLimit: number;
}

function buildPlanMapping(): Record<string, PlanDetails> {
  const mapping: Record<string, PlanDetails> = {};
  if (STRIPE_STARTER_PRICE_ID) {
    mapping[STRIPE_STARTER_PRICE_ID] = {
      plan: 'starter',
      documentLimit: 25,
      aiQuestionsLimit: 999999,
      bankAccountLimit: 2,
    };
  }
  if (STRIPE_PRO_PRICE_ID) {
    mapping[STRIPE_PRO_PRICE_ID] = {
      plan: 'pro',
      documentLimit: 100,
      aiQuestionsLimit: 999999,
      bankAccountLimit: 5,
    };
  }
  return mapping;
}

const planLimits: Record<string, Record<string, number>> = {
  free: { document_limit: 3, ai_questions_limit: 5, monthly_upload_limit: 3, bank_account_limit: 0 },
  starter: { document_limit: 25, ai_questions_limit: 999999, monthly_upload_limit: 30, bank_account_limit: 2 },
  pro: { document_limit: 100, ai_questions_limit: 999999, monthly_upload_limit: 150, bank_account_limit: 5 },
};

// =============================================================================
// POST /checkout — Create a Stripe Checkout Session
// =============================================================================

router.post('/checkout', async (req: Request, res: Response): Promise<void> => {
  try {
    const { price_id, success_url, cancel_url, mode } = req.body;

    const error = validateParameters(
      { price_id, success_url, cancel_url, mode },
      {
        cancel_url: 'string',
        price_id: 'string',
        success_url: 'string',
        mode: { values: ['payment', 'subscription'] },
      },
    );

    if (error) {
      res.status(400).json({ error });
      return;
    }

    const user = extractUser(req);
    if (!user) {
      res.status(401).json({ error: 'Failed to authenticate user' });
      return;
    }

    // Look up existing Stripe customer
    const customerResult = await query(
      `SELECT customer_id FROM stripe_customers
       WHERE user_id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [user.userId],
    );

    let customerId: string;

    if (customerResult.rows.length === 0 || !customerResult.rows[0].customer_id) {
      // Create new Stripe customer
      const newCustomer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.userId },
      });

      console.log(`Created new Stripe customer ${newCustomer.id} for user ${user.userId}`);

      try {
        await query(
          `INSERT INTO stripe_customers (user_id, customer_id) VALUES ($1, $2)`,
          [user.userId, newCustomer.id],
        );
      } catch (insertErr) {
        console.error('Failed to save customer mapping in the database', insertErr);
        // Clean up Stripe customer
        try {
          await stripe.customers.del(newCustomer.id);
          await query(`DELETE FROM stripe_subscriptions WHERE customer_id = $1`, [newCustomer.id]);
        } catch (cleanupErr) {
          console.error('Failed to clean up after customer mapping error:', cleanupErr);
        }
        res.status(500).json({ error: 'Failed to create customer mapping' });
        return;
      }

      if (mode === 'subscription') {
        try {
          await query(
            `INSERT INTO stripe_subscriptions (customer_id, status) VALUES ($1, $2)`,
            [newCustomer.id, 'not_started'],
          );
        } catch (subInsertErr) {
          console.error('Failed to save subscription in the database', subInsertErr);
          try {
            await stripe.customers.del(newCustomer.id);
          } catch (cleanupErr) {
            console.error('Failed to delete Stripe customer after subscription creation error:', cleanupErr);
          }
          res.status(500).json({ error: 'Unable to save the subscription in the database' });
          return;
        }
      }

      customerId = newCustomer.id;
      console.log(`Successfully set up new customer ${customerId} with subscription record`);
    } else {
      customerId = customerResult.rows[0].customer_id;

      if (mode === 'subscription') {
        // Verify subscription record exists for existing customer
        const subResult = await query(
          `SELECT status FROM stripe_subscriptions WHERE customer_id = $1 LIMIT 1`,
          [customerId],
        );

        if (subResult.rows.length === 0) {
          await query(
            `INSERT INTO stripe_subscriptions (customer_id, status) VALUES ($1, $2)`,
            [customerId, 'not_started'],
          );
        }
      }
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: price_id, quantity: 1 }],
      mode,
      success_url: `${success_url}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url,
      billing_address_collection: 'auto',
      allow_promotion_codes: true,
      customer_update: { address: 'auto' },
      ...(mode === 'subscription' && {
        subscription_data: {
          metadata: { user_id: user.userId },
        },
      }),
      metadata: {
        user_id: user.userId,
        user_email: user.email,
      },
    });

    console.log(`Created checkout session ${session.id} for customer ${customerId} (mode: ${mode})`);

    res.json({ sessionId: session.id, url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Checkout error: ${message}`);
    res.status(500).json({ error: message });
  }
});

// =============================================================================
// POST /customer-portal — Create a Stripe Customer Portal Session
// =============================================================================

router.post('/customer-portal', async (req: Request, res: Response): Promise<void> => {
  try {
    const { return_url } = req.body;

    if (!return_url || typeof return_url !== 'string') {
      res.status(400).json({ error: 'return_url is required' });
      return;
    }

    const user = extractUser(req);
    if (!user) {
      res.status(401).json({ error: 'Failed to authenticate user' });
      return;
    }

    // Get customer ID
    const customerResult = await query(
      `SELECT customer_id FROM stripe_customers
       WHERE user_id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [user.userId],
    );

    if (customerResult.rows.length === 0 || !customerResult.rows[0].customer_id) {
      res.status(404).json({ error: 'No Stripe customer found. Please subscribe first.' });
      return;
    }

    let customerId = customerResult.rows[0].customer_id;

    // Verify customer still exists in Stripe (may have been deleted externally)
    try {
      const existing = await stripe.customers.retrieve(customerId);
      if ((existing as any).deleted) {
        console.log(`Stripe customer ${customerId} was deleted — recreating for user ${user.userId}`);
        const newCustomer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.userId },
        });
        customerId = newCustomer.id;

        // Update both tables with new customer ID
        await query(
          `UPDATE stripe_customers SET customer_id = $1, updated_at = NOW() WHERE user_id = $2`,
          [customerId, user.userId],
        );
        await query(
          `UPDATE user_subscriptions SET stripe_customer_id = $1 WHERE user_id = $2`,
          [customerId, user.userId],
        );
        console.log(`Recreated Stripe customer ${customerId} for user ${user.userId}`);
      }
    } catch (retrieveErr: any) {
      if (retrieveErr.code === 'resource_missing') {
        console.log(`Stripe customer ${customerId} not found — recreating for user ${user.userId}`);
        const newCustomer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.userId },
        });
        customerId = newCustomer.id;

        await query(
          `UPDATE stripe_customers SET customer_id = $1, updated_at = NOW() WHERE user_id = $2`,
          [customerId, user.userId],
        );
        await query(
          `UPDATE user_subscriptions SET stripe_customer_id = $1 WHERE user_id = $2`,
          [customerId, user.userId],
        );
        console.log(`Recreated Stripe customer ${customerId} for user ${user.userId}`);
      } else {
        throw retrieveErr;
      }
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url,
    });

    console.log(`Created portal session for customer ${customerId}`);

    res.json({ url: portalSession.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Portal error: ${message}`);
    res.status(500).json({ error: message });
  }
});

// =============================================================================
// POST /sync-billing — Sync payment methods, invoices, and transactions
// =============================================================================

router.post('/sync-billing', async (req: Request, res: Response): Promise<void> => {
  try {
    let { customer_id, user_id, sync_type, resource_id } = req.body;

    // If customer_id/user_id not provided in body, resolve from JWT auth
    if (!customer_id || !user_id) {
      const user = extractUser(req);
      if (!user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      user_id = user.userId;

      // Look up stripe customer from user_subscriptions or stripe_customers
      const custResult = await query(
        `SELECT customer_id FROM stripe_customers WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1`,
        [user_id]
      );
      if (custResult.rows.length > 0) {
        customer_id = custResult.rows[0].customer_id;
      } else {
        // Fallback: check user_subscriptions for stripe_customer_id
        const subResult = await query(
          `SELECT stripe_customer_id FROM user_subscriptions WHERE user_id = $1`,
          [user_id]
        );
        if (subResult.rows.length > 0 && subResult.rows[0].stripe_customer_id) {
          customer_id = subResult.rows[0].stripe_customer_id;
          // Also seed the stripe_customers table for future lookups
          await query(
            `INSERT INTO stripe_customers (user_id, customer_id) VALUES ($1, $2)
             ON CONFLICT (user_id) DO UPDATE SET customer_id = $2, updated_at = NOW()`,
            [user_id, customer_id]
          );
        }
      }

      if (!customer_id) {
        res.json({ success: true, message: 'No Stripe customer found — nothing to sync' });
        return;
      }
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

    res.json({ success: true, message: 'Billing data synced successfully' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Billing sync error: ${message}`);
    res.status(500).json({ error: message });
  }
});

// =============================================================================
// POST /webhook — Stripe Webhook (raw body, no auth)
// =============================================================================

router.post('/webhook', raw({ type: 'application/json' }), async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['stripe-signature'] as string | undefined;

    if (!signature) {
      res.status(400).json({ error: 'No signature found' });
      return;
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (verifyErr: unknown) {
      const message = verifyErr instanceof Error ? verifyErr.message : 'Unknown error';
      console.error(`Webhook signature verification failed: ${message}`);
      res.status(400).json({ error: `Webhook signature verification failed: ${message}` });
      return;
    }

    // Handle the event — await so errors propagate as HTTP 500
    await handleWebhookEvent(event);

    res.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error processing webhook:', err);
    res.status(500).json({ error: message });
  }
});

// =============================================================================
// POST /create-upgrade — Create an upgrade checkout session (Starter → Pro)
// =============================================================================

router.post('/create-upgrade', async (req: Request, res: Response): Promise<void> => {
  try {
    const { success_url, cancel_url } = req.body;

    if (!success_url || typeof success_url !== 'string') {
      res.status(400).json({ error: 'Missing required parameter: success_url' });
      return;
    }
    if (!cancel_url || typeof cancel_url !== 'string') {
      res.status(400).json({ error: 'Missing required parameter: cancel_url' });
      return;
    }

    const user = extractUser(req);
    if (!user) {
      res.status(401).json({ error: 'Failed to authenticate user' });
      return;
    }

    // Get Stripe customer ID
    const customerResult = await query(
      `SELECT customer_id FROM stripe_customers
       WHERE user_id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [user.userId],
    );

    if (customerResult.rows.length === 0 || !customerResult.rows[0].customer_id) {
      res.status(400).json({ error: 'No active subscription found. Please subscribe to a plan first.' });
      return;
    }

    const customerId = customerResult.rows[0].customer_id;

    // Get current subscription from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      res.status(400).json({ error: 'No active subscription found' });
      return;
    }

    const subscription = subscriptions.data[0];
    const currentPriceId = subscription.items.data[0].price.id;

    if (!STRIPE_PRO_PRICE_ID || !STRIPE_STARTER_PRICE_ID) {
      console.error('CRITICAL: STRIPE_STARTER_PRICE_ID or STRIPE_PRO_PRICE_ID not set');
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    // Verify user is on the Starter plan
    if (currentPriceId === STRIPE_PRO_PRICE_ID) {
      res.status(400).json({ error: 'You are already on the Pro plan' });
      return;
    }
    if (currentPriceId !== STRIPE_STARTER_PRICE_ID) {
      res.status(400).json({ error: 'Upgrade checkout is only available for Starter plan subscribers' });
      return;
    }

    console.log(`Creating upgrade checkout for user ${user.userId}, subscription ${subscription.id}`);

    // Calculate proration
    const currentPrice = subscription.items.data[0].price;
    const proPrice = await stripe.prices.retrieve(STRIPE_PRO_PRICE_ID);

    const starterAmount = currentPrice.unit_amount!;
    const proAmount = proPrice.unit_amount!;
    const currency = currentPrice.currency;

    const periodStart = (subscription as any).current_period_start as number;
    const periodEnd = (subscription as any).current_period_end as number;
    const now = Math.floor(Date.now() / 1000);

    const totalSeconds = periodEnd - periodStart;
    const usedSeconds = now - periodStart;
    const remainingSeconds = Math.max(totalSeconds - usedSeconds, 0);

    const totalDays = totalSeconds / 86400;
    const daysUsed = usedSeconds / 86400;
    const daysRemaining = remainingSeconds / 86400;

    const priceDifference = proAmount - starterAmount;
    const proratedAmount = Math.round((daysRemaining / totalDays) * priceDifference);

    console.log(
      `Proration: totalDays=${totalDays.toFixed(1)}, daysUsed=${daysUsed.toFixed(1)}, ` +
      `daysRemaining=${daysRemaining.toFixed(1)}, starter=${starterAmount}, pro=${proAmount}, ` +
      `diff=${priceDifference}, proratedAmount=${proratedAmount} ${currency}`,
    );

    // If prorated amount is zero or negative, switch directly
    if (proratedAmount <= 0) {
      await stripe.subscriptions.cancel(subscription.id);
      console.log(`Canceled Starter subscription ${subscription.id}`);

      const newSub = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: STRIPE_PRO_PRICE_ID }],
        trial_end: periodEnd,
        metadata: {
          upgraded_from: 'starter',
          previous_subscription_id: subscription.id,
        },
      });
      console.log(`Created new Pro subscription ${newSub.id} with trial_end=${periodEnd}`);

      res.json({
        upgraded_directly: true,
        prorated_amount: 0,
        currency,
        current_plan: 'starter',
        new_plan: 'pro',
      });
      return;
    }

    // Create Checkout Session for the prorated amount
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: 'Upgrade to Pro Plan',
              description: `Prorated charge for ${Math.ceil(daysRemaining)} remaining days of your billing period`,
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
            user_id: user.userId,
          },
        },
      },
      metadata: {
        type: 'subscription_upgrade',
        user_id: user.userId,
        customer_id: customerId,
        subscription_id: subscription.id,
        target_price_id: STRIPE_PRO_PRICE_ID,
        period_end: String((subscription as any).current_period_end),
      },
      payment_intent_data: {
        metadata: {
          type: 'subscription_upgrade',
          user_id: user.userId,
          customer_id: customerId,
          subscription_id: subscription.id,
          target_price_id: STRIPE_PRO_PRICE_ID,
          period_end: String((subscription as any).current_period_end),
        },
      },
      success_url: `${success_url}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url,
    });

    console.log(`Created upgrade checkout session ${session.id} for customer ${customerId}`);

    res.json({
      url: session.url,
      sessionId: session.id,
      prorated_amount: proratedAmount,
      currency,
      current_plan: 'starter',
      new_plan: 'pro',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Upgrade checkout error: ${message}`);
    res.status(500).json({ error: 'Failed to create upgrade session. Please try again.' });
  }
});

// =============================================================================
// Billing Sync Helpers
// =============================================================================

async function syncPaymentMethods(customerId: string, userId: string): Promise<void> {
  try {
    console.log(`Syncing payment methods for customer ${customerId}`);

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    const customer = await stripe.customers.retrieve(customerId) as any;
    const defaultPMId = customer?.invoice_settings?.default_payment_method;

    for (const pm of paymentMethods.data) {
      const card = pm.card!;

      await query(
        `INSERT INTO payment_methods (user_id, payment_method_id, customer_id, type, brand, name_on_card, last4, exp_month, exp_year, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (payment_method_id) DO UPDATE SET
           type = EXCLUDED.type,
           brand = EXCLUDED.brand,
           name_on_card = EXCLUDED.name_on_card,
           last4 = EXCLUDED.last4,
           exp_month = EXCLUDED.exp_month,
           exp_year = EXCLUDED.exp_year,
           is_default = EXCLUDED.is_default`,
        [
          userId,
          pm.id,
          customerId,
          pm.type,
          card.brand,
          pm.billing_details?.name || null,
          card.last4,
          card.exp_month,
          card.exp_year,
          pm.id === defaultPMId,
        ],
      );
    }

    console.log(`Synced ${paymentMethods.data.length} payment methods`);
  } catch (error) {
    console.error('Error syncing payment methods:', error);
  }
}

async function syncInvoices(customerId: string, userId: string, limit: number = 10): Promise<void> {
  try {
    console.log(`Syncing invoices for customer ${customerId}`);

    const invoices = await stripe.invoices.list({ customer: customerId, limit });

    for (const rawInvoice of invoices.data) {
      const invoice = rawInvoice as any;
      await query(
        `INSERT INTO invoices (user_id, invoice_id, customer_id, subscription_id, invoice_number, status,
           amount_due, amount_paid, amount_remaining, subtotal, tax, total, currency,
           invoice_pdf, hosted_invoice_url, billing_reason, due_date, paid_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (invoice_id) DO UPDATE SET
           status = EXCLUDED.status,
           amount_due = EXCLUDED.amount_due,
           amount_paid = EXCLUDED.amount_paid,
           amount_remaining = EXCLUDED.amount_remaining,
           subtotal = EXCLUDED.subtotal,
           tax = EXCLUDED.tax,
           total = EXCLUDED.total,
           invoice_pdf = EXCLUDED.invoice_pdf,
           hosted_invoice_url = EXCLUDED.hosted_invoice_url,
           paid_at = EXCLUDED.paid_at`,
        [
          userId,
          invoice.id,
          customerId,
          (invoice.subscription as string) || null,
          invoice.number,
          invoice.status,
          invoice.amount_due,
          invoice.amount_paid,
          invoice.amount_remaining,
          invoice.subtotal,
          invoice.tax || 0,
          invoice.total,
          invoice.currency,
          invoice.invoice_pdf,
          invoice.hosted_invoice_url,
          invoice.billing_reason,
          invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
          invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : null,
          new Date(invoice.created * 1000).toISOString(),
        ],
      );
    }

    console.log(`Synced ${invoices.data.length} invoices`);
  } catch (error) {
    console.error('Error syncing invoices:', error);
  }
}

async function syncTransactions(customerId: string, userId: string, limit: number = 20): Promise<void> {
  try {
    console.log(`Syncing transactions for customer ${customerId}`);

    const charges = await stripe.charges.list({ customer: customerId, limit });

    for (const rawCharge of charges.data) {
      const charge = rawCharge as any;
      await query(
        `INSERT INTO transactions (user_id, transaction_id, customer_id, invoice_id, charge_id,
           payment_intent_id, amount, currency, status, description, receipt_url,
           payment_method_id, payment_method_brand, payment_method_last4,
           refunded, refund_amount, failure_code, failure_message, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (transaction_id) DO UPDATE SET
           status = EXCLUDED.status,
           refunded = EXCLUDED.refunded,
           refund_amount = EXCLUDED.refund_amount,
           failure_code = EXCLUDED.failure_code,
           failure_message = EXCLUDED.failure_message,
           receipt_url = EXCLUDED.receipt_url`,
        [
          userId,
          charge.id,
          customerId,
          (charge.invoice as string) || null,
          charge.id,
          (charge.payment_intent as string) || null,
          charge.amount,
          charge.currency,
          charge.status,
          charge.description || null,
          charge.receipt_url,
          (charge.payment_method as string) || null,
          charge.payment_method_details?.card?.brand || null,
          charge.payment_method_details?.card?.last4 || null,
          charge.refunded,
          charge.amount_refunded,
          charge.failure_code,
          charge.failure_message,
          new Date(charge.created * 1000).toISOString(),
        ],
      );
    }

    console.log(`Synced ${charges.data.length} transactions`);
  } catch (error) {
    console.error('Error syncing transactions:', error);
  }
}

async function syncSingleInvoice(invoiceId: string, userId: string): Promise<void> {
  try {
    console.log(`Syncing single invoice ${invoiceId}`);

    const invoice = await stripe.invoices.retrieve(invoiceId) as any;

    await query(
      `INSERT INTO invoices (user_id, invoice_id, customer_id, subscription_id, invoice_number, status,
         amount_due, amount_paid, amount_remaining, subtotal, tax, total, currency,
         invoice_pdf, hosted_invoice_url, billing_reason, due_date, paid_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (invoice_id) DO UPDATE SET
         status = EXCLUDED.status,
         amount_due = EXCLUDED.amount_due,
         amount_paid = EXCLUDED.amount_paid,
         amount_remaining = EXCLUDED.amount_remaining,
         subtotal = EXCLUDED.subtotal,
         tax = EXCLUDED.tax,
         total = EXCLUDED.total,
         invoice_pdf = EXCLUDED.invoice_pdf,
         hosted_invoice_url = EXCLUDED.hosted_invoice_url,
         paid_at = EXCLUDED.paid_at`,
      [
        userId,
        invoice.id,
        invoice.customer as string,
        (invoice.subscription as string) || null,
        invoice.number,
        invoice.status,
        invoice.amount_due,
        invoice.amount_paid,
        invoice.amount_remaining,
        invoice.subtotal,
        invoice.tax || 0,
        invoice.total,
        invoice.currency,
        invoice.invoice_pdf,
        invoice.hosted_invoice_url,
        invoice.billing_reason,
        invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
        invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : null,
        new Date(invoice.created * 1000).toISOString(),
      ],
    );

    console.log(`Synced invoice ${invoiceId}`);
  } catch (error) {
    console.error('Error syncing single invoice:', error);
  }
}

async function syncSingleCharge(chargeId: string, userId: string): Promise<void> {
  try {
    console.log(`Syncing single charge ${chargeId}`);

    const charge = await stripe.charges.retrieve(chargeId) as any;

    await query(
      `INSERT INTO transactions (user_id, transaction_id, customer_id, invoice_id, charge_id,
         payment_intent_id, amount, currency, status, description, receipt_url,
         payment_method_id, payment_method_brand, payment_method_last4,
         refunded, refund_amount, failure_code, failure_message, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (transaction_id) DO UPDATE SET
         status = EXCLUDED.status,
         refunded = EXCLUDED.refunded,
         refund_amount = EXCLUDED.refund_amount,
         failure_code = EXCLUDED.failure_code,
         failure_message = EXCLUDED.failure_message,
         receipt_url = EXCLUDED.receipt_url`,
      [
        userId,
        charge.id,
        charge.customer as string,
        (charge.invoice as string) || null,
        charge.id,
        (charge.payment_intent as string) || null,
        charge.amount,
        charge.currency,
        charge.status,
        charge.description || null,
        charge.receipt_url,
        (charge.payment_method as string) || null,
        charge.payment_method_details?.card?.brand || null,
        charge.payment_method_details?.card?.last4 || null,
        charge.refunded,
        charge.amount_refunded,
        charge.failure_code,
        charge.failure_message,
        new Date(charge.created * 1000).toISOString(),
      ],
    );

    console.log(`Synced charge ${chargeId}`);
  } catch (error) {
    console.error('Error syncing single charge:', error);
  }
}

// =============================================================================
// Webhook Event Handler
// =============================================================================

async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  console.info(`Webhook event received: type=${event.type}, id=${event.id}`);

  const stripeData = event?.data?.object as unknown as Record<string, unknown> | undefined;

  if (!stripeData) {
    return;
  }

  if (!('customer' in stripeData)) {
    console.info(`Skipping event ${event.type} — no customer field`);
    return;
  }

  // Skip payment_intent.succeeded events handled elsewhere
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as any;
    if (pi.invoice === null || pi.metadata?.type === 'subscription_upgrade') {
      return;
    }
  }

  const customerId = stripeData.customer as string | undefined;

  if (!customerId || typeof customerId !== 'string') {
    console.error(`No customer received on event: ${JSON.stringify(event)}`);
    return;
  }

  let isSubscription = true;

  if (event.type === 'checkout.session.completed') {
    const sessionData = stripeData as unknown as Stripe.Checkout.Session;
    isSubscription = sessionData.mode === 'subscription';
    console.info(`Processing ${isSubscription ? 'subscription' : 'one-time payment'} checkout session`);
  }

  // Log subscription update events
  if (event.type === 'customer.subscription.updated') {
    const sub = stripeData as unknown as Stripe.Subscription;
    const priceId = sub.items?.data?.[0]?.price?.id;
    console.info(`Subscription updated for customer ${customerId}: price=${priceId}, status=${sub.status}`);
  }

  // Log invoice.paid events
  if (event.type === 'invoice.paid') {
    const invoice = stripeData as unknown as Stripe.Invoice;
    console.info(`Invoice paid for customer ${customerId}: amount=${invoice.amount_paid}, billing_reason=${invoice.billing_reason}`);
  }

  // ── Dunning: payment failure → start dunning flow ──
  if (event.type === 'invoice.payment_failed') {
    const invoice = stripeData as unknown as Stripe.Invoice;
    console.info(`[DUNNING] invoice.payment_failed for customer ${customerId}, attempt=${invoice.attempt_count}`);

    const custResult = await query(
      `SELECT user_id FROM stripe_customers WHERE customer_id = $1`,
      [customerId],
    );

    if (custResult.rows.length > 0) {
      const userId = custResult.rows[0].user_id;

      const subResult = await query(
        `SELECT payment_status, plan FROM user_subscriptions WHERE user_id = $1`,
        [userId],
      );

      if (subResult.rows.length > 0) {
        const sub = subResult.rows[0];
        if (sub.payment_status === 'active' && sub.plan !== 'free') {
          const failureReason = 'Payment failed';

          await query(
            `UPDATE user_subscriptions SET
               payment_status = 'past_due',
               payment_failed_at = $1,
               dunning_step = 1,
               updated_at = $1
             WHERE user_id = $2`,
            [new Date().toISOString(), userId],
          );

          await query(
            `INSERT INTO dunning_log (user_id, step, action, details) VALUES ($1, $2, $3, $4)`,
            [userId, 1, 'dunning_started', JSON.stringify({
              failureReason,
              invoiceId: invoice.id,
              attemptCount: invoice.attempt_count,
            })],
          );

          console.info(`[DUNNING] Started dunning for user ${userId}`);
        }
      }
    }
  }

  // ── Dunning: payment success → recover from dunning ──
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
    const custResult = await query(
      `SELECT user_id FROM stripe_customers WHERE customer_id = $1`,
      [customerId],
    );

    if (custResult.rows.length > 0) {
      const userId = custResult.rows[0].user_id;

      const subResult = await query(
        `SELECT payment_status, dunning_step, previous_plan, plan FROM user_subscriptions WHERE user_id = $1`,
        [userId],
      );

      if (subResult.rows.length > 0) {
        const sub = subResult.rows[0];
        if (sub.payment_status !== 'active' && sub.dunning_step > 0 && sub.dunning_step < 8) {
          const restoredPlan = sub.previous_plan || sub.plan;
          const limits = planLimits[restoredPlan] || planLimits.free;

          await query(
            `UPDATE user_subscriptions SET
               payment_status = 'active',
               dunning_step = 0,
               payment_failed_at = NULL,
               restricted_at = NULL,
               downgraded_at = NULL,
               previous_plan = NULL,
               deletion_scheduled_at = NULL,
               plan = $1,
               status = 'active',
               document_limit = $2,
               ai_questions_limit = $3,
               monthly_upload_limit = $4,
               bank_account_limit = $5,
               updated_at = $6
             WHERE user_id = $7`,
            [
              restoredPlan,
              limits.document_limit,
              limits.ai_questions_limit,
              limits.monthly_upload_limit,
              limits.bank_account_limit,
              new Date().toISOString(),
              userId,
            ],
          );

          await query(
            `INSERT INTO dunning_log (user_id, step, action, details) VALUES ($1, $2, $3, $4)`,
            [userId, sub.dunning_step, 'recovered', JSON.stringify({
              restoredPlan,
              trigger: event.type,
            })],
          );

          console.info(`[DUNNING] Recovered user ${userId} -> ${restoredPlan}`);
        }
      }
    }
  }

  const sessionData = stripeData as unknown as Stripe.Checkout.Session;
  const { mode, payment_status, metadata } = sessionData;

  console.info(`Event routing: type=${event.type}, isSubscription=${isSubscription}, mode=${mode}, payment_status=${payment_status}, metadata_type=${metadata?.type}`);

  if (isSubscription) {
    console.info(`Starting subscription sync for customer: ${customerId}`);
    await syncCustomerFromStripe(customerId);
  } else if (mode === 'payment' && payment_status === 'paid') {
    // Legacy subscription upgrade checkout
    if (metadata?.type === 'subscription_upgrade') {
      console.info(`Legacy subscription_upgrade checkout completed for customer ${customerId}. Syncing subscription state.`);
      await syncCustomerFromStripe(customerId);
    } else {
      try {
        // Regular one-time payment
        const {
          id: checkout_session_id,
          payment_intent,
          amount_subtotal,
          amount_total,
          currency,
        } = sessionData;

        await query(
          `INSERT INTO stripe_orders (checkout_session_id, payment_intent_id, customer_id, amount_subtotal, amount_total, currency, payment_status, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            checkout_session_id,
            payment_intent,
            customerId,
            amount_subtotal,
            amount_total,
            currency,
            payment_status,
            'completed',
          ],
        );

        console.info(`Successfully processed one-time payment for session: ${checkout_session_id}`);
      } catch (error) {
        console.error('Error processing one-time payment:', error);
      }
    }
  }
}

// =============================================================================
// syncCustomerFromStripe — Core subscription sync
// =============================================================================

async function syncCustomerFromStripe(customerId: string): Promise<void> {
  try {
    // Fetch latest non-canceled subscription first
    let subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      expand: ['data.default_payment_method'],
    });

    // If no active subscriptions, check all (including canceled)
    if (subscriptions.data.length === 0) {
      subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
        status: 'all',
        expand: ['data.default_payment_method'],
      });
    }

    // Get user_id from stripe_customers
    const customerResult = await query(
      `SELECT user_id FROM stripe_customers WHERE customer_id = $1`,
      [customerId],
    );

    if (customerResult.rows.length === 0) {
      console.error('Error fetching customer data: no row found');
      throw new Error('Failed to fetch customer data');
    }

    const userId = customerResult.rows[0].user_id;

    // Fetch current plan BEFORE sync to detect free -> paid transitions
    const prevSubResult = await query(
      `SELECT plan FROM user_subscriptions WHERE user_id = $1`,
      [userId],
    );
    const previousPlan = prevSubResult.rows.length > 0 ? prevSubResult.rows[0].plan : 'free';

    if (subscriptions.data.length === 0) {
      console.info(`No active subscriptions found for customer: ${customerId}`);

      await query(
        `INSERT INTO stripe_subscriptions (customer_id, subscription_status)
         VALUES ($1, $2)
         ON CONFLICT (customer_id) DO UPDATE SET subscription_status = EXCLUDED.subscription_status`,
        [customerId, 'not_started'],
      );

      // Update user_subscriptions to free plan
      console.info(`Setting user ${userId} to free plan (no active subscription)`);
      await query(
        `UPDATE user_subscriptions SET
           plan = 'free',
           status = 'active',
           document_limit = 3,
           ai_questions_limit = 5,
           bank_account_limit = 0,
           stripe_customer_id = $1,
           stripe_subscription_id = NULL,
           stripe_price_id = NULL,
           updated_at = $2
         WHERE user_id = $3`,
        [customerId, new Date().toISOString(), userId],
      );

      await handleDowngradeCleanup(userId);
      await invalidateSubscriptionCache(userId);
      return;
    }

    // Assumes a customer can only have a single subscription
    // Cast to any because Stripe v20 types removed some properties that still exist at runtime
    const subscription = subscriptions.data[0] as any;
    const priceId = subscription.items.data[0].price.id as string;

    console.info(`Environment price IDs: starter=${STRIPE_STARTER_PRICE_ID}, pro=${STRIPE_PRO_PRICE_ID}, actual=${priceId}`);

    if (!STRIPE_STARTER_PRICE_ID || !STRIPE_PRO_PRICE_ID) {
      console.error('CRITICAL: STRIPE_STARTER_PRICE_ID or STRIPE_PRO_PRICE_ID not set in environment!');
    }

    const planMapping = buildPlanMapping();
    const planDetails = planMapping[priceId];
    if (!planDetails) {
      console.error(`CRITICAL: Price ID ${priceId} not found in plan mapping! Available: ${JSON.stringify(Object.keys(planMapping))}`);
      throw new Error(`Unknown price ID: ${priceId}. Ensure STRIPE_STARTER_PRICE_ID and STRIPE_PRO_PRICE_ID are set.`);
    }

    console.info(`Mapped price ${priceId} to plan: ${planDetails.plan}`);

    // Store subscription state in stripe_subscriptions
    const pmBrand = subscription.default_payment_method && typeof subscription.default_payment_method !== 'string'
      ? (subscription.default_payment_method as Stripe.PaymentMethod).card?.brand ?? null
      : null;
    const pmLast4 = subscription.default_payment_method && typeof subscription.default_payment_method !== 'string'
      ? (subscription.default_payment_method as Stripe.PaymentMethod).card?.last4 ?? null
      : null;

    await query(
      `INSERT INTO stripe_subscriptions (customer_id, subscription_id, price_id, current_period_start,
         current_period_end, cancel_at_period_end, payment_method_brand, payment_method_last4, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (customer_id) DO UPDATE SET
         subscription_id = EXCLUDED.subscription_id,
         price_id = EXCLUDED.price_id,
         current_period_start = EXCLUDED.current_period_start,
         current_period_end = EXCLUDED.current_period_end,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         payment_method_brand = EXCLUDED.payment_method_brand,
         payment_method_last4 = EXCLUDED.payment_method_last4,
         status = EXCLUDED.status`,
      [
        customerId,
        subscription.id,
        priceId,
        subscription.current_period_start,
        subscription.current_period_end,
        subscription.cancel_at_period_end,
        pmBrand,
        pmLast4,
        subscription.status,
      ],
    );

    // Update user_subscriptions table
    const subscriptionStatus = subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : 'expired';

    await query(
      `UPDATE user_subscriptions SET
         plan = $1,
         status = $2,
         stripe_customer_id = $3,
         stripe_subscription_id = $4,
         stripe_price_id = $5,
         current_period_start = $6,
         current_period_end = $7,
         cancel_at_period_end = $8,
         document_limit = $9,
         ai_questions_limit = $10,
         bank_account_limit = $11,
         updated_at = $12
       WHERE user_id = $13`,
      [
        planDetails.plan,
        subscriptionStatus,
        customerId,
        subscription.id,
        priceId,
        new Date(subscription.current_period_start * 1000).toISOString(),
        new Date(subscription.current_period_end * 1000).toISOString(),
        subscription.cancel_at_period_end,
        planDetails.documentLimit,
        planDetails.aiQuestionsLimit,
        planDetails.bankAccountLimit,
        new Date().toISOString(),
        userId,
      ],
    );

    console.info(`Successfully synced subscription for customer: ${customerId}`);

    // Invalidate subscription cache
    await invalidateSubscriptionCache(userId);

    // Send subscription confirmation email on new subscription (free -> paid)
    if (previousPlan === 'free' && (planDetails.plan === 'starter' || planDetails.plan === 'pro')) {
      try {
        const userInfo = await resolveUserInfo(userId);
        const userEmail = userInfo?.email;
        const userName = userInfo?.userName || 'there';
        const planLabel = planDetails.plan === 'pro' ? 'Pro' : 'Starter';
        const price = subscription.items.data[0].price;
        const amount = price.unit_amount ? `$${(price.unit_amount / 100).toFixed(2)}` : planDetails.plan === 'pro' ? '$19' : '$7';
        const nextBilling = new Date(subscription.current_period_end * 1000).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric',
        });

        if (userEmail) {
          const firstName = userName.split(' ')[0];
          const subject = `DocuIntelli AI ${planLabel} — Subscription Confirmed`;
          const html = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
              <div style="text-align:center;margin-bottom:24px;">
                <div style="display:inline-block;background:linear-gradient(135deg,#059669,#0d9488);border-radius:16px;padding:16px;">
                  <span style="font-size:32px;">&#127881;</span>
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

          await sendMailjetEmail(userEmail, subject, html);
          console.info(`Subscription confirmation email sent to ${userEmail}`);
        }
      } catch (emailErr) {
        console.error('Failed to send subscription confirmation email:', emailErr);
        // Non-blocking
      }
    }

    // Run downgrade document cleanup if applicable
    if (subscription.status !== 'active' || subscription.cancel_at_period_end === false) {
      await handleDowngradeCleanup(userId);
    }

    // Sync billing data (payment methods, invoices, transactions)
    try {
      await syncPaymentMethods(customerId, userId);
      await syncInvoices(customerId, userId);
      await syncTransactions(customerId, userId);
    } catch (billingError) {
      console.error('Error syncing billing data:', billingError);
      // Non-blocking — billing sync is secondary to subscription sync
    }
  } catch (error) {
    console.error(`Failed to sync subscription for customer ${customerId}:`, error);
    throw error;
  }
}

// =============================================================================
// Downgrade Cleanup
// =============================================================================

async function handleDowngradeCleanup(userId: string): Promise<void> {
  try {
    const subResult = await query(
      `SELECT pending_plan, documents_to_keep FROM user_subscriptions WHERE user_id = $1`,
      [userId],
    );

    if (subResult.rows.length === 0) {
      return;
    }

    const userSub = subResult.rows[0];
    const documentsToKeep: string[] | null = userSub.documents_to_keep;

    if (!documentsToKeep || documentsToKeep.length === 0) {
      if (userSub.pending_plan) {
        await query(
          `UPDATE user_subscriptions SET pending_plan = NULL, documents_to_keep = NULL WHERE user_id = $1`,
          [userId],
        );
      }
      return;
    }

    console.info(`Starting downgrade document cleanup for user ${userId}`);
    console.info(`  Keeping ${documentsToKeep.length} documents, removing the rest`);

    // Get all user's document IDs
    const docsResult = await query(
      `SELECT id FROM documents WHERE user_id = $1`,
      [userId],
    );

    if (docsResult.rows.length === 0) {
      return;
    }

    // Find documents to delete (NOT in the keep list)
    const docsToDelete = docsResult.rows
      .map((d: { id: string }) => d.id)
      .filter((id: string) => !documentsToKeep.includes(id));

    if (docsToDelete.length === 0) {
      console.info('  No documents to delete');
    } else {
      console.info(`  Deleting ${docsToDelete.length} documents and their chunks/chats`);

      // Build the $N placeholders for the IN clause
      const placeholders = docsToDelete.map((_: string, i: number) => `$${i + 1}`).join(',');

      // Delete document chunks (embeddings) first
      try {
        await query(`DELETE FROM document_chunks WHERE document_id IN (${placeholders})`, docsToDelete);
      } catch (err) {
        console.error('Error deleting document chunks:', err);
      }

      // Delete document chats
      try {
        await query(`DELETE FROM document_chats WHERE document_id IN (${placeholders})`, docsToDelete);
      } catch (err) {
        console.error('Error deleting document chats:', err);
      }

      // Delete documents
      try {
        await query(`DELETE FROM documents WHERE id IN (${placeholders})`, docsToDelete);
        console.info(`  Deleted ${docsToDelete.length} documents successfully`);
      } catch (err) {
        console.error('Error deleting documents:', err);
      }
    }

    // Clear pending downgrade info
    try {
      await query(
        `UPDATE user_subscriptions SET pending_plan = NULL, documents_to_keep = NULL WHERE user_id = $1`,
        [userId],
      );
    } catch (err) {
      console.error('Error clearing pending downgrade:', err);
    }

    console.info(`Downgrade cleanup complete for user ${userId}`);
  } catch (error) {
    console.error(`Downgrade cleanup failed for user ${userId}:`, error);
    // Non-blocking — cleanup failure should not break the webhook
  }
}

export default router;
