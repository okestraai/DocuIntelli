import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { query } from '../services/db';
import { loadSubscription, invalidateSubscriptionCache } from '../middleware/subscriptionGuard';
import { detectImpersonation } from '../middleware/impersonation';
import { sendNotificationEmail, resolveUserInfo } from '../services/emailService';

const router = Router();

// Apply subscription loading + impersonation detection to ALL routes
router.use(loadSubscription, detectImpersonation);

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeStarterPriceId = process.env.STRIPE_STARTER_PRICE_ID;
const stripeProPriceId = process.env.STRIPE_PRO_PRICE_ID;
const stripeStarterYearlyPriceId = process.env.STRIPE_STARTER_YEARLY_PRICE_ID;
const stripeProYearlyPriceId = process.env.STRIPE_PRO_YEARLY_PRICE_ID;

if (!stripeSecretKey) {
  throw new Error('Missing Stripe configuration in subscription routes');
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2026-01-28.clover',
});

const PRICE_IDS: Record<string, string> = {
  starter: stripeStarterPriceId || '',
  pro: stripeProPriceId || '',
  starter_yearly: stripeStarterYearlyPriceId || '',
  pro_yearly: stripeProYearlyPriceId || '',
};

/** Check if a price ID is a yearly billing price */
function isYearlyPriceId(priceId: string): boolean {
  return priceId === stripeStarterYearlyPriceId || priceId === stripeProYearlyPriceId;
}

/** Get the correct price ID for a plan, preserving billing period */
function resolvePriceId(plan: string, yearly: boolean): string {
  return yearly ? (PRICE_IDS[`${plan}_yearly`] || PRICE_IDS[plan]) : PRICE_IDS[plan];
}

const PLAN_DB_LIMITS: Record<string, { document_limit: number; ai_questions_limit: number; monthly_upload_limit: number; bank_account_limit: number }> = {
  free: { document_limit: 3, ai_questions_limit: 5, monthly_upload_limit: 3, bank_account_limit: 0 },
  starter: { document_limit: 25, ai_questions_limit: 999999, monthly_upload_limit: 30, bank_account_limit: 2 },
  pro: { document_limit: 100, ai_questions_limit: 999999, monthly_upload_limit: 150, bank_account_limit: 5 },
};

/**
 * Helper: safely update pending downgrade columns.
 * These columns may not exist if the migration hasn't been applied yet.
 * This must NEVER block the critical subscription update.
 */
async function savePendingDowngrade(
  userId: string,
  pendingPlan: string | null,
  documentsToKeep: string[] | null
): Promise<void> {
  try {
    await query(
      `UPDATE user_subscriptions SET pending_plan = $1, documents_to_keep = $2 WHERE user_id = $3`,
      [pendingPlan, documentsToKeep, userId]
    );
  } catch (err) {
    console.warn('⚠️ savePendingDowngrade failed:', err);
  }
}

/**
 * Cancel subscription
 * Cancels at period end so user keeps access until expiration
 */
