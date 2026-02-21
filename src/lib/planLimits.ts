import { Zap, Crown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface PlanFeature {
  text: string;
  included: boolean;
}

export interface PlanData {
  id: PlanId;
  name: string;
  icon: LucideIcon;
  price: { monthly: number; yearly: number };
  description: string;
  features: PlanFeature[];
  cta: string;
  popular: boolean;
}

export const PLAN_LIMITS = {
  free: { documents: 3, monthlyUploads: 3, devices: 1, name: 'Free' },
  starter: { documents: 25, monthlyUploads: 30, devices: 2, name: 'Starter' },
  pro: { documents: 100, monthlyUploads: 150, devices: 5, name: 'Pro' },
} as const;

export type PlanId = keyof typeof PLAN_LIMITS;

export const PLANS: PlanData[] = [
  {
    id: 'free',
    name: 'Free',
    icon: Zap,
    price: { monthly: 0, yearly: 0 },
    description: 'For trial users',
    features: [
      { text: '3 documents', included: true },
      { text: '3 uploads per month', included: true },
      { text: '5 AI questions per month', included: true },
      { text: 'File upload only', included: true },
      { text: '1 device', included: true },
      { text: 'Standard LLM queue (lowest priority)', included: true },
      { text: 'URL ingestion', included: false },
      { text: 'Background embedding refresh', included: false },
      { text: 'Auto tag generation', included: false },
      { text: 'OCR for images', included: false },
      { text: 'Email notifications', included: false },
    ],
    cta: 'Current Plan',
    popular: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    icon: Zap,
    price: { monthly: 7, yearly: 70 },
    description: 'For individuals',
    features: [
      { text: '25 documents', included: true },
      { text: '30 uploads per month', included: true },
      { text: 'Unlimited AI chats', included: true },
      { text: 'File + URL ingestion', included: true },
      { text: 'OCR for images', included: true },
      { text: 'Weekly Audit', included: true },
      { text: '2 devices', included: true },
      { text: 'Email notifications', included: true },
      { text: 'Standard LLM queue (medium priority)', included: true },
      { text: 'Background embedding generation', included: true },
      { text: 'Auto tags enabled', included: true },
      { text: 'Life Events planner', included: false },
      { text: 'Document Health panel', included: false },
      { text: 'Global Search across documents', included: false },
      { text: 'Priority support', included: false },
    ],
    cta: 'Upgrade to Starter',
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    icon: Crown,
    price: { monthly: 19, yearly: 190 },
    description: 'For power users & families',
    features: [
      { text: '100 documents', included: true },
      { text: '150 uploads per month', included: true },
      { text: 'Unlimited AI chats', included: true },
      { text: 'File + URL ingestion', included: true },
      { text: 'All Starter features', included: true },
      { text: 'Life Events planner', included: true },
      { text: 'Document Health panel', included: true },
      { text: 'Global Search across documents', included: true },
      { text: 'Priority LLM queue', included: true },
      { text: 'Faster embedding generation', included: true },
      { text: 'Advanced tagging & relationship mapping', included: true },
      { text: 'AI summaries + key data extraction', included: true },
      { text: 'Up to 5 devices', included: true },
      { text: 'Priority support', included: true },
    ],
    cta: 'Upgrade to Pro',
    popular: true,
  },
];

export function getPlanById(id: PlanId): PlanData {
  return PLANS.find(p => p.id === id)!;
}

export function getDocumentOverage(currentCount: number, targetPlan: PlanId): number {
  return Math.max(0, currentCount - PLAN_LIMITS[targetPlan].documents);
}

export function requiresCompliance(currentCount: number, targetPlan: PlanId): boolean {
  return getDocumentOverage(currentCount, targetPlan) > 0;
}
