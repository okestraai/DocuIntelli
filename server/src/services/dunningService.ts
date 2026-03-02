/**
 * DocuIntelli AI — Dunning Service
 *
 * Handles payment failure escalation with automatic retries at every step.
 * Timeline: Day 0→3→5→7→14→21→30→45 (terminal deletion).
 */

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { sendNotificationEmail, resolveUserInfo } from './emailService';
import { invalidateSubscriptionCache } from '../middleware/subscriptionGuard';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover' as any,
});

const FREE_DOCUMENT_LIMIT = 3;

// Step thresholds (days since payment_failed_at)
const STEP_THRESHOLDS: Record<number, number> = {
  1: 0,   // Day 0  — friendly reminder
  2: 3,   // Day 3  — urgent update
  3: 5,   // Day 5  — feature countdown
  4: 7,   // Day 7  — restrict access
  5: 14,  // Day 14 — last chance
  6: 21,  // Day 21 — hard downgrade
  7: 30,  // Day 30 — deletion warning
  8: 45,  // Day 45 — terminal deletion
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function logDunning(
  userId: string,
  step: number,
  action: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await supabase.from('dunning_log').insert({
    user_id: userId,
    step,
    action,
    details,
  });
}

function daysSince(date: string | Date): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function futureDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86400000).toLocaleDateString('en-US', { dateStyle: 'long' });
}

// ─── Payment Retry ────────────────────────────────────────────────────────────

/**
 * Attempt to pay the latest open invoice for a customer.
 * Returns true if payment succeeded.
 */
async function retryPayment(stripeCustomerId: string): Promise<boolean> {
  try {
    const invoices = await stripe.invoices.list({
      customer: stripeCustomerId,
      status: 'open',
      limit: 1,
    });

    if (invoices.data.length === 0) {
      // Check for past_due subscription with no open invoice
      return false;
    }

    const invoice = invoices.data[0];
    const paidInvoice = await stripe.invoices.pay(invoice.id);
    return paidInvoice.status === 'paid';
  } catch (err: any) {
    console.error(`[DUNNING] Payment retry failed for ${stripeCustomerId}:`, err.message);
    return false;
  }
}

// ─── Recovery ─────────────────────────────────────────────────────────────────

/**
 * Called when payment succeeds (at any dunning step).
 * Restores full access immediately.
 */
export async function recoverFromDunning(userId: string): Promise<void> {
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('payment_status, dunning_step, previous_plan, plan, display_name')
    .eq('user_id', userId)
    .single();

  if (!sub || sub.payment_status === 'active') return;

  const restoredPlan = sub.previous_plan || sub.plan;
  const step = sub.dunning_step || 0;

  // Plan limits
  const PLAN_LIMITS: Record<string, { document_limit: number; ai_questions_limit: number; monthly_upload_limit: number; bank_account_limit: number }> = {
    free: { document_limit: 3, ai_questions_limit: 5, monthly_upload_limit: 3, bank_account_limit: 0 },
    starter: { document_limit: 25, ai_questions_limit: 999999, monthly_upload_limit: 30, bank_account_limit: 2 },
    pro: { document_limit: 100, ai_questions_limit: 999999, monthly_upload_limit: 150, bank_account_limit: 5 },
  };

  const limits = PLAN_LIMITS[restoredPlan] || PLAN_LIMITS.free;

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
    .eq('user_id', userId);

  await invalidateSubscriptionCache(userId);
  await logDunning(userId, step, 'recovered', { restoredPlan });

  // Send recovery email
  const userInfo = await resolveUserInfo(userId);
  if (userInfo) {
    await sendNotificationEmail(userId, 'dunning_payment_recovered', {
      userName: userInfo.userName,
      plan: restoredPlan,
    });
  }

  console.log(`[DUNNING] Recovered user ${userId} → ${restoredPlan} plan`);
}

// ─── Start Dunning ────────────────────────────────────────────────────────────

/**
 * Called from Stripe webhook on invoice.payment_failed.
 * Starts the dunning flow if not already started.
 */
