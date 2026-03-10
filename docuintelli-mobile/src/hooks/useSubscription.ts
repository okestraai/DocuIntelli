import { useState, useEffect, useCallback, useRef } from 'react';
import { auth } from '../lib/auth';
import { API_BASE } from '../lib/config';
import type { Subscription } from '../types/subscription';

interface UseSubscriptionReturn {
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
  canUploadDocument: boolean;
  canAskQuestion: boolean;
  isPro: boolean;
  isStarterOrAbove: boolean;
  documentCount: number;
  bankAccountLimit: number;
  refreshSubscription: () => Promise<void>;
  incrementAIQuestions: () => Promise<void>;
  incrementMonthlyUploads: () => Promise<void>;
}

export function useSubscription(): UseSubscriptionReturn {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentCount, setDocumentCount] = useState(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSubscription = useCallback(async () => {
    try {
      const { data: { session } } = await auth.getSession();
      if (!session) {
        setError('User not authenticated');
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE}/api/subscription/current`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

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

  const incrementAIQuestions = async () => {
    if (!subscription) return;
    setSubscription({ ...subscription, ai_questions_used: subscription.ai_questions_used + 1 });
    try {
      const { data: { session } } = await auth.getSession();
      if (!session) return;
      await fetch(`${API_BASE}/api/subscription/increment-questions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    } catch (err) {
      console.error('Error incrementing AI questions:', err);
    }
  };

  const incrementMonthlyUploads = async () => {
    if (!subscription) return;
    setSubscription({ ...subscription, monthly_uploads_used: subscription.monthly_uploads_used + 1 });
    try {
      const { data: { session } } = await auth.getSession();
      if (!session) return;
      await fetch(`${API_BASE}/api/subscription/increment-uploads`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    } catch (err) {
      console.error('Error incrementing monthly uploads:', err);
    }
  };

  useEffect(() => {
    fetchSubscription();

    // Poll every 60 seconds instead of Supabase Realtime subscription
    pollIntervalRef.current = setInterval(fetchSubscription, 60_000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const withinStorageLimit = loading ? true : subscription ? documentCount < subscription.document_limit : false;
  const withinMonthlyQuota = loading ? true : subscription ? subscription.monthly_uploads_used < subscription.monthly_upload_limit : false;
  const canUploadDocument = withinStorageLimit && withinMonthlyQuota;
  const canAskQuestion = loading
    ? true
    : subscription
    ? (subscription.tokens_used ?? 0) < (subscription.tokens_limit ?? 50000)
    : false;

  const plan = subscription?.plan;
  const isPro = plan === 'pro';
  const isStarterOrAbove = plan === 'starter' || plan === 'pro';
  const bankAccountLimit = subscription?.bank_account_limit ?? 0;

  return {
    subscription,
    loading,
    error,
    canUploadDocument,
    canAskQuestion,
    isPro,
    isStarterOrAbove,
    documentCount,
    bankAccountLimit,
    refreshSubscription: fetchSubscription,
    incrementAIQuestions,
    incrementMonthlyUploads,
  };
}