router.post('/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const subscription = req.subscription!;

    console.log('📋 Cancel subscription request from user:', userId);

    if (subscription.plan === 'free') {
      res.status(400).json({ success: false, error: 'No active subscription to cancel' });
      return;
    }

    if (!subscription.stripe_subscription_id) {
      res.status(400).json({ success: false, error: 'No Stripe subscription found' });
      return;
    }

    // Guard: check if Stripe subscription is in a terminal state
    if (subscription.status === 'expired' || subscription.status === 'canceled') {
      res.status(400).json({ success: false, error: 'No active subscription to cancel. Your subscription has already expired.' });
      return;
    }

    // Cancel the subscription at period end in Stripe
    let stripeSubscription: any;
    let cancelAt: string | undefined;

    try {
      stripeSubscription = await stripe.subscriptions.update(
        subscription.stripe_subscription_id,
        {
          cancel_at_period_end: true,
        }
      );
      cancelAt = stripeSubscription.cancel_at ? new Date(stripeSubscription.cancel_at * 1000).toISOString() : (subscription.current_period_end || undefined);
    } catch (stripeErr: any) {
      // Subscription may have been deleted in Stripe — still downgrade locally
      if (stripeErr.code === 'resource_missing') {
        console.warn(`⚠️ Stripe subscription ${subscription.stripe_subscription_id} no longer exists — cancelling locally only`);
        cancelAt = subscription.current_period_end || new Date().toISOString();
      } else {
        throw stripeErr;
      }
    }

    // Update our database — critical fields only
    try {
      await query(
        `UPDATE user_subscriptions SET status = $1, updated_at = $2 WHERE user_id = $3`,
        ['canceling', new Date().toISOString(), userId]
      );
    } catch (dbErr) {
      console.error('❌ DB update failed during cancel:', dbErr);
    }

    await invalidateSubscriptionCache(userId);

    console.log(`✅ Subscription ${subscription.stripe_subscription_id} will cancel at period end`);

    // Send cancellation email (non-blocking)
    resolveUserInfo(userId).then(async userInfo => {
      if (userInfo) {
        const countResult = await query(
          `SELECT COUNT(*) as count FROM documents WHERE user_id = $1`,
          [userId]
        );
        const docCount = parseInt(countResult.rows[0]?.count || '0', 10);

        sendNotificationEmail(userId, 'subscription_canceled', {
          userName: userInfo.userName,
          plan: subscription.plan,
          effectiveDate: cancelAt ? new Date(cancelAt).toLocaleDateString('en-US', { dateStyle: 'long' }) : 'End of billing period',
          documentCount: docCount,
        }).catch(err => console.error('📧 Cancel email failed:', err));
      }
    });

    res.json({
      success: true,
      message: 'Subscription will be canceled at the end of the current billing period',
      cancel_at: cancelAt,
    });
  } catch (err: any) {
    console.error('❌ Cancel subscription error:', err);
    res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
  }
});

/**
 * Reactivate a canceling subscription
 */
router.post('/reactivate', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const subscription = req.subscription!;

    console.log('🔄 Reactivate subscription request from user:', userId);

    if (!subscription.stripe_subscription_id) {
      res.status(400).json({ success: false, error: 'No Stripe subscription found' });
      return;
    }

    // Guard: check if subscription is in a terminal state
    if (subscription.status === 'expired' || subscription.status === 'canceled') {
      res.status(400).json({ success: false, error: 'Cannot reactivate an expired subscription. Please subscribe to a new plan.' });
      return;
    }

    if (subscription.status !== 'canceling') {
      res.status(400).json({ success: false, error: 'Subscription is not in canceling state' });
      return;
    }

    // Remove the cancellation
    await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      {
        cancel_at_period_end: false,
      }
    );

    // If there was a pending paid-to-paid downgrade, revert the Stripe price
    // back to the current plan's price (preserving billing period)
    if (subscription.pending_plan && subscription.pending_plan !== 'free') {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
        const activePriceId = stripeSubscription.items.data[0].price.id;
        const yearly = isYearlyPriceId(activePriceId);
        const revertPriceId = resolvePriceId(subscription.plan, yearly);
        if (revertPriceId && revertPriceId !== activePriceId) {
          await stripe.subscriptions.update(subscription.stripe_subscription_id, {
            items: [{
              id: stripeSubscription.items.data[0].id,
              price: revertPriceId,
            }],
            proration_behavior: 'none',
          });
          console.log(`🔄 Reverted Stripe price back to ${subscription.plan} (${yearly ? 'yearly' : 'monthly'})`);
        }
      } catch (revertErr) {
        console.error('⚠️ Failed to revert Stripe price:', revertErr);
      }
    }

    // Critical DB update: set status to active
    try {
      await query(
        `UPDATE user_subscriptions SET status = $1, updated_at = $2 WHERE user_id = $3`,
        ['active', new Date().toISOString(), userId]
      );
    } catch (dbErr) {
      console.error('❌ DB update failed during reactivate:', dbErr);
    }

    // Non-critical: clear pending downgrade columns (may not exist yet)
    await savePendingDowngrade(userId, null, null);

    await invalidateSubscriptionCache(userId);

    console.log(`✅ Subscription ${subscription.stripe_subscription_id} reactivated`);

    // Send reactivation email (non-blocking)
    resolveUserInfo(userId).then(userInfo => {
      if (userInfo) {
        sendNotificationEmail(userId, 'subscription_reactivated', {
          userName: userInfo.userName,
          plan: subscription.plan,
        }).catch(err => console.error('📧 Reactivation email failed:', err));
      }
    });

    res.json({
      success: true,
      message: 'Subscription has been reactivated',
    });
  } catch (err: any) {
    console.error('❌ Reactivate subscription error:', err);
    res.status(500).json({ success: false, error: 'Failed to reactivate subscription' });
  }
});

