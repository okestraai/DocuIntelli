import { Router, Request, Response } from 'express';
import Stripe from 'stripe';

const router = Router();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeStarterPriceId = process.env.STRIPE_STARTER_PRICE_ID;
const stripeProPriceId = process.env.STRIPE_PRO_PRICE_ID;
const stripeStarterYearlyPriceId = process.env.STRIPE_STARTER_YEARLY_PRICE_ID;
const stripeProYearlyPriceId = process.env.STRIPE_PRO_YEARLY_PRICE_ID;

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2026-01-28.clover' })
  : null;

interface PlanPricing {
  monthly: number;
  yearly: number;
}

interface PricingResponse {
  free: PlanPricing;
  starter: PlanPricing;
  pro: PlanPricing;
}

// In-memory cache
let priceCache: { data: PricingResponse | null; fetchedAt: number } = {
  data: null,
  fetchedAt: 0,
};
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const FALLBACK_PRICES: PricingResponse = {
  free: { monthly: 0, yearly: 0 },
  starter: { monthly: 7, yearly: 70 },
  pro: { monthly: 19, yearly: 190 },
};

async function fetchStripePrices(): Promise<PricingResponse> {
  if (!stripe || !stripeStarterPriceId || !stripeProPriceId) {
    console.warn('Stripe not configured for pricing endpoint, using fallback');
    return FALLBACK_PRICES;
  }

  const [starterPrice, proPrice] = await Promise.all([
    stripe.prices.retrieve(stripeStarterPriceId),
    stripe.prices.retrieve(stripeProPriceId),
  ]);

  const starterMonthly = (starterPrice.unit_amount || 700) / 100;
  const proMonthly = (proPrice.unit_amount || 1900) / 100;

  // Use yearly price IDs if available, otherwise derive from monthly
  let starterYearly = starterMonthly * 10;
  let proYearly = proMonthly * 10;

  if (stripeStarterYearlyPriceId && stripeProYearlyPriceId) {
    const [starterYearlyPrice, proYearlyPrice] = await Promise.all([
      stripe.prices.retrieve(stripeStarterYearlyPriceId),
      stripe.prices.retrieve(stripeProYearlyPriceId),
    ]);
    starterYearly = (starterYearlyPrice.unit_amount || starterYearly * 100) / 100;
    proYearly = (proYearlyPrice.unit_amount || proYearly * 100) / 100;
  }

  return {
    free: { monthly: 0, yearly: 0 },
    starter: { monthly: starterMonthly, yearly: starterYearly },
    pro: { monthly: proMonthly, yearly: proYearly },
  };
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const now = Date.now();

    if (priceCache.data && (now - priceCache.fetchedAt) < CACHE_TTL_MS) {
      res.json({ success: true, prices: priceCache.data });
      return;
    }

    const prices = await fetchStripePrices();
    priceCache = { data: prices, fetchedAt: now };
    res.json({ success: true, prices });
  } catch (err: any) {
    console.error('Failed to fetch Stripe prices:', err.message);

    // Return stale cache if available
    if (priceCache.data) {
      res.json({ success: true, prices: priceCache.data });
      return;
    }

    // Ultimate fallback
    res.json({ success: true, prices: FALLBACK_PRICES });
  }
});

export default router;
