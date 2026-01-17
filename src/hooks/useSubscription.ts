import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface Subscription {
  id: string;
  user_id: string;
  plan: 'free' | 'pro' | 'business';
  status: 'active' | 'canceled' | 'expired' | 'trialing';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  document_limit: number;
  ai_questions_limit: number;
  ai_questions_used: number;
  ai_questions_reset_date: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
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
              document_limit: 5,
              ai_questions_limit: 10,
              ai_questions_used: 0,
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
    if (!subscription) return;

    try {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({
          ai_questions_used: subscription.ai_questions_used + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);

      if (error) throw error;

      setSubscription({
        ...subscription,
        ai_questions_used: subscription.ai_questions_used + 1,
      });
    } catch (err) {
      console.error('Error incrementing AI questions:', err);
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

  const canUploadDocument = loading
    ? true
    : subscription
    ? subscription.plan !== 'free' || documentCount < subscription.document_limit
    : true;

  const canAskQuestion = loading
    ? true
    : subscription
    ? subscription.plan === 'business' || subscription.ai_questions_used < subscription.ai_questions_limit
    : true;

  return {
    subscription,
    loading,
    error,
    canUploadDocument,
    canAskQuestion,
    documentCount,
    refreshSubscription: fetchSubscription,
    incrementAIQuestions,
  };
}