/**
 * Upgrade subscription
 * Effective immediately with proration
 */
/**
 * Preview upgrade cost
 * Returns the prorated amount the user would be charged for an upgrade
 */
router.post('/upgrade-preview', async (req: Request, res: Response): Promise<void> => {
  try {
    const subscription = req.subscription!;
    const new_plan = req.body.new_plan || req.body.newPlan;

    if (!new_plan || !['starter', 'pro'].includes(new_plan)) {
      res.status(400).json({ success: false, error: 'Invalid plan specified' });
      return;
    }

    if (subscription.plan === 'free' || !subscription.stripe_subscription_id) {
      res.status(400).json({ success: false, error: 'Preview is only available for existing paid subscribers' });
      return;
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id) as Stripe.Subscription;

    // Preserve billing period for preview
    const currentPriceId = stripeSubscription.items.data[0].price.id;
    const yearly = isYearlyPriceId(currentPriceId);
    const newPriceId = resolvePriceId(new_plan, yearly);
    if (!newPriceId) {
      res.status(400).json({ success: false, error: 'Price ID not configured for the selected plan' });
      return;
    }

    const newPrice = await stripe.prices.retrieve(newPriceId) as Stripe.Price;
    const newAmount = newPrice.unit_amount || 0;
    const currency = newPrice.currency || 'usd';

    // Use Stripe's invoice preview API to get the exact proration amount
    let proratedAmountCents = 0;
    try {
      const preview = await stripe.invoices.createPreview({
        customer: stripeSubscription.customer as string,
        subscription: subscription.stripe_subscription_id,
        subscription_details: {
          items: [{
            id: stripeSubscription.items.data[0].id,
            price: newPriceId,
          }],
          proration_behavior: 'always_invoice',
        },
      });

      // The preview total is the proration amount (credit for unused Starter + charge for Pro remainder)
      proratedAmountCents = Math.max(preview.total || 0, 0);
    } catch (previewErr: any) {
      console.warn('Invoice preview failed, falling back to manual calculation:', previewErr.message);
      // Fallback: manual proration calculation
      const currentAmount = stripeSubscription.items.data[0].price.unit_amount || 0;
      const sub = stripeSubscription as any;
      const periodStart = sub.current_period_start as number | undefined;
      const periodEnd = sub.current_period_end as number | undefined;

      if (periodStart && periodEnd && periodEnd > periodStart) {
        const now = Math.floor(Date.now() / 1000);
        const totalSeconds = periodEnd - periodStart;
        const remainingSeconds = Math.max(periodEnd - now, 0);
        proratedAmountCents = Math.round((remainingSeconds / totalSeconds) * (newAmount - currentAmount));
      } else {
        // Last resort: full price difference
        proratedAmountCents = newAmount - (stripeSubscription.items.data[0].price.unit_amount || 0);
      }
    }

    res.json({
      success: true,
      prorated_amount: proratedAmountCents,
      prorated_amount_display: `$${(proratedAmountCents / 100).toFixed(2)}`,
      new_plan_price: newAmount,
      new_plan_price_display: `$${(newAmount / 100).toFixed(2)}`,
      currency,
      current_plan: subscription.plan,
      new_plan,
      current_period_end: subscription.current_period_end,
    });
  } catch (err: any) {
    console.error('❌ Upgrade preview error:', err);
    res.status(500).json({ success: false, error: 'Failed to calculate upgrade cost' });
  }
});