export async function startDunning(userId: string, failureReason?: string): Promise<void> {
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('payment_status, payment_failed_at, plan, stripe_customer_id')
    .eq('user_id', userId)
    .single();

  if (!sub) return;

  // Only start if not already in dunning
  if (sub.payment_status !== 'active') {
    console.log(`[DUNNING] User ${userId} already in dunning (step ${sub.payment_status})`);
    return;
  }

  // Don't dun free users
  if (sub.plan === 'free') return;

  const now = new Date().toISOString();

  await supabase
    .from('user_subscriptions')
    .update({
      payment_status: 'past_due',
      payment_failed_at: now,
      dunning_step: 1,
      updated_at: now,
    })
    .eq('user_id', userId);

  await invalidateSubscriptionCache(userId);
  await logDunning(userId, 1, 'dunning_started', { failureReason });

  // Send step 1 email
  const userInfo = await resolveUserInfo(userId);
  if (userInfo) {
    await sendNotificationEmail(userId, 'dunning_friendly_reminder', {
      userName: userInfo.userName,
      plan: sub.plan,
      amount: 'your subscription',
      currency: 'usd',
      failureReason,
      retryDate: futureDate(3),
    });
    await logDunning(userId, 1, 'email_sent', { template: 'dunning_friendly_reminder' });
  }

  console.log(`[DUNNING] Started for user ${userId} (${sub.plan})`);
}

// ─── Escalation Step Handlers ─────────────────────────────────────────────────

async function executeStep2(userId: string, sub: any, userInfo: any): Promise<void> {
  await sendNotificationEmail(userId, 'dunning_update_urgent', {
    userName: userInfo.userName,
    plan: sub.plan,
    amount: 'your subscription',
    currency: 'usd',
    daysSinceFailure: daysSince(sub.payment_failed_at),
  });
}

async function executeStep3(userId: string, sub: any, userInfo: any): Promise<void> {
  const features = ['Unlimited AI chat', 'Full document storage', 'Financial insights', 'Priority support'];
  await sendNotificationEmail(userId, 'dunning_feature_countdown', {
    userName: userInfo.userName,
    plan: sub.plan,
    features: sub.plan === 'pro' ? features : features.slice(0, 3),
    restrictionDate: futureDate(2),
  });
}

