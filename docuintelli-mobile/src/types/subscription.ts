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
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  pending_plan: string | null;
  documents_to_keep: string[] | null;
}

export type PlanId = 'free' | 'starter' | 'pro';