router.post('/upgrade', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const subscription = req.subscription!;
    const new_plan = req.body.new_plan || req.body.newPlan;

    console.log('⬆️  Upgrade subscription request:', { userId, currentPlan: subscription.plan, newPlan: new_plan });

    if (!new_plan || !['starter', 'pro'].includes(new_plan)) {
      res.status(400).json({ success: false, error: 'Invalid plan specified' });
      return;
    }

    // Handle free to paid upgrade
    if (subscription.plan === 'free') {
      res.status(400).json({
        success: false,
        error: 'Please use the standard checkout flow to upgrade from free plan',
        requiresCheckout: true
      });
      return;
    }

    if (!subscription.stripe_subscription_id) {
      res.status(400).json({ success: false, error: 'No active Stripe subscription found' });
      return;
    }

    // Get the current subscription from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);

    // Pre-flight check: subscription must be active or trialing
    if (stripeSubscription.status !== 'active' && stripeSubscription.status !== 'trialing') {
      res.status(400).json({
        success: false,
        error: `Cannot upgrade: subscription is "${stripeSubscription.status}". Please contact support.`,
      });
      return;
    }

    // Preserve billing period: if user is on yearly, upgrade to yearly price
    const currentPriceId = stripeSubscription.items.data[0].price.id;
    const yearly = isYearlyPriceId(currentPriceId);
    const newPriceId = resolvePriceId(new_plan, yearly);
    if (!newPriceId) {
      res.status(400).json({ success: false, error: 'Price ID not configured for the selected plan' });
      return;
    }

    // Update the subscription with the new price (immediate with proration)
    // - always_invoice: creates and pays a proration invoice immediately
    // - error_if_incomplete: fails cleanly if payment fails (subscription stays unchanged)
    const updatedSubscription = await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      {
        items: [{
          id: stripeSubscription.items.data[0].id,
          price: newPriceId,
        }],
        proration_behavior: 'always_invoice',
        payment_behavior: 'error_if_incomplete',
      }
    ) as Stripe.Subscription;

    console.log(`✅ Subscription upgraded to ${new_plan} with proration`);

    // Critical DB update: plan, status, and limits
    const limits = PLAN_DB_LIMITS[new_plan] || PLAN_DB_LIMITS.pro;
    try {
      await query(
        `UPDATE user_subscriptions
         SET plan = $1, status = $2, document_limit = $3, ai_questions_limit = $4,
             monthly_upload_limit = $5, bank_account_limit = $6, updated_at = $7
         WHERE user_id = $8`,
        [
          new_plan,
          'active',
          limits.document_limit,
          limits.ai_questions_limit,
          limits.monthly_upload_limit,
          limits.bank_account_limit,
          new Date().toISOString(),
          userId,
        ]
      );
    } catch (dbErr) {
      console.error('❌ DB update failed during upgrade:', dbErr);
    }

    // Non-critical: clear pending downgrade columns (may not exist yet)
    await savePendingDowngrade(userId, null, null);

    await invalidateSubscriptionCache(userId);

    // Send upgrade email (non-blocking)
    resolveUserInfo(userId).then(userInfo => {
      if (userInfo) {
        sendNotificationEmail(userId, 'subscription_upgraded', {
          userName: userInfo.userName,
          oldPlan: subscription.plan,
          newPlan: new_plan,
          effectiveDate: new Date().toLocaleDateString('en-US', { dateStyle: 'long' }),
        }).catch(err => console.error('📧 Upgrade email failed:', err));
      }
    });

    res.json({
      success: true,
      message: `Successfully upgraded to ${new_plan} plan`,
      effective_immediately: true,
      current_period_end: (updatedSubscription as any).current_period_end
        ? new Date((updatedSubscription as any).current_period_end * 1000).toISOString()
        : undefined,
    });
  } catch (err: any) {
    console.error('❌ Upgrade subscription error:', err);

    // Distinguish payment failures from other errors
    if (err.type === 'StripeCardError' || err.code === 'payment_intent_authentication_failure') {
      res.status(402).json({
        success: false,
        error: 'Payment failed. Please update your card and try again.',
        payment_failed: true,
      });
      return;
    }

    res.status(500).json({ success: false, error: 'Failed to upgrade subscription' });
  }
});

/**
 * Downgrade subscription
 * Scheduled to take effect at end of current period
 */
