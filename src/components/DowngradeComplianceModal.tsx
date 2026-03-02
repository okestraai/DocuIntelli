import { useState, useEffect, useMemo } from 'react';
import {
  X, AlertTriangle, FileText, CheckCircle, Search,
  Shield, ArrowLeft, Loader2, Tag, Calendar
} from 'lucide-react';
import { getDocuments, SupabaseDocument } from '../lib/supabase';
import { downgradeSubscription } from '../lib/api';
import { PLAN_LIMITS, type PlanId } from '../lib/planLimits';
import { formatUTCDate } from '../lib/dateUtils';

interface DowngradeComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentPlan: PlanId;
  targetPlan: PlanId;
  currentDocumentCount: number;
  targetDocumentLimit: number;
}

type Phase = 'warning' | 'selection' | 'execution' | 'completion';

export function DowngradeComplianceModal({
  isOpen,
  onClose,
  onSuccess,
  currentPlan,
  targetPlan,
  currentDocumentCount,
  targetDocumentLimit,
}: DowngradeComplianceModalProps) {
  const [phase, setPhase] = useState<Phase>('warning');
  const [documents, setDocuments] = useState<SupabaseDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const targetName = PLAN_LIMITS[targetPlan].name;

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhase('warning');
      setSelectedIds(new Set());
      setSearchQuery('');
      setError(null);
      setDocuments([]);
    }
  }, [isOpen]);

  // Fetch documents when entering selection phase
  useEffect(() => {
    if (phase === 'selection' && documents.length === 0) {
      loadDocuments();
    }
  }, [phase]);

  const loadDocuments = async () => {
    setDocsLoading(true);
    try {
      const docs = await getDocuments();
      setDocuments(docs);
    } catch {
      setError('Failed to load documents. Please try again.');
    } finally {
      setDocsLoading(false);
    }
  };

  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(
      (doc) =>
        doc.name.toLowerCase().includes(q) ||
        doc.category.toLowerCase().includes(q) ||
        (doc.tags && doc.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }, [documents, searchQuery]);

  const toggleDoc = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        // Enforce max selection = targetDocumentLimit
        if (next.size >= targetDocumentLimit) return prev;
        next.add(id);
      }
      return next;
    });
  };

  const handleExecute = async () => {
    setPhase('execution');
    setError(null);

    try {
      const keepIds = Array.from(selectedIds);
      const result = await downgradeSubscription(targetPlan, keepIds);
      if (!result.success) {
        throw new Error(result.error || 'Downgrade request failed');
      }
      setPhase('completion');
    } catch (err: any) {
      setError(`Downgrade failed: ${err.message}`);
    }
  };

  if (!isOpen) return null;

  const canConfirm = selectedIds.size > 0 && selectedIds.size <= targetDocumentLimit;
  const docsNotKept = documents.length > 0
    ? documents.length - selectedIds.size
    : currentDocumentCount - selectedIds.size;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            {phase === 'selection' && (
              <button
                onClick={() => setPhase('warning')}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <h2 className="text-xl font-bold text-slate-900">
              {phase === 'warning' && 'Downgrade Plan'}
              {phase === 'selection' && 'Select Documents to Keep'}
              {phase === 'execution' && 'Scheduling Downgrade...'}
              {phase === 'completion' && 'Downgrade Scheduled'}
            </h2>
          </div>
          {phase !== 'execution' && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Phase 1: Warning ── */}
          {phase === 'warning' && (
            <div className="p-6">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-amber-900 mb-1">
                      Document Limit Exceeded
                    </h3>
                    <p className="text-sm text-amber-800">
                      You currently have <strong>{currentDocumentCount}</strong> documents,
                      but the {targetName} plan allows a maximum of{' '}
                      <strong>{targetDocumentLimit}</strong>. You'll need to select which{' '}
                      <strong>{targetDocumentLimit}</strong> document{targetDocumentLimit !== 1 ? 's' : ''} to keep.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                  <p className="text-sm text-slate-500 mb-1">Current Documents</p>
                  <p className="text-3xl font-bold text-slate-900">
                    {currentDocumentCount}
                  </p>
                </div>
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 text-center">
                  <p className="text-sm text-emerald-600 mb-1">{targetName} Plan Limit</p>
                  <p className="text-3xl font-bold text-emerald-700">
                    {targetDocumentLimit}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">
                  What happens next
                </h4>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400 mt-0.5">1.</span>
                    You'll select up to <strong>{targetDocumentLimit}</strong> document{targetDocumentLimit !== 1 ? 's' : ''} to keep
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400 mt-0.5">2.</span>
                    Your downgrade to {targetName} will be scheduled for the end of your billing period
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400 mt-0.5">3.</span>
                    Documents not selected will be permanently deleted when the downgrade takes effect
                  </li>
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setPhase('selection')}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-medium transition-colors shadow-md"
                >
                  Select Documents to Keep
                </button>
              </div>
            </div>
          )}

          {/* ── Phase 2: Selection ── */}
          {phase === 'selection' && (
            <div className="p-6">
              {/* Progress indicator */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">
                    Select up to {targetDocumentLimit} document{targetDocumentLimit !== 1 ? 's' : ''} to keep
                  </span>
                  <span
                    className={`text-sm font-bold ${
                      selectedIds.size === targetDocumentLimit ? 'text-emerald-600' : 'text-slate-500'
                    }`}
                  >
                    {selectedIds.size} / {targetDocumentLimit}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      selectedIds.size === targetDocumentLimit ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                    style={{
                      width: `${Math.min((selectedIds.size / targetDocumentLimit) * 100, 100)}%`,
                    }}
                  />
                </div>
                {selectedIds.size < targetDocumentLimit && (
                  <p className="text-xs text-slate-500 mt-2">
                    {targetDocumentLimit - selectedIds.size} more document{targetDocumentLimit - selectedIds.size !== 1 ? 's' : ''} can be selected
                  </p>
                )}
              </div>

              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search documents..."
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                />
              </div>

              {/* Document list */}
              {docsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 text-emerald-600 animate-spin" />
                  <span className="ml-2 text-slate-600">Loading documents...</span>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-2 mb-4 pr-1">
                  {filteredDocuments.map((doc) => {
                    const isSelected = selectedIds.has(doc.id);
                    const isAtLimit = selectedIds.size >= targetDocumentLimit && !isSelected;
                    return (
                      <label
                        key={doc.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'border-emerald-300 bg-emerald-50 cursor-pointer'
                            : isAtLimit
                            ? 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-50'
                            : 'border-slate-200 hover:border-slate-300 bg-white cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleDoc(doc.id)}
                          disabled={isAtLimit}
                          className="mt-1 h-4 w-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            <span className="font-medium text-slate-900 truncate">
                              {doc.name}
                            </span>
                            {isSelected && (
                              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                                Keeping
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                            <span className="capitalize">{doc.category}</span>
                            <span>{doc.size}</span>
                            {doc.upload_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatUTCDate(doc.upload_date)}
                              </span>
                            )}
                          </div>
                          {doc.tags && doc.tags.length > 0 && (
                            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                              <Tag className="h-3 w-3 text-slate-400" />
                              {doc.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded"
                                >
                                  {tag}
                                </span>
                              ))}
                              {doc.tags.length > 3 && (
                                <span className="text-xs text-slate-400">
                                  +{doc.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                  {filteredDocuments.length === 0 && !docsLoading && (
                    <p className="text-center text-slate-500 py-8 text-sm">
                      No documents match your search.
                    </p>
                  )}
                </div>
              )}

              {/* Summary of what will happen */}
              {selectedIds.size > 0 && (
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs text-amber-800">
                    <strong>{selectedIds.size}</strong> document{selectedIds.size !== 1 ? 's' : ''} will be kept.{' '}
                    <strong>{docsNotKept}</strong> document{docsNotKept !== 1 ? 's' : ''} will be removed when the downgrade takes effect.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button
                  onClick={onClose}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecute}
                  disabled={!canConfirm}
                  className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                    canConfirm
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Shield className="h-4 w-4" />
                  Confirm & Schedule Downgrade
                </button>
              </div>
            </div>
          )}

          {/* ── Phase 3: Execution ── */}
          {phase === 'execution' && (
            <div className="p-8">
              {!error ? (
                <div className="text-center">
                  <Loader2 className="h-12 w-12 text-emerald-600 animate-spin mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">
                    Scheduling your downgrade...
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Saving your document selections and scheduling the plan change.
                  </p>
                  <p className="text-xs text-slate-400">
                    Please don't close this window
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                    <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={onClose}
                      className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => { setPhase('selection'); setError(null); }}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors"
                    >
                      Go Back
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Phase 4: Completion ── */}
          {phase === 'completion' && (
            <div className="p-8 text-center">
              <div className="bg-emerald-50 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                Downgrade Scheduled
              </h3>
              <p className="text-slate-600 mb-2 max-w-sm mx-auto">
                Your plan will change to <strong>{targetName}</strong> at the end of your current billing period.
              </p>
              <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                <strong>{selectedIds.size}</strong> document{selectedIds.size !== 1 ? 's' : ''} will be kept.{' '}
                The remaining {docsNotKept} document{docsNotKept !== 1 ? 's' : ''} will
                be removed when the downgrade takes effect.
              </p>
              <button
                onClick={onSuccess}
                className="px-8 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-medium transition-colors shadow-md"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