async function executeStep4(userId: string, sub: any, userInfo: any): Promise<void> {
  // Restrict access
  await supabase
    .from('user_subscriptions')
    .update({
      payment_status: 'restricted',
      restricted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  await invalidateSubscriptionCache(userId);

  const { count: docCount } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  await sendNotificationEmail(userId, 'dunning_access_restricted', {
    userName: userInfo.userName,
    plan: sub.plan,
    documentLimit: FREE_DOCUMENT_LIMIT,
    documentCount: docCount || 0,
  });
}

async function executeStep5(userId: string, sub: any, userInfo: any): Promise<void> {
  const { count: docCount } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  await sendNotificationEmail(userId, 'dunning_last_chance', {
    userName: userInfo.userName,
    plan: sub.plan,
    downgradeDate: futureDate(7),
    documentCount: docCount || 0,
    freeLimit: FREE_DOCUMENT_LIMIT,
  });
}

async function executeStep6(userId: string, sub: any, userInfo: any): Promise<void> {
  // Hard downgrade to free
  const { count: docCount } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  await supabase
    .from('user_subscriptions')
    .update({
      payment_status: 'downgraded',
      downgraded_at: new Date().toISOString(),
      previous_plan: sub.plan,
      plan: 'free',
      status: 'active',
      document_limit: FREE_DOCUMENT_LIMIT,
      ai_questions_limit: 5,
      monthly_upload_limit: 3,
      bank_account_limit: 0,
      deletion_scheduled_at: new Date(Date.now() + 24 * 86400000).toISOString(), // 24 days from now = Day 45 total
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  await invalidateSubscriptionCache(userId);

  // Disconnect bank accounts (Plaid)
  let banksDisconnected = 0;
  try {
    const { data: plaidItems } = await supabase
      .from('plaid_items')
      .select('item_id, access_token')
      .eq('user_id', userId);

    if (plaidItems && plaidItems.length > 0) {
      for (const item of plaidItems) {
        try {
          // Dynamic import to avoid hard dependency
          const { Configuration, PlaidApi, PlaidEnvironments } = await import('plaid');
          const plaidConfig = new Configuration({
            basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
            baseOptions: {
              headers: {
                'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID || '',
                'PLAID-SECRET': process.env.PLAID_SECRET || '',
              },
            },
          });
          const plaidClient = new PlaidApi(plaidConfig);
          await plaidClient.itemRemove({ access_token: item.access_token });
        } catch (plaidErr) {
          console.error(`[DUNNING] Plaid item remove failed for ${item.item_id}:`, plaidErr);
        }
        banksDisconnected++;
      }

      // Clean up plaid data
      await supabase.from('plaid_transactions').delete().eq('user_id', userId);
      await supabase.from('plaid_accounts').delete().eq('user_id', userId);
      await supabase.from('plaid_items').delete().eq('user_id', userId);
      await supabase.from('financial_insights').delete().eq('user_id', userId);
    }
  } catch (err) {
    console.error(`[DUNNING] Bank disconnect error for ${userId}:`, err);
  }

  // Cancel Stripe subscription
  if (sub.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch (stripeErr: any) {
      console.error(`[DUNNING] Stripe cancel failed for ${userId}:`, stripeErr.message);
    }
  }

  await sendNotificationEmail(userId, 'dunning_downgrade_notice', {
    userName: userInfo.userName,
    previousPlan: sub.plan,
    documentCount: docCount || 0,
    freeLimit: FREE_DOCUMENT_LIMIT,
    deletionDate: futureDate(24), // 24 more days to Day 45
  });

  await logDunning(userId, 6, 'banks_disconnected', { banksDisconnected });
}

async function executeStep7(userId: string, sub: any, userInfo: any): Promise<void> {
  // Deletion warning — identify excess documents
  const { data: docs } = await supabase
    .from('documents')
    .select('id, name')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  const allDocs = docs || [];
  const excessCount = Math.max(0, allDocs.length - FREE_DOCUMENT_LIMIT);

  if (excessCount > 0) {
    const excessDocs = allDocs.slice(0, excessCount); // oldest first

    await sendNotificationEmail(userId, 'dunning_deletion_warning', {
      userName: userInfo.userName,
      excessDocuments: excessCount,
      deletionDate: futureDate(15), // 15 more days to Day 45
      documentNames: excessDocs.map((d: any) => d.name),
    });
  }
}

async function executeStep8(userId: string, sub: any, userInfo: any): Promise<void> {
  // ── TERMINAL ACTION — Permanently delete excess documents ──

  const { data: docs } = await supabase
    .from('documents')
    .select('id, name')
    .eq('user_id', userId)
    .order('created_at', { ascending: true }); // oldest first

  const allDocs = docs || [];
  const excessCount = Math.max(0, allDocs.length - FREE_DOCUMENT_LIMIT);
  const docsToDelete = allDocs.slice(0, excessCount);

  let documentsDeleted = 0;

  if (docsToDelete.length > 0) {
    const deleteIds = docsToDelete.map((d: any) => d.id);

    // Delete embeddings
    await supabase.from('document_chunks').delete().in('document_id', deleteIds);
    // Delete chats
    await supabase.from('document_chats').delete().in('document_id', deleteIds);
    // Delete documents
    const { error: delError } = await supabase.from('documents').delete().in('id', deleteIds);

    if (!delError) {
      documentsDeleted = docsToDelete.length;
    } else {
      console.error(`[DUNNING] Document deletion failed for ${userId}:`, delError);
    }
  }

  // Ensure no remaining bank connections (may have been re-connected)
  let banksDisconnected = 0;
  const { data: remainingPlaid } = await supabase
    .from('plaid_items')
    .select('item_id')
    .eq('user_id', userId);

  if (remainingPlaid && remainingPlaid.length > 0) {
    await supabase.from('plaid_transactions').delete().eq('user_id', userId);
    await supabase.from('plaid_accounts').delete().eq('user_id', userId);
    await supabase.from('plaid_items').delete().eq('user_id', userId);
    await supabase.from('financial_insights').delete().eq('user_id', userId);
    banksDisconnected = remainingPlaid.length;
  }

  // Finalize — user is now a clean free user
  await supabase
    .from('user_subscriptions')
    .update({
      plan: 'free',
      payment_status: 'active',
      dunning_step: 0,
      payment_failed_at: null,
      restricted_at: null,
      downgraded_at: null,
      previous_plan: null,
      deletion_scheduled_at: null,
      stripe_subscription_id: null,
      stripe_price_id: null,
      document_limit: FREE_DOCUMENT_LIMIT,
      ai_questions_limit: 5,
      monthly_upload_limit: 3,
      feature_flags: {
        auto_tags: false,
        ocr_enabled: false,
        global_search: false,
        url_ingestion: false,
        priority_queue: 0,
        priority_support: false,
        multi_device_sync: false,
        email_notifications: false,
        background_embedding: false,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  await invalidateSubscriptionCache(userId);

  await sendNotificationEmail(userId, 'dunning_final_confirmation', {
    userName: userInfo.userName,
    documentsDeleted,
    documentsRemaining: Math.max(0, allDocs.length - documentsDeleted),
    banksDisconnected,
  });

  await logDunning(userId, 8, 'terminal_deletion', { documentsDeleted, banksDisconnected });
  console.log(`[DUNNING] Terminal deletion for ${userId}: ${documentsDeleted} docs, ${banksDisconnected} banks`);
}

// ─── Main Escalation Runner (called by cron) ─────────────────────────────────

export async function runDunningEscalation(): Promise<{ processed: number; recovered: number; errors: number }> {
  const { data: users } = await supabase
    .from('user_subscriptions')
    .select('user_id, plan, payment_status, payment_failed_at, dunning_step, stripe_customer_id, stripe_subscription_id')
    .neq('payment_status', 'active')
    .gt('dunning_step', 0)
    .lt('dunning_step', 9); // 8 is the max step

  if (!users || users.length === 0) {
    return { processed: 0, recovered: 0, errors: 0 };
  }

  let processed = 0;
  let recovered = 0;
  let errors = 0;

  for (const sub of users) {
    try {
      const days = daysSince(sub.payment_failed_at);
      const currentStep = sub.dunning_step;

      // Determine expected step based on days elapsed
      let expectedStep = currentStep;
      for (const [step, threshold] of Object.entries(STEP_THRESHOLDS)) {
        if (days >= threshold && Number(step) > expectedStep) {
          expectedStep = Number(step);
        }
      }

      // Nothing to do if already at expected step
      if (expectedStep <= currentStep) continue;

      // Process each missed step sequentially
      for (let step = currentStep + 1; step <= expectedStep; step++) {
        // 1. Attempt payment retry (except on terminal step 8)
        if (sub.stripe_customer_id) {
          const retrySuccess = await retryPayment(sub.stripe_customer_id);
          await logDunning(sub.user_id, step, retrySuccess ? 'retry_succeeded' : 'retry_failed');

          if (retrySuccess) {
            await recoverFromDunning(sub.user_id);
            recovered++;
            break; // Exit step loop — user recovered
          }
        }

        // 2. Execute escalation action
        const userInfo = await resolveUserInfo(sub.user_id);
        if (!userInfo) {
          console.error(`[DUNNING] No user info for ${sub.user_id}, skipping step ${step}`);
          continue;
        }

        switch (step) {
          case 2: await executeStep2(sub.user_id, sub, userInfo); break;
          case 3: await executeStep3(sub.user_id, sub, userInfo); break;
          case 4: await executeStep4(sub.user_id, sub, userInfo); break;
          case 5: await executeStep5(sub.user_id, sub, userInfo); break;
          case 6: await executeStep6(sub.user_id, sub, userInfo); break;
          case 7: await executeStep7(sub.user_id, sub, userInfo); break;
          case 8: await executeStep8(sub.user_id, sub, userInfo); break;
        }

        // 3. Update dunning step
        await supabase
          .from('user_subscriptions')
          .update({ dunning_step: step, updated_at: new Date().toISOString() })
          .eq('user_id', sub.user_id);

        await logDunning(sub.user_id, step, 'step_executed');
        await logDunning(sub.user_id, step, 'email_sent', { template: `dunning_step_${step}` });
      }

      processed++;
    } catch (err: any) {
      console.error(`[DUNNING] Error processing user ${sub.user_id}:`, err.message);
      errors++;
    }
  }

  console.log(`[DUNNING] Escalation complete: ${processed} processed, ${recovered} recovered, ${errors} errors`);
  return { processed, recovered, errors };
}

// ─── Status Query (for API route) ────────────────────────────────────────────

export async function getDunningStatus(userId: string): Promise<{
  inDunning: boolean;
  paymentStatus: string;
  dunningStep: number;
  paymentFailedAt: string | null;
  restrictedAt: string | null;
  downgradeDate: string | null;
  deletionDate: string | null;
  previousPlan: string | null;
}> {
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('payment_status, dunning_step, payment_failed_at, restricted_at, downgraded_at, deletion_scheduled_at, previous_plan')
    .eq('user_id', userId)
    .single();

  if (!sub) {
    return {
      inDunning: false,
      paymentStatus: 'active',
      dunningStep: 0,
      paymentFailedAt: null,
      restrictedAt: null,
      downgradeDate: null,
      deletionDate: null,
      previousPlan: null,
    };
  }

  return {
    inDunning: sub.payment_status !== 'active',
    paymentStatus: sub.payment_status,
    dunningStep: sub.dunning_step,
    paymentFailedAt: sub.payment_failed_at,
    restrictedAt: sub.restricted_at,
    downgradeDate: sub.downgraded_at,
    deletionDate: sub.deletion_scheduled_at,
    previousPlan: sub.previous_plan,
  };
}