router.post('/downgrade', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const subscription = req.subscription!;
    const new_plan = req.body.new_plan || req.body.newPlan;
    const documents_to_keep = req.body.documents_to_keep || req.body.documentsToKeep;

    console.log('⬇️  Downgrade subscription request:', { userId, currentPlan: subscription.plan, newPlan: new_plan, documentsToKeep: documents_to_keep?.length });

    if (!new_plan || !['free', 'starter', 'pro'].includes(new_plan)) {
      res.status(400).json({ success: false, error: 'Invalid plan specified' });
      return;
    }

    if (subscription.plan === 'free') {
      res.status(400).json({ success: false, error: 'Already on free plan' });
      return;
    }

    // Guard: check if subscription is in a terminal state
    if (subscription.status === 'expired' || subscription.status === 'canceled') {
      res.status(400).json({ success: false, error: 'Cannot downgrade an expired subscription. You are already on the free tier.' });
      return;
    }

    // Downgrade to free - cancel at period end
    if (new_plan === 'free') {
      if (!subscription.stripe_subscription_id) {
        res.status(400).json({ success: false, error: 'No active Stripe subscription found' });
        return;
      }

      await stripe.subscriptions.update(
        subscription.stripe_subscription_id,
        {
          cancel_at_period_end: true,
        }
      );

      // Critical DB update: set status to canceling
      try {
        await query(
          `UPDATE user_subscriptions SET status = $1, updated_at = $2 WHERE user_id = $3`,
          ['canceling', new Date().toISOString(), userId]
        );
      } catch (dbErr) {
        console.error('❌ DB update failed during downgrade-to-free:', dbErr);
      }

      // Non-critical: save pending downgrade info (may not exist yet)
      await savePendingDowngrade(userId, 'free', documents_to_keep || null);

      await invalidateSubscriptionCache(userId);

      console.log(`✅ Subscription will downgrade to free at period end`);

      // Send downgrade email (non-blocking)
      resolveUserInfo(userId).then(userInfo => {
        if (userInfo) {
          sendNotificationEmail(userId, 'subscription_downgraded', {
            userName: userInfo.userName,
            oldPlan: subscription.plan,
            newPlan: 'free',
            effectiveDate: subscription.current_period_end
              ? new Date(subscription.current_period_end).toLocaleDateString('en-US', { dateStyle: 'long' })
              : 'End of billing period',
          }).catch(err => console.error('📧 Downgrade email failed:', err));
        }
      });

      res.json({
        success: true,
        message: 'Subscription will be downgraded to free plan at the end of current period',
        effective_date: subscription.current_period_end,
      });
      return;
    }

    // Downgrade to a different paid plan
    if (!subscription.stripe_subscription_id) {
      res.status(400).json({ success: false, error: 'No active Stripe subscription found' });
      return;
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);

    // Preserve billing period: if user is on yearly, downgrade to yearly price
    const currentPriceId = stripeSubscription.items.data[0].price.id;
    const yearly = isYearlyPriceId(currentPriceId);
    const newPriceId = resolvePriceId(new_plan, yearly);
    if (!newPriceId) {
      res.status(400).json({ success: false, error: 'Price ID not configured for the selected plan' });
      return;
    }

    // Schedule the downgrade for the end of the period
    const updatedSubscription = await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      {
        items: [{
          id: stripeSubscription.items.data[0].id,
          price: newPriceId,
        }],
        proration_behavior: 'none', // No proration for downgrades
      }
    ) as Stripe.Subscription;

    // Non-critical: save pending downgrade info (may not exist yet)
    await savePendingDowngrade(userId, new_plan, documents_to_keep || null);

    await invalidateSubscriptionCache(userId);

    console.log(`✅ Subscription will downgrade to ${new_plan} at period end`);

    const effectiveDate = (updatedSubscription as any).current_period_end
      ? new Date((updatedSubscription as any).current_period_end * 1000).toISOString()
      : undefined;

    // Send downgrade email (non-blocking)
    resolveUserInfo(userId).then(userInfo => {
      if (userInfo) {
        sendNotificationEmail(userId, 'subscription_downgraded', {
          userName: userInfo.userName,
          oldPlan: subscription.plan,
          newPlan: new_plan,
          effectiveDate: effectiveDate
            ? new Date(effectiveDate).toLocaleDateString('en-US', { dateStyle: 'long' })
            : 'End of billing period',
        }).catch(err => console.error('📧 Downgrade email failed:', err));
      }
    });

    res.json({
      success: true,
      message: `Subscription will be downgraded to ${new_plan} plan at the end of current period`,
      effective_date: effectiveDate,
    });
  } catch (err: any) {
    console.error('❌ Downgrade subscription error:', err);
    res.status(500).json({ success: false, error: 'Failed to downgrade subscription' });
  }
});

