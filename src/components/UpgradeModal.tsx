import { X, Check } from 'lucide-react';
import { usePricing } from '../hooks/usePricing';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: (plan: 'starter' | 'pro') => void;
  reason?: 'documents' | 'ai-questions' | 'monthly-uploads' | 'features';
  currentPlan?: 'free' | 'starter' | 'pro';
  currentUsage?: {
    documents: number;
    documentLimit: number;
    aiQuestions: number;
    aiQuestionsLimit: number;
    monthlyUploads?: number;
    monthlyUploadLimit?: number;
  };
}

export function UpgradeModal({ isOpen, onClose, onUpgrade, reason = 'features', currentPlan = 'free', currentUsage }: UpgradeModalProps) {
  const { plans } = usePricing();

  if (!isOpen) return null;

  const starterPlan = plans.find(p => p.id === 'starter')!;
  const proPlan = plans.find(p => p.id === 'pro')!;

  const getTitle = () => {
    switch (reason) {
      case 'documents':
        return 'Document Limit Reached';
      case 'ai-questions':
        return 'AI Question Limit Reached';
      case 'monthly-uploads':
        return 'Monthly Upload Limit Reached';
      case 'features':
        return 'Upgrade to Pro to Unlock';
      default:
        return 'Upgrade to Unlock More';
    }
  };

  const getMessage = () => {
    switch (reason) {
      case 'documents':
        return `You've reached your limit of ${currentUsage?.documentLimit || 3} documents. Upgrade to get more storage.`;
      case 'ai-questions':
        return `You've used all ${currentUsage?.aiQuestionsLimit || 5} AI questions this month. Upgrade for unlimited AI chats.`;
      case 'monthly-uploads':
        return `You've used all ${currentUsage?.monthlyUploadLimit || 3} uploads for this month. Upgrade your plan for a higher monthly upload quota.`;
      case 'features':
        return 'Life Events and Document Health are Pro-exclusive features. Weekly Audit is available from the Starter plan.';
      default:
        return 'Unlock more documents and unlimited AI chats with our paid plans.';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{getTitle()}</h2>
            <p className="text-slate-600 mt-1">{getMessage()}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Usage Stats — only show when triggered by a limit, not a feature gate */}
        {currentUsage && reason !== 'features' && (
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="text-sm text-slate-600 mb-1">Documents</div>
                <div className="text-2xl font-bold text-slate-900">
                  {currentUsage.documents} / {currentUsage.documentLimit}
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                  <div
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min((currentUsage.documents / currentUsage.documentLimit) * 100, 100)}%` }}
                  />
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="text-sm text-slate-600 mb-1">Uploads This Month</div>
                <div className="text-2xl font-bold text-slate-900">
                  {currentUsage.monthlyUploads ?? 0} / {currentUsage.monthlyUploadLimit ?? 3}
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                  <div
                    className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(((currentUsage.monthlyUploads ?? 0) / (currentUsage.monthlyUploadLimit ?? 3)) * 100, 100)}%` }}
                  />
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="text-sm text-slate-600 mb-1">AI Questions This Month</div>
                <div className="text-2xl font-bold text-slate-900">
                  {currentUsage.aiQuestions} / {currentUsage.aiQuestionsLimit >= 999999 ? '\u221E' : currentUsage.aiQuestionsLimit}
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                  <div
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 h-2 rounded-full transition-all"
                    style={{
                      width: currentUsage.aiQuestionsLimit >= 999999
                        ? '0%'
                        : `${Math.min((currentUsage.aiQuestions / currentUsage.aiQuestionsLimit) * 100, 100)}%`
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Plans */}
        <div className="p-6">
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Starter Plan */}
            {(() => {
              const Icon = starterPlan.icon;
              const includedFeatures = starterPlan.features.filter(f => f.included);
              return (
                <div className={`relative bg-white border-2 rounded-xl p-6 transition-all ${
                  currentPlan === 'starter'
                    ? 'border-blue-500 shadow-lg ring-4 ring-blue-100'
                    : 'border-slate-200 hover:border-slate-300'
                }`}>
                  {currentPlan === 'starter' && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-blue-600 text-white text-sm font-bold px-4 py-1 rounded-full">
                        Current Plan
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-slate-100 p-3 rounded-xl">
                      <Icon className="h-6 w-6 text-slate-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">{starterPlan.name}</h3>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-slate-900">${starterPlan.price.monthly}</span>
                        <span className="text-slate-600">/month</span>
                      </div>
                    </div>
                  </div>

                  <ul className="space-y-3 mb-6">
                    {includedFeatures.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <span className="text-slate-700">{feature.text}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => currentPlan !== 'starter' && onUpgrade('starter')}
                    disabled={currentPlan === 'starter'}
                    className={`w-full font-semibold py-3 px-6 rounded-xl transition-all ${
                      currentPlan === 'starter'
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-900 text-white hover:bg-slate-800 shadow-md hover:shadow-xl'
                    }`}
                  >
                    {currentPlan === 'starter' ? '\u2713 Current Plan' : starterPlan.cta}
                  </button>
                </div>
              );
            })()}

            {/* Pro Plan */}
            {(() => {
              const Icon = proPlan.icon;
              const includedFeatures = proPlan.features.filter(f => f.included);
              return (
                <div className={`relative bg-white border-2 rounded-xl p-6 shadow-lg ${
                  currentPlan === 'pro'
                    ? 'border-blue-500 ring-4 ring-blue-100'
                    : 'border-emerald-500'
                }`}>
                  {currentPlan === 'pro' ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-blue-600 text-white text-sm font-bold px-4 py-1 rounded-full">
                        Current Plan
                      </span>
                    </div>
                  ) : (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold px-4 py-1 rounded-full">
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-gradient-to-br from-emerald-100 to-teal-100 p-3 rounded-xl">
                      <Icon className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">{proPlan.name}</h3>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-slate-900">${proPlan.price.monthly}</span>
                        <span className="text-slate-600">/month</span>
                      </div>
                    </div>
                  </div>

                  <ul className="space-y-3 mb-6">
                    {includedFeatures.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <span className="text-slate-700">{feature.text}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => currentPlan !== 'pro' && onUpgrade('pro')}
                    disabled={currentPlan === 'pro'}
                    className={`w-full font-semibold py-3 px-6 rounded-xl transition-all ${
                      currentPlan === 'pro'
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 shadow-md hover:shadow-xl transform hover:-translate-y-0.5'
                    }`}
                  >
                    {currentPlan === 'pro' ? '\u2713 Current Plan' : proPlan.cta}
                  </button>
                </div>
              );
            })()}

          </div>

          {/* Footer Note */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              Cancel anytime. No hidden fees. Your data stays yours.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
