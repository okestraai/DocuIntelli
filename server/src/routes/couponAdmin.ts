/**
 * Admin Coupon Routes
 *
 * CRUD endpoints for managing coupon codes.
 * Creates native Stripe Coupons + Promotion Codes for proper checkout UX.
 * All endpoints require authentication (loadSubscription) + admin role (requireAdmin).
 */

import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { loadSubscription } from '../middleware/subscriptionGuard';
import { requireAdmin } from '../middleware/requireAdmin';
import { query } from '../services/db';

const router = Router();

// ─── Stripe Client ───────────────────────────────────────────────────────────

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  appInfo: {
    name: 'DocuIntelli Billing',
    version: '1.0.0',
  },
});

// All coupon admin routes require auth + admin check
router.use(loadSubscription, requireAdmin);

// ──────────────────────────────────────────────────────────────
// GET / — List all coupons with pagination and search
// ──────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const search = (req.query.search as string || '').trim();
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params: any[] = [];

    if (search) {
      params.push(`%${search.toUpperCase()}%`);
      whereClause = `WHERE UPPER(c.code) LIKE $1 OR UPPER(c.description) LIKE $1`;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM coupons c ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count);

    const couponsResult = await query(
      `SELECT c.*, u.email AS created_by_email
       FROM coupons c
       LEFT JOIN auth_users u ON u.id = c.created_by
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    res.json({
      data: {
        coupons: couponsResult.rows,
        total,
        page,
        limit,
      },
    });
  } catch (err) {
    console.error('Error listing coupons:', err);
    res.status(500).json({ error: 'Failed to list coupons' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST / — Create a new coupon (+ Stripe Coupon & Promotion Code)
// ──────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, description, plan, trial_days, max_uses, expires_at } = req.body;
    const adminId = req.userId!;

    // Validate required fields
    if (!code || typeof code !== 'string' || !code.trim()) {
      res.status(400).json({ error: 'Coupon code is required' });
      return;
    }

    const normalizedCode = code.toUpperCase().trim();

    if (normalizedCode.length < 3 || normalizedCode.length > 50) {
      res.status(400).json({ error: 'Coupon code must be 3-50 characters' });
      return;
    }

    const validPlans = ['starter', 'pro'];
    const couponPlan = plan || 'pro';
    if (!validPlans.includes(couponPlan)) {
      res.status(400).json({ error: 'Plan must be "starter" or "pro"' });
      return;
    }

    const couponTrialDays = parseInt(trial_days) || 30;
    if (couponTrialDays < 1 || couponTrialDays > 365) {
      res.status(400).json({ error: 'Trial days must be between 1 and 365' });
      return;
    }

    const couponMaxUses = max_uses != null ? parseInt(max_uses) : null;
    if (couponMaxUses != null && couponMaxUses < 1) {
      res.status(400).json({ error: 'Max uses must be at least 1' });
      return;
    }

    // Check for duplicate code
    const existing = await query(
      `SELECT id FROM coupons WHERE code = $1`,
      [normalizedCode],
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'A coupon with this code already exists' });
      return;
    }

    // Create Stripe Coupon: 100% off for the trial duration
    const durationMonths = Math.max(1, Math.ceil(couponTrialDays / 30));
    const stripeCoupon = await stripe.coupons.create({
      percent_off: 100,
      duration: durationMonths === 1 ? 'once' : 'repeating',
      ...(durationMonths > 1 && { duration_in_months: durationMonths }),
      name: `${normalizedCode} — Free ${couponPlan} (${couponTrialDays} days)`,
      metadata: {
        docuintelli_plan: couponPlan,
        docuintelli_trial_days: String(couponTrialDays),
      },
    });

    // Create Stripe Promotion Code from the coupon
    // Stripe SDK v20+ uses `promotion: { type, coupon }` instead of `coupon`
    const stripePromoCode = await stripe.promotionCodes.create({
      promotion: { type: 'coupon', coupon: stripeCoupon.id },
      code: normalizedCode,
      active: true,
      ...(couponMaxUses != null && { max_redemptions: couponMaxUses }),
      ...(expires_at && { expires_at: Math.floor(new Date(expires_at).getTime() / 1000) }),
      metadata: {
        docuintelli_plan: couponPlan,
        docuintelli_trial_days: String(couponTrialDays),
      },
    });

    // Insert into our database with Stripe IDs
    const result = await query(
      `INSERT INTO coupons (code, description, plan, trial_days, max_uses, expires_at, created_by, stripe_coupon_id, stripe_promotion_code_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [normalizedCode, description || null, couponPlan, couponTrialDays, couponMaxUses, expires_at || null, adminId, stripeCoupon.id, stripePromoCode.id],
    );

    console.info(`[COUPON] Admin ${adminId} created coupon: ${normalizedCode} (Stripe coupon: ${stripeCoupon.id}, promo: ${stripePromoCode.id})`);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    // Handle Stripe-specific errors
    if (err?.type === 'StripeInvalidRequestError') {
      console.error('[COUPON] Stripe error creating coupon:', err.message);
      res.status(400).json({ error: `Stripe error: ${err.message}` });
      return;
    }
    console.error('Error creating coupon:', err);
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

// ──────────────────────────────────────────────────────────────
// PUT /:id — Update a coupon (description, max_uses, is_active, expires_at)
// ──────────────────────────────────────────────────────────────
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { description, max_uses, is_active, expires_at } = req.body;

    // Verify coupon exists and get Stripe IDs
    const existing = await query(
      `SELECT id, stripe_promotion_code_id FROM coupons WHERE id = $1`,
      [id],
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Coupon not found' });
      return;
    }

    const stripePromoCodeId = existing.rows[0].stripe_promotion_code_id;

    // Build dynamic SET clause
    const sets: string[] = ['updated_at = now()'];
    const values: any[] = [];
    let paramIdx = 1;

    if (description !== undefined) {
      sets.push(`description = $${paramIdx++}`);
      values.push(description);
    }
    if (max_uses !== undefined) {
      const parsed = max_uses != null ? parseInt(max_uses) : null;
      if (parsed != null && parsed < 1) {
        res.status(400).json({ error: 'Max uses must be at least 1' });
        return;
      }
      sets.push(`max_uses = $${paramIdx++}`);
      values.push(parsed);
    }
    if (is_active !== undefined) {
      sets.push(`is_active = $${paramIdx++}`);
      values.push(Boolean(is_active));

      // Sync active status with Stripe Promotion Code
      if (stripePromoCodeId) {
        try {
          await stripe.promotionCodes.update(stripePromoCodeId, {
            active: Boolean(is_active),
          });
        } catch (stripeErr) {
          console.error('[COUPON] Failed to sync Stripe promotion code status:', stripeErr);
        }
      }
    }
    if (expires_at !== undefined) {
      sets.push(`expires_at = $${paramIdx++}`);
      values.push(expires_at || null);
    }

    values.push(id);
    const result = await query(
      `UPDATE coupons SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values,
    );

    console.info(`[COUPON] Admin ${req.userId} updated coupon: ${id}`);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error updating coupon:', err);
    res.status(500).json({ error: 'Failed to update coupon' });
  }
});

// ──────────────────────────────────────────────────────────────
// DELETE /:id — Soft-deactivate a coupon (+ deactivate Stripe Promotion Code)
// ──────────────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE coupons SET is_active = false, updated_at = now()
       WHERE id = $1 RETURNING id, code, stripe_promotion_code_id`,
      [id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Coupon not found' });
      return;
    }

    // Deactivate the Stripe Promotion Code
    const stripePromoCodeId = result.rows[0].stripe_promotion_code_id;
    if (stripePromoCodeId) {
      try {
        await stripe.promotionCodes.update(stripePromoCodeId, { active: false });
      } catch (stripeErr) {
        console.error('[COUPON] Failed to deactivate Stripe promotion code:', stripeErr);
      }
    }

    console.info(`[COUPON] Admin ${req.userId} deactivated coupon: ${result.rows[0].code}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deactivating coupon:', err);
    res.status(500).json({ error: 'Failed to deactivate coupon' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /:id/redemptions — List redemptions for a coupon
// ──────────────────────────────────────────────────────────────
router.get('/:id/redemptions', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Verify coupon exists
    const coupon = await query(`SELECT id, code FROM coupons WHERE id = $1`, [id]);
    if (coupon.rows.length === 0) {
      res.status(404).json({ error: 'Coupon not found' });
      return;
    }

    const result = await query(
      `SELECT cr.*, u.email AS user_email
       FROM coupon_redemptions cr
       JOIN auth_users u ON u.id = cr.user_id
       WHERE cr.coupon_id = $1
       ORDER BY cr.redeemed_at DESC`,
      [id],
    );

    res.json({
      data: {
        redemptions: result.rows,
        total: result.rows.length,
      },
    });
  } catch (err) {
    console.error('Error listing redemptions:', err);
    res.status(500).json({ error: 'Failed to list redemptions' });
  }
});

export default router;
