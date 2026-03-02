import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface Subscription {
  id: string;
  user_id: string;
  plan: 'free' | 'starter' | 'pro';
  status: 'active' | 'canceling' | 'canceled' | 'expired' | 'trialing';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  document_limit: number;
  ai_questions_limit: number;
  ai_questions_used: number;
  ai_questions_reset_date: string;
  monthly_upload_limit: number;
  monthly_uploads_used: number;
  monthly_upload_reset_date: string;
  bank_account_limit?: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  pending_plan: string | null;
  documents_to_keep: string[] | null;
  payment_status?: 'active' | 'past_due' | 'restricted' | 'downgraded';
  dunning_step?: number;
  payment_failed_at?: string | null;
  deletion_scheduled_at?: string | null;
}

interface UseSubscriptionReturn {
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
  canUploadDocument: boolean;
  canAskQuestion: boolean;
  documentCount: number;
  refreshSubscription: () => Promise<void>;
  incrementAIQuestions: () => Promise<void>;
  incrementMonthlyUploads: () => Promise<void>;
}

async function getAuthHeaders(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
  try {
    const proof = sessionStorage.getItem('docuintelli_impersonation_proof');
    if (proof) headers['X-Impersonation-Proof'] = proof;
  } catch { /* sessionStorage unavailable */ }
  return headers;
}

export function useSubscription(): UseSubscriptionReturn {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentCount, setDocumentCount] = useState(0);

  const fetchSubscription = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      if (!headers) {
        setError('User not authenticated');
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE}/api/subscription/current`, { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to fetch subscription' }));
        throw new Error(errData.error || 'Failed to fetch subscription');
      }

      const data = await res.json();
      setSubscription(data.subscription);
      setDocumentCount(data.documentCount || 0);
      setError(null);
    } catch (err) {
      console.error('Error fetching subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch subscription');
    } finally {
      setLoading(false);
    }
  }, []);

  const isImpersonated = (() => {
    try { return sessionStorage.getItem('docuintelli_impersonated') === 'true'; }
    catch { return false; }
  })();

  const incrementAIQuestions = async () => {
    if (!subscription) {
      console.warn('Cannot increment AI questions: No subscription loaded');
      return;
    }

    // Admin impersonation: don't charge the user's quota
    if (isImpersonated) return;

    const newCount = subscription.ai_questions_used + 1;
    console.log(`Incrementing AI questions: ${subscription.ai_questions_used} → ${newCount}`);

    // Update local state immediately for responsive UI
    setSubscription({ ...subscription, ai_questions_used: newCount });

    try {
      const headers = await getAuthHeaders();
      if (!headers) return;

      const res = await fetch(`${API_BASE}/api/subscription/increment-questions`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) throw new Error('Failed to increment AI questions');
      console.log(`✅ AI question counter updated successfully to ${newCount}`);
    } catch (err) {
      console.error('❌ Error incrementing AI questions:', err);
    }
  };

  const incrementMonthlyUploads = async () => {
    if (!subscription) {
      console.warn('Cannot increment monthly uploads: No subscription loaded');
      return;
    }

    // Admin impersonation: don't charge the user's quota
    if (isImpersonated) return;

    const newCount = subscription.monthly_uploads_used + 1;

    // Update local state immediately for responsive UI
    setSubscription({ ...subscription, monthly_uploads_used: newCount });

    try {
      const headers = await getAuthHeaders();
      if (!headers) return;

      const res = await fetch(`${API_BASE}/api/subscription/increment-uploads`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) throw new Error('Failed to increment uploads');
    } catch (err) {
      console.error('Error incrementing monthly uploads:', err);
    }
  };

  useEffect(() => {
    fetchSubscription();

    // Re-fetch when auth state changes (e.g., impersonation session established)
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          fetchSubscription();
        } else if (event === 'SIGNED_OUT') {
          setSubscription(null);
          setDocumentCount(0);
          setLoading(false);
        }
      }
    );

    // Keep realtime channel — it just triggers an API refetch
    const channel = supabase
      .channel('subscription-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_subscriptions',
        },
        () => {
          fetchSubscription();
        }
      )
      .subscribe();

    return () => {
      authSub.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const withinStorageLimit = loading
    ? true
    : subscription
    ? documentCount < subscription.document_limit
    : false;

  const withinMonthlyQuota = loading
    ? true
    : subscription
    ? subscription.monthly_uploads_used < subscription.monthly_upload_limit
    : false;

  const canUploadDocument = withinStorageLimit && withinMonthlyQuota;

  const canAskQuestion = loading
    ? true
    : subscription
    ? subscription.plan !== 'free' || subscription.ai_questions_used < subscription.ai_questions_limit
    : false;

  const bankAccountLimit = subscription?.bank_account_limit ?? 0;

  return {
    subscription,
    loading,
    error,
    canUploadDocument,
    canAskQuestion,
    documentCount,
    bankAccountLimit,
    refreshSubscription: fetchSubscription,
    incrementAIQuestions,
    incrementMonthlyUploads,
  };
}
