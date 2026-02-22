import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { loadSubscription, invalidateSubscriptionCache } from '../middleware/subscriptionGuard';
import { sendNotificationEmail, resolveUserInfo } from '../services/emailService';

const router = Router();

// Apply subscription loading to ALL routes
router.use(loadSubscription);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeStarterPriceId = process.env.STRIPE_STARTER_PRICE_ID;
const stripeProPriceId = process.env.STRIPE_PRO_PRICE_ID;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration in subscription routes');
}

if (!stripeSecretKey) {
  throw new Error('Missing Stripe configuration in subscription routes');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2026-01-28.clover',
});

const PRICE_IDS: Record<string, string> = {
  starter: stripeStarterPriceId || '',
  pro: stripeProPriceId || '',
};

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
    const { error } = await supabase
      .from('user_subscriptions')
      .update({
        pending_plan: pendingPlan,
        documents_to_keep: documentsToKeep,
      })
      .eq('user_id', userId);

    if (error) {
      console.warn('⚠️ Could not save pending downgrade info (migration may not be applied):', error.message);
    }
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

    // Cancel the subscription at period end in Stripe
    const stripeSubscription = await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      {
        cancel_at_period_end: true,
      }
    );

    // Update our database — critical fields only
    const { error: dbError } = await supabase
      .from('user_subscriptions')
      .update({
        status: 'canceling',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (dbError) {
      console.error('❌ DB update failed during cancel:', dbError);
    }

    await invalidateSubscriptionCache(userId);

    console.log(`✅ Subscription ${subscription.stripe_subscription_id} will cancel at period end`);

    const cancelAt = stripeSubscription.cancel_at ? new Date(stripeSubscription.cancel_at * 1000).toISOString() : subscription.current_period_end;

    // Send cancellation email (non-blocking)
    resolveUserInfo(userId).then(async userInfo => {
      if (userInfo) {
        const { count: docCount } = await supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);

        sendNotificationEmail(userId, 'subscription_canceled', {
          userName: userInfo.userName,
          plan: subscription.plan,
          effectiveDate: cancelAt ? new Date(cancelAt).toLocaleDateString('en-US', { dateStyle: 'long' }) : 'End of billing period',
          documentCount: docCount || 0,
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

    // Remove the cancellation
    await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      {
        cancel_at_period_end: false,
      }
    );

    // If there was a pending paid-to-paid downgrade, revert the Stripe price
    // back to the current plan's price
    if (subscription.pending_plan && subscription.pending_plan !== 'free') {
      const currentPriceId = PRICE_IDS[subscription.plan];
      if (currentPriceId) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
          await stripe.subscriptions.update(subscription.stripe_subscription_id, {
            items: [{
              id: stripeSubscription.items.data[0].id,
              price: currentPriceId,
            }],
            proration_behavior: 'none',
          });
          console.log(`🔄 Reverted Stripe price back to ${subscription.plan}`);
        } catch (revertErr) {
          console.error('⚠️ Failed to revert Stripe price:', revertErr);
        }
      }
    }

    // Critical DB update: set status to active
    const { error: dbError } = await supabase
      .from('user_subscriptions')
      .update({
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (dbError) {
      console.error('❌ DB update failed during reactivate:', dbError);
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

    const newPriceId = PRICE_IDS[new_plan];
    if (!newPriceId) {
      res.status(400).json({ success: false, error: 'Price ID not configured for the selected plan' });
      return;
    }

    if (subscription.plan === 'free' || !subscription.stripe_subscription_id) {
      res.status(400).json({ success: false, error: 'Preview is only available for existing paid subscribers' });
      return;
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id) as Stripe.Subscription;
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

    const newPriceId = PRICE_IDS[new_plan];
    if (!newPriceId) {
      res.status(400).json({ success: false, error: 'Price ID not configured for the selected plan' });
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
    const { error: dbError } = await supabase
      .from('user_subscriptions')
      .update({
        plan: new_plan,
        status: 'active',
        document_limit: limits.document_limit,
        ai_questions_limit: limits.ai_questions_limit,
        monthly_upload_limit: limits.monthly_upload_limit,
        bank_account_limit: limits.bank_account_limit,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (dbError) {
      console.error('❌ DB update failed during upgrade:', dbError);
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
      const { error: dbError } = await supabase
        .from('user_subscriptions')
        .update({
          status: 'canceling',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (dbError) {
        console.error('❌ DB update failed during downgrade-to-free:', dbError);
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
    const newPriceId = PRICE_IDS[new_plan];
    if (!newPriceId) {
      res.status(400).json({ success: false, error: 'Price ID not configured for the selected plan' });
      return;
    }

    if (!subscription.stripe_subscription_id) {
      res.status(400).json({ success: false, error: 'No active Stripe subscription found' });
      return;
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);

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
