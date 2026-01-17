import React from 'react';
import { X, Crown, Zap, Check } from 'lucide-react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: (plan: 'pro' | 'business') => void;
  reason?: 'documents' | 'ai-questions' | 'features';
  currentUsage?: {
    documents: number;
    documentLimit: number;
    aiQuestions: number;
    aiQuestionsLimit: number;
  };
}

export function UpgradeModal({ isOpen, onClose, onUpgrade, reason = 'features', currentUsage }: UpgradeModalProps) {
  if (!isOpen) return null;

  const getTitle = () => {
    switch (reason) {
      case 'documents':
        return 'Document Limit Reached';
      case 'ai-questions':
        return 'AI Question Limit Reached';
      default:
        return 'Upgrade to Unlock More';
    }
  };

  const getMessage = () => {
    switch (reason) {
      case 'documents':
        return `You've reached your limit of ${currentUsage?.documentLimit || 5} documents. Upgrade to Pro for unlimited documents.`;
      case 'ai-questions':
        return `You've used all ${currentUsage?.aiQuestionsLimit || 10} AI questions this month. Upgrade to Pro for 100 questions per month.`;
      default:
        return 'Unlock unlimited documents and more AI questions with our Pro plan.';
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

        {/* Usage Stats (if available) */}
        {currentUsage && (
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <div className="grid grid-cols-2 gap-4">
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
                <div className="text-sm text-slate-600 mb-1">AI Questions This Month</div>
                <div className="text-2xl font-bold text-slate-900">
                  {currentUsage.aiQuestions} / {currentUsage.aiQuestionsLimit}
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                  <div
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min((currentUsage.aiQuestions / currentUsage.aiQuestionsLimit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Plans */}
        <div className="p-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Pro Plan */}
            <div className="relative bg-white border-2 border-emerald-500 rounded-xl p-6 shadow-lg">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold px-4 py-1 rounded-full">
                  Most Popular
                </span>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className="bg-gradient-to-br from-emerald-100 to-teal-100 p-3 rounded-xl">
                  <Crown className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Pro Plan</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-slate-900">$9</span>
                    <span className="text-slate-600">/month</span>
                  </div>
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Unlimited documents</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">100 AI questions per month</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Smart expiration reminders</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">OCR for scanned documents</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Priority processing</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">All devices sync</span>
                </li>
              </ul>

              <button
                onClick={() => onUpgrade('pro')}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Upgrade to Pro
              </button>
            </div>

            {/* Business Plan */}
            <div className="bg-white border-2 border-slate-200 rounded-xl p-6 hover:border-slate-300 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-slate-100 p-3 rounded-xl">
                  <Zap className="h-6 w-6 text-slate-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Business Plan</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-slate-900">$29</span>
                    <span className="text-slate-600">/month</span>
                  </div>
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Everything in Pro</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Unlimited AI questions</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Team sharing (5 members)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Bulk document upload</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Advanced analytics</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Dedicated support</span>
                </li>
              </ul>

              <button
                onClick={() => onUpgrade('business')}
                className="w-full bg-slate-900 text-white font-semibold py-3 px-6 rounded-xl hover:bg-slate-800 transition-all shadow-md hover:shadow-xl"
              >
                Upgrade to Business
              </button>
            </div>
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
