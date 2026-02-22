import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

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

export function useSubscription(): UseSubscriptionReturn {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentCount, setDocumentCount] = useState(0);

  const fetchSubscription = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError('User not authenticated');
        setLoading(false);
        return;
      }

      const { data: subData, error: subError } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (subError) {
        if (subError.code === 'PGRST116') {
          const { data: newSub, error: createError } = await supabase
            .from('user_subscriptions')
            .insert({
              user_id: user.id,
              plan: 'free',
              status: 'active',
              document_limit: 3,
              ai_questions_limit: 5,
              ai_questions_used: 0,
              monthly_upload_limit: 3,
              monthly_uploads_used: 0,
            })
            .select()
            .single();

          if (createError) throw createError;
          setSubscription(newSub);
        } else {
          throw subError;
        }
      } else {
        setSubscription(subData);
      }

      const { count, error: countError } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (countError) throw countError;
      setDocumentCount(count || 0);

      setError(null);
    } catch (err) {
      console.error('Error fetching subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch subscription');
    } finally {
      setLoading(false);
    }
  };

  const incrementAIQuestions = async () => {
    if (!subscription) {
      console.warn('Cannot increment AI questions: No subscription loaded');
      return;
    }

    const newCount = subscription.ai_questions_used + 1;
    console.log(`Incrementing AI questions: ${subscription.ai_questions_used} → ${newCount}`);

    try {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({
          ai_questions_used: newCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);

      if (error) throw error;

      // Update local state immediately for responsive UI
      setSubscription({
        ...subscription,
        ai_questions_used: newCount,
      });

      console.log(`✅ AI question counter updated successfully to ${newCount}`);
    } catch (err) {
      console.error('❌ Error incrementing AI questions:', err);
      // Still update local state to prevent UI from feeling broken
      setSubscription({
        ...subscription,
        ai_questions_used: newCount,
      });
    }
  };

  const incrementMonthlyUploads = async () => {
    if (!subscription) {
      console.warn('Cannot increment monthly uploads: No subscription loaded');
      return;
    }

    const newCount = subscription.monthly_uploads_used + 1;

    try {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({
          monthly_uploads_used: newCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);

      if (error) throw error;

      setSubscription({
        ...subscription,
        monthly_uploads_used: newCount,
      });
    } catch (err) {
      console.error('Error incrementing monthly uploads:', err);
      setSubscription({
        ...subscription,
        monthly_uploads_used: newCount,
      });
    }
  };

  useEffect(() => {
    fetchSubscription();

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
