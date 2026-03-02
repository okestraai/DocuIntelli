import React from 'react';
import { Crown, Lock } from 'lucide-react';
import { usePricing } from '../hooks/usePricing';

interface ProFeatureGateProps {
  featureName: string;
  featureDescription: string;
  featureIcon: React.ElementType;
  onUpgrade: () => void;
  /** Minimum plan required: 'starter' or 'pro' (default 'pro') */
  requiredPlan?: 'starter' | 'pro';
  /** Compact mode for sidebars / small panels */
  compact?: boolean;
  children: React.ReactNode;
}

export function ProFeatureGate({
  featureName,
  featureDescription,
  featureIcon: Icon,
  onUpgrade,
  requiredPlan = 'pro',
  compact = false,
  children,
}: ProFeatureGateProps) {
  const { plans } = usePricing();
  const targetPlan = plans.find(p => p.id === requiredPlan);
  const price = targetPlan?.price.monthly ?? (requiredPlan === 'starter' ? 9 : 19);
  const planLabel = requiredPlan === 'starter' ? 'Starter' : 'Pro';

  return (
    <div className="relative overflow-hidden h-full">
      {/* Actual feature content — blurred, dimmed, non-interactive */}
      <div
        className="blur-[6px] opacity-50 pointer-events-none select-none h-full"
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Frosted overlay with upgrade CTA */}
      <div className="absolute inset-0 z-10 bg-gradient-to-b from-white/20 via-white/50 to-white/80 flex items-start justify-center">
        <div
          className={`mt-[12%] bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-200/80 text-center ${
            compact ? 'p-5 mx-3 max-w-[280px]' : 'p-8 mx-4 max-w-md'
          }`}
        >
          {/* Icon */}
          <div
            className={`inline-flex items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl ${
              compact ? 'p-2.5 mb-3' : 'p-3.5 mb-4'
            }`}
          >
            <Icon
              className={`text-emerald-600 ${compact ? 'h-6 w-6' : 'h-9 w-9'}`}
              strokeWidth={2}
            />
          </div>

          {/* Badge */}
          <div className="flex items-center justify-center mb-3">
            <span
              className={`inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-full ${
                compact ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
              }`}
            >
              <Crown className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
              {planLabel} Feature
            </span>
          </div>

          {/* Title + description */}
          <h3
            className={`font-bold text-slate-900 ${
              compact ? 'text-base mb-1' : 'text-xl mb-1.5'
            }`}
          >
            {featureName}
          </h3>
          <p
            className={`text-slate-600 ${
              compact ? 'text-xs mb-4 leading-relaxed' : 'text-sm mb-5'
            }`}
          >
            {featureDescription}
          </p>

          {/* CTA */}
          <button
            onClick={onUpgrade}
            className={`inline-flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 shadow-md hover:shadow-xl transform hover:-translate-y-0.5 transition-all ${
              compact ? 'py-2 px-4 text-sm' : 'py-2.5 px-6'
            }`}
          >
            <Lock className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
            Upgrade to {planLabel}
          </button>

          {!compact && (
            <p className="text-xs text-slate-500 mt-3">
              ${price}/mo — cancel anytime
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