/**
 * GET /subscription/current
 * Returns the full subscription state + document count.
 * Handles missing subscription by creating a default free plan.
 */
router.get('/current', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    let subscription = req.subscription!;

    // Count documents
    const countResult = await query(
      `SELECT COUNT(*) as count FROM documents WHERE user_id = $1`,
      [userId]
    );
    const docCount = parseInt(countResult.rows[0]?.count || '0', 10);

    res.json({
      success: true,
      subscription,
      documentCount: docCount,
    });
  } catch (err: any) {
    console.error('❌ Get current subscription error:', err);
    res.status(500).json({ success: false, error: 'Failed to get subscription' });
  }
});

/**
 * POST /subscription/increment-questions
 * Server-side AI question counter increment.
 * Skipped when request is from an impersonation session (admin testing).
 */
router.post('/increment-questions', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const subscription = req.subscription!;

    // Admin impersonation: don't charge the user's quota
    if (req.isImpersonated) {
      res.json({
        success: true,
        ai_questions_used: subscription.ai_questions_used,
        ai_questions_limit: subscription.ai_questions_limit,
        impersonated: true,
      });
      return;
    }

    const newCount = subscription.ai_questions_used + 1;

    try {
      await query(
        `UPDATE user_subscriptions SET ai_questions_used = $1, updated_at = $2 WHERE user_id = $3`,
        [newCount, new Date().toISOString(), userId]
      );
    } catch (dbErr) {
      console.error('❌ Increment AI questions error:', dbErr);
      res.status(500).json({ success: false, error: 'Failed to increment AI questions' });
      return;
    }

    await invalidateSubscriptionCache(userId);

    res.json({
      success: true,
      ai_questions_used: newCount,
      ai_questions_limit: subscription.ai_questions_limit,
    });
  } catch (err: any) {
    console.error('❌ Increment AI questions error:', err);
    res.status(500).json({ success: false, error: 'Failed to increment AI questions' });
  }
});

/**
 * POST /subscription/increment-uploads
 * Server-side monthly upload counter increment.
 * Skipped when request is from an impersonation session (admin testing).
 */
router.post('/increment-uploads', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const subscription = req.subscription!;

    // Admin impersonation: don't charge the user's quota
    if (req.isImpersonated) {
      res.json({
        success: true,
        monthly_uploads_used: subscription.monthly_uploads_used,
        monthly_upload_limit: subscription.monthly_upload_limit,
        impersonated: true,
      });
      return;
    }

    const newCount = subscription.monthly_uploads_used + 1;

    try {
      await query(
        `UPDATE user_subscriptions SET monthly_uploads_used = $1, updated_at = $2 WHERE user_id = $3`,
        [newCount, new Date().toISOString(), userId]
      );
    } catch (dbErr) {
      console.error('❌ Increment uploads error:', dbErr);
      res.status(500).json({ success: false, error: 'Failed to increment uploads' });
      return;
    }

    await invalidateSubscriptionCache(userId);

    res.json({
      success: true,
      monthly_uploads_used: newCount,
      monthly_upload_limit: subscription.monthly_upload_limit,
    });
  } catch (err: any) {
    console.error('❌ Increment uploads error:', err);
    res.status(500).json({ success: false, error: 'Failed to increment uploads' });
  }
});

/**
 * Get subscription details
 */
router.get('/details', async (req: Request, res: Response): Promise<void> => {
  try {
    const subscription = req.subscription!;

    // If they have a Stripe subscription, get the latest details
    if (subscription.stripe_subscription_id) {
      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);

      res.json({
        success: true,
        subscription: {
          plan: subscription.plan,
          status: subscription.status,
          current_period_end: subscription.current_period_end,
          cancel_at_period_end: stripeSubscription.cancel_at_period_end,
          cancel_at: stripeSubscription.cancel_at ? new Date(stripeSubscription.cancel_at * 1000).toISOString() : null,
        },
      });
    } else {
      res.json({
        success: true,
        subscription: {
          plan: subscription.plan,
          status: subscription.status,
        },
      });
    }
  } catch (err: any) {
    console.error('❌ Get subscription details error:', err);
    res.status(500).json({ success: false, error: 'Failed to get subscription details' });
  }
});

export default router;
