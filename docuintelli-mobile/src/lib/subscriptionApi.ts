import { supabase } from './supabase';
import { API_BASE, SUPABASE_URL, SUPABASE_ANON_KEY, APP_SCHEME, STRIPE_STARTER_PRICE_ID, STRIPE_PRO_PRICE_ID } from './config';
import { getDeviceId } from './deviceId';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const deviceId = await getDeviceId();
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
  };
}

// Cancel subscription at period end
export async function cancelSubscription(): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/subscription/cancel`, {
    method: 'POST', headers,
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to cancel'); }
  return res.json();
}

// Reactivate a canceling subscription
export async function reactivateSubscription(): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/subscription/reactivate`, {
    method: 'POST', headers,
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to reactivate'); }
  return res.json();
}

// Upgrade subscription immediately (with proration)
export async function upgradeSubscription(newPlan: string): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/subscription/upgrade`, {
    method: 'POST', headers,
    body: JSON.stringify({ new_plan: newPlan }),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to upgrade'); }
  return res.json();
}

// Preview upgrade proration
export async function previewUpgrade(newPlan: string): Promise<{ prorated_amount: number; currency: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/subscription/upgrade-preview`, {
    method: 'POST', headers,
    body: JSON.stringify({ new_plan: newPlan }),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Preview failed'); }
  return res.json();
}

// Schedule downgrade at period end
export async function downgradeSubscription(newPlan: string, documentsToKeep?: string[]): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/subscription/downgrade`, {
    method: 'POST', headers,
    body: JSON.stringify({ new_plan: newPlan, documents_to_keep: documentsToKeep }),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to downgrade'); }
  return res.json();
}

// Get detailed subscription info (includes Stripe data)
export async function getSubscriptionDetails(): Promise<any> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/subscription/details`, { headers });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to get details'); }
  return res.json();
}

// Get Stripe checkout URL for a new subscription (caller opens in InAppBrowser)
export async function createCheckoutSession(plan: 'starter' | 'pro'): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const priceIds: Record<string, string> = {
    starter: STRIPE_STARTER_PRICE_ID,
    pro: STRIPE_PRO_PRICE_ID,
  };
  const priceId = priceIds[plan];
  if (!priceId) throw new Error(`Price ID not configured for ${plan} plan`);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      price_id: priceId,
      success_url: `${APP_SCHEME}://checkout/success`,
      cancel_url: `${APP_SCHEME}://checkout/cancel`,
      mode: 'subscription',
    }),
  });

  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Checkout failed'); }
  const { url } = await res.json();
  if (!url) throw new Error('No checkout URL returned');
  return url;
}

// Get Stripe customer portal URL (caller opens in InAppBrowser)
export async function getCustomerPortalUrl(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-customer-portal`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      return_url: `${APP_SCHEME}://billing`,
    }),
  });

  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Portal failed'); }
  const { url } = await res.json();
  if (!url) throw new Error('No portal URL returned');
  return url;
}

// Get billing data (payment methods, invoices, transactions) from Supabase tables
export async function getBillingData() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const [paymentMethods, invoices, transactions] = await Promise.all([
    supabase.from('payment_methods').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
    supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
  ]);

  return {
    paymentMethods: paymentMethods.data || [],
    invoices: invoices.data || [],
    transactions: transactions.data || [],
  };
}
