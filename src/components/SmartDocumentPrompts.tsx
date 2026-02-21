import React, { useState, useEffect, useCallback } from 'react';
import {
  Home,
  Car,
  GraduationCap,
  Landmark,
  FileText,
  X,
  Upload,
  Target,
} from 'lucide-react';
import {
  getDetectedLoans,
  dismissDetectedLoan,
  linkDocumentToLoan,
  DetectedLoanPrompt,
} from '../lib/financialApi';
import { UploadModal } from './UploadModal';
import { useDocuments } from '../hooks/useDocuments';
import type { DocumentUploadRequest } from '../lib/api';

const LOAN_CONFIG: Record<string, {
  icon: React.ElementType;
  bg: string;
  border: string;
  iconColor: string;
  badge: string;
}> = {
  mortgage: {
    icon: Home,
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    iconColor: 'text-blue-600',
    badge: 'bg-blue-100 text-blue-700',
  },
  auto_loan: {
    icon: Car,
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    iconColor: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
  },
  student_loan: {
    icon: GraduationCap,
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    iconColor: 'text-purple-600',
    badge: 'bg-purple-100 text-purple-700',
  },
  personal_loan: {
    icon: Landmark,
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    iconColor: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  other: {
    icon: FileText,
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    iconColor: 'text-slate-600',
    badge: 'bg-slate-100 text-slate-700',
  },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface SmartDocumentPromptsProps {
  onUploadComplete: () => void;
}

export function SmartDocumentPrompts({ onUploadComplete }: SmartDocumentPromptsProps) {
  const [loans, setLoans] = useState<DetectedLoanPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoan, setSelectedLoan] = useState<DetectedLoanPrompt | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const { uploadDocuments } = useDocuments(true);

  const loadLoans = useCallback(async () => {
    try {
      setLoading(true);
      const detected = await getDetectedLoans();
      setLoans(detected);
    } catch (err) {
      console.error('Failed to load detected loans:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLoans(); }, [loadLoans]);

  const handleDismiss = async (loanId: string) => {
    try {
      setDismissing(loanId);
      await dismissDetectedLoan(loanId);
      setLoans(prev => prev.filter(l => l.id !== loanId));
    } catch (err) {
      console.error('Failed to dismiss:', err);
    } finally {
      setDismissing(null);
    }
  };

  const handleUploadClick = (loan: DetectedLoanPrompt) => {
    setSelectedLoan(loan);
    setShowUploadModal(true);
  };

  const handleUpload = async (docs: DocumentUploadRequest[]) => {
    const docIds = await uploadDocuments(docs);
    if (docIds.length > 0 && selectedLoan) {
      await linkDocumentToLoan(selectedLoan.id, docIds[0]);
      setLoans(prev => prev.filter(l => l.id !== selectedLoan.id));
    }
    setShowUploadModal(false);
    setSelectedLoan(null);
    onUploadComplete();
  };

  // Don't render anything if loading or no loans detected
  if (loading || loans.length === 0) return null;

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-5 w-5 text-emerald-600" />
          <h3 className="text-lg font-semibold text-slate-900">Optimize Your Debts</h3>
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
            {loans.length} detected
          </span>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          We detected recurring loan payments in your transactions. Upload your statements for personalized payoff analysis.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {loans.map(loan => {
            const config = LOAN_CONFIG[loan.loan_type] || LOAN_CONFIG.other;
            const Icon = config.icon;

            return (
              <div
                key={loan.id}
                className={`relative ${config.bg} ${config.border} border rounded-xl p-4 transition-all hover:shadow-md`}
              >
                {/* Dismiss button */}
                <button
                  onClick={() => handleDismiss(loan.id)}
                  disabled={dismissing === loan.id}
                  className="absolute top-3 right-3 p-1 text-slate-400 hover:text-slate-600 hover:bg-white/60 rounded-lg transition-colors"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* Header */}
                <div className="flex items-center gap-2 mb-2 pr-6">
                  <div className={`p-1.5 rounded-lg bg-white/60`}>
                    <Icon className={`h-5 w-5 ${config.iconColor}`} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm">{loan.display_name}</h4>
                    <p className="text-xs text-slate-500">
                      ~{formatCurrency(loan.estimated_monthly_payment)}/mo
                      {loan.frequency !== 'monthly' ? ` (${loan.frequency})` : ''}
                    </p>
                  </div>
                </div>

                {/* Prompt text */}
                <p className="text-xs text-slate-600 mb-3 leading-relaxed">{loan.prompt_text}</p>

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => handleUploadClick(loan)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-semibold rounded-lg hover:from-emerald-700 hover:to-teal-700 transition-all shadow-sm"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload Document
                  </button>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${config.badge}`}>
                    {Math.round(loan.confidence * 100)}% match
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => { setShowUploadModal(false); setSelectedLoan(null); }}
        onUpload={handleUpload}
        renewalOf={selectedLoan ? {
          documentId: '',
          name: `${selectedLoan.display_name} Statement`,
          category: 'contract',
        } : null}
      />
    </>
  );
}
