import { useState, useEffect, useCallback } from 'react';
import { fetchPlanPrices, type StripePrices } from '../lib/api';
import { PLANS, type PlanData } from '../lib/planLimits';

// Module-level client cache (shared across all hook instances)
let clientCache: { prices: StripePrices; fetchedAt: number } | null = null;
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function usePricing() {
  const [prices, setPrices] = useState<StripePrices | null>(clientCache?.prices ?? null);
  const [loading, setLoading] = useState(!clientCache);

  const refresh = useCallback(async () => {
    const now = Date.now();

    if (clientCache && (now - clientCache.fetchedAt) < CLIENT_CACHE_TTL) {
      setPrices(clientCache.prices);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const fetched = await fetchPlanPrices();
      clientCache = { prices: fetched, fetchedAt: now };
      setPrices(fetched);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Merge dynamic prices into the static PLANS array
  const plans: PlanData[] = PLANS.map(plan => {
    if (!prices) return plan;
    const dynamicPrice = prices[plan.id];
    if (!dynamicPrice) return plan;
    return {
      ...plan,
      price: { monthly: dynamicPrice.monthly, yearly: dynamicPrice.yearly },
    };
  });

  return { plans, prices, loading, refresh };
}
