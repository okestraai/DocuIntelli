/**
 * User Coupon Routes
 *
 * Endpoints for validating and redeeming coupon codes.
 * Redemption creates a Stripe checkout session with the native Stripe
 * Promotion Code applied, giving proper discount display in checkout.
 */

import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { loadSubscription } from '../middleware/subscriptionGuard';
import { query } from '../services/db';
import { verifyAccessToken } from '../services/authService';

const router = Router();

router.use(loadSubscription);

// ─── Stripe Client ───────────────────────────────────────────────────────────

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  appInfo: {
    name: 'DocuIntelli Billing',
    version: '1.0.0',
  },
});

const STRIPE_STARTER_PRICE_ID = process.env.STRIPE_STARTER_PRICE_ID;
const STRIPE_PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID;

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  plan: string;
  trial_days: number;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  is_active: boolean;
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
}

/**
 * Validate a coupon for a given user. Returns the coupon row or an error reason.
 */
async function validateCouponForUser(
  code: string,
  userId: string,
  currentPlan: string,
): Promise<{ valid: true; coupon: CouponRow } | { valid: false; reason: string }> {
  const normalizedCode = code.toUpperCase().trim();

  if (!normalizedCode) {
    return { valid: false, reason: 'Coupon code is required' };
  }

  // Look up coupon
  const result = await query(
    `SELECT * FROM coupons WHERE code = $1`,
    [normalizedCode],
  );

  if (result.rows.length === 0) {
    return { valid: false, reason: 'Invalid coupon code' };
  }

  const coupon: CouponRow = result.rows[0];

  if (!coupon.is_active) {
    return { valid: false, reason: 'This coupon is no longer active' };
  }

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { valid: false, reason: 'This coupon has expired' };
  }

  if (coupon.max_uses != null && coupon.current_uses >= coupon.max_uses) {
    return { valid: false, reason: 'This coupon has reached its usage limit' };
  }

  // Check if user already redeemed this coupon
  const redemption = await query(
    `SELECT id FROM coupon_redemptions WHERE coupon_id = $1 AND user_id = $2`,
    [coupon.id, userId],
  );

  if (redemption.rows.length > 0) {
    return { valid: false, reason: 'You have already used this coupon' };
  }

  // Check if user is on free plan
  if (currentPlan !== 'free') {
    return { valid: false, reason: 'Coupons are only available for free plan users' };
  }

  return { valid: true, coupon };
}

// ──────────────────────────────────────────────────────────────
// POST /validate — Validate a coupon code without redeeming
// ──────────────────────────────────────────────────────────────
router.post('/validate', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { code } = req.body;
    const currentPlan = req.subscription?.plan || 'free';

    const result = await validateCouponForUser(code, userId, currentPlan);

    if (!result.valid) {
      res.json({ valid: false, reason: result.reason });
      return;
    }

    res.json({
      valid: true,
      coupon: {
        code: result.coupon.code,
        description: result.coupon.description,
        plan: result.coupon.plan,
        trial_days: result.coupon.trial_days,
      },
    });
  } catch (err) {
    console.error('Error validating coupon:', err);
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /redeem — Redeem a coupon (creates Stripe checkout with promotion code)
// ──────────────────────────────────────────────────────────────
router.post('/redeem', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { code, success_url, cancel_url } = req.body;

    if (!success_url || !cancel_url) {
      res.status(400).json({ error: 'success_url and cancel_url are required' });
      return;
    }

    const currentPlan = req.subscription?.plan || 'free';

    // Validate the coupon
    const validation = await validateCouponForUser(code, userId, currentPlan);
    if (!validation.valid) {
      res.status(400).json({ error: validation.reason });
      return;
    }

    const coupon = validation.coupon;

    // Ensure this coupon has a Stripe Promotion Code
    if (!coupon.stripe_promotion_code_id) {
      console.error(`[COUPON] Coupon ${coupon.code} has no Stripe promotion code ID`);
      res.status(500).json({ error: 'Coupon configuration error — missing Stripe promotion code' });
      return;
    }

    // Determine price ID based on coupon plan
    const priceId = coupon.plan === 'pro' ? STRIPE_PRO_PRICE_ID : STRIPE_STARTER_PRICE_ID;
    if (!priceId) {
      console.error(`[COUPON] Missing price ID for plan: ${coupon.plan}`);
      res.status(500).json({ error: 'Price configuration error' });
      return;
    }

    // Get user email for Stripe
    const userResult = await query(
      `SELECT email FROM auth_users WHERE id = $1`,
      [userId],
    );
    const userEmail = userResult.rows[0]?.email || '';

    // Look up or create Stripe customer
    const customerResult = await query(
      `SELECT customer_id FROM stripe_customers
       WHERE user_id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [userId],
    );

    let customerId: string;

    if (customerResult.rows.length === 0 || !customerResult.rows[0].customer_id) {
      const newCustomer = await stripe.customers.create({
        email: userEmail,
        metadata: { userId },
      });

      await query(
        `INSERT INTO stripe_customers (user_id, customer_id) VALUES ($1, $2)`,
        [userId, newCustomer.id],
      );

      await query(
        `INSERT INTO stripe_subscriptions (customer_id, status) VALUES ($1, $2)`,
        [newCustomer.id, 'not_started'],
      );

      customerId = newCustomer.id;
    } else {
      customerId = customerResult.rows[0].customer_id;

      // Ensure subscription record exists
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

    // Atomically increment current_uses (prevents race condition)
    const incrementResult = await query(
      `UPDATE coupons
       SET current_uses = current_uses + 1, updated_at = now()
       WHERE id = $1 AND (max_uses IS NULL OR current_uses < max_uses)
       RETURNING id`,
      [coupon.id],
    );

    if (incrementResult.rows.length === 0) {
      res.status(400).json({ error: 'This coupon has reached its usage limit' });
      return;
    }

    // Create Stripe checkout session with native promotion code applied
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${success_url}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url,
      billing_address_collection: 'auto',
      customer_update: { address: 'auto' },
      discounts: [{ promotion_code: coupon.stripe_promotion_code_id }],
      subscription_data: {
        metadata: {
          user_id: userId,
          coupon_id: coupon.id,
          coupon_code: coupon.code,
        },
      },
      metadata: {
        user_id: userId,
        user_email: userEmail,
        coupon_id: coupon.id,
        coupon_code: coupon.code,
      },
    });

    // Record the redemption
    await query(
      `INSERT INTO coupon_redemptions (coupon_id, user_id, stripe_checkout_session_id)
       VALUES ($1, $2, $3)`,
      [coupon.id, userId, session.id],
    );

    console.info(`[COUPON] User ${userId} redeemed coupon ${coupon.code} → checkout session ${session.id}`);
    res.json({ success: true, url: session.url });
  } catch (err) {
    console.error('Error redeeming coupon:', err);
    res.status(500).json({ error: 'Failed to redeem coupon' });
  }
});

export default router;
