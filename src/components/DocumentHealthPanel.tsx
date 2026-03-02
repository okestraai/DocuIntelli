import React, { useState, useRef, useEffect } from 'react';
import {
  Heart, Shield, Clock, AlertTriangle, CheckCircle, FileText,
  Tag, User, Building2, Calendar, RefreshCw, Link2, ChevronDown,
  Lightbulb, MessageSquare, Info, Upload
} from 'lucide-react';
import { useDocumentHealth, useEngagementActions } from '../hooks/useEngagement';
import { useFeedback } from '../hooks/useFeedback';
import { ToastContainer } from './Toast';
import type { HealthState, DocumentInsight } from '../lib/engagementApi';

interface DocumentHealthPanelProps {
  documentId: string;
  documentName: string;
  documentCategory: string;
  documentStatus?: 'active' | 'expiring' | 'expired';
  onChatWithDocument?: () => void;
  onUploadRenewal?: () => void;
}

export function DocumentHealthPanel({
  documentId,
  documentName,
  documentCategory,
  documentStatus,
  onChatWithDocument,
  onUploadRenewal,
}: DocumentHealthPanelProps) {
  const { data, loading, error, refresh } = useDocumentHealth(documentId);
  const {
    updateMetadata,
    setCadence,
    actionLoading,
  } = useEngagementActions();
  const feedback = useFeedback();

  const [showMetadataForm, setShowMetadataForm] = useState(false);
  const [showCadenceForm, setShowCadenceForm] = useState(false);
  const [metadataFields, setMetadataFields] = useState({
    issuer: '',
    ownerName: '',
    expirationDate: '',
  });
  const [cadenceDays, setCadenceDays] = useState<number>(365);
  const metadataFormRef = useRef<HTMLDivElement>(null);

  // Scroll metadata form into view when opened
  useEffect(() => {
    if (showMetadataForm && metadataFormRef.current) {
      metadataFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [showMetadataForm]);

  const openMetadataForm = () => {
    // Pre-fill with existing data from the health endpoint
    if (data?.metadata) {
      setMetadataFields({
        issuer: data.metadata.issuer || '',
        ownerName: data.metadata.ownerName || '',
        expirationDate: data.metadata.expirationDate ? data.metadata.expirationDate.split('T')[0] : '',
      });
    }
    setShowMetadataForm(true);
    setShowCadenceForm(false);
  };

  if (loading) return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
      <div className="h-6 bg-slate-200 rounded w-40 mb-4" />
      <div className="h-20 bg-slate-200 rounded mb-4" />
      <div className="h-32 bg-slate-200 rounded" />
    </div>
  );

  if (error || !data) return null;

  const { health, insights, nextReviewDate, suggestedCadenceDays, relationships, reverseRelationships } = data;
  const hasIncompleteMetadata = insights.some(i => i.type === 'metadata_incomplete');
  const hasRenewal = reverseRelationships.some((r: any) => r.relationship_type === 'supersedes');
  const showRenewalAction = !hasRenewal && (documentStatus === 'expired' || documentStatus === 'expiring') && !!onUploadRenewal;
  const filteredInsights = hasRenewal ? insights.filter(i => i.type !== 'renewal_suggestion') : insights;

  const healthColors: Record<HealthState, { bg: string; text: string; border: string; icon: string }> = {
    healthy: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: 'text-emerald-600' },
    watch: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: 'text-amber-600' },
    risk: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: 'text-orange-600' },
    critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: 'text-red-600' },
  };

  const colors = healthColors[health.state];

  const healthIcon = {
    healthy: <CheckCircle className={`h-6 w-6 ${colors.icon}`} />,
    watch: <Clock className={`h-6 w-6 ${colors.icon}`} />,
    risk: <AlertTriangle className={`h-6 w-6 ${colors.icon}`} />,
    critical: <AlertTriangle className={`h-6 w-6 ${colors.icon}`} />,
  };

  const handleSaveMetadata = async () => {
    const updates: any = {};
    if (metadataFields.issuer) updates.issuer = metadataFields.issuer;
    if (metadataFields.ownerName) updates.ownerName = metadataFields.ownerName;
    if (metadataFields.expirationDate) updates.expirationDate = metadataFields.expirationDate;
    if (Object.keys(updates).length > 0) {
      try {
        await updateMetadata(documentId, updates);
        setShowMetadataForm(false);
        refresh();
        feedback.showSuccess('Details saved', 'Document metadata updated successfully');
      } catch {
        feedback.showError('Save failed', 'Could not update document details');
      }
    }
  };

  const handleSetCadence = async () => {
    try {
      await setCadence(documentId, cadenceDays);
      setShowCadenceForm(false);
      refresh();
      const label = cadenceDays <= 90 ? '3 months' : cadenceDays <= 180 ? '6 months' : cadenceDays <= 365 ? '1 year' : '2 years';
      feedback.showSuccess('Schedule set', `Review schedule set to every ${label}`);
    } catch {
      feedback.showError('Action failed', 'Could not set review schedule');
    }
  };

  return (
    <div className="space-y-4">
      {/* Health State */}
      <div className={`rounded-xl border-2 ${colors.border} ${colors.bg} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {healthIcon[health.state]}
            <span className={`text-lg font-bold ${colors.text} capitalize`}>
              {health.state}
            </span>
            <span className={`text-sm ${colors.text} opacity-75`}>
              ({health.score}/100)
            </span>
          </div>
        </div>

        {health.reasons.length > 0 && (
          <div className="space-y-1">
            {health.reasons.map((reason, idx) => (
              <p key={idx} className={`text-sm ${colors.text} opacity-80`}>
                • {reason}
              </p>
            ))}
          </div>
        )}

        {nextReviewDate && (
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Next review: {new Date(nextReviewDate).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Insights */}
      {filteredInsights.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              Insights
            </h4>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredInsights.map((insight, idx) => (
              <InsightCard
                key={idx}
                insight={insight}
                onAction={() => {
                  if (insight.actionType === 'upload_renewal' && onUploadRenewal) onUploadRenewal();
                  else if (insight.actionType === 'update_metadata') openMetadataForm();
                  else if (insight.actionType === 'chat' && onChatWithDocument) onChatWithDocument();
                }}
                isLoading={actionLoading !== null}
              />
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions — only show actions where input is needed */}
      {(hasIncompleteMetadata || !nextReviewDate || showRenewalAction) && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-emerald-600" />
            Quick Actions
          </h4>
          <div className="flex flex-wrap gap-2">
            {showRenewalAction && (
              <button
                onClick={onUploadRenewal}
                className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium px-3 py-2 rounded-lg border border-emerald-200 transition-colors inline-flex items-center gap-1.5"
              >
                <Upload className="h-3 w-3" />
                Upload Renewal
              </button>
            )}
            {hasIncompleteMetadata && (
              <button
                onClick={openMetadataForm}
                className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium px-3 py-2 rounded-lg border border-purple-200 transition-colors"
              >
                Add Missing Details
              </button>
            )}
            {!nextReviewDate && (
              <button
                onClick={() => {
                  setCadenceDays(suggestedCadenceDays);
                  setShowCadenceForm(!showCadenceForm);
                }}
                className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium px-3 py-2 rounded-lg border border-amber-200 transition-colors"
              >
                Set Review Schedule
              </button>
            )}
          </div>
        </div>
      )}

      {/* Metadata Form */}
      {showMetadataForm && (
        <div ref={metadataFormRef} className="bg-white rounded-xl border-2 border-emerald-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Edit Document Details</h4>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Issuer / Provider</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={metadataFields.issuer}
                  onChange={(e) => setMetadataFields(prev => ({ ...prev, issuer: e.target.value }))}
                  placeholder="e.g., State Farm, Wells Fargo"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Owner / Policyholder</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={metadataFields.ownerName}
                  onChange={(e) => setMetadataFields(prev => ({ ...prev, ownerName: e.target.value }))}
                  placeholder="e.g., John Smith"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Expiration Date</label>
              <input
                type="date"
                value={metadataFields.expirationDate}
                onChange={(e) => setMetadataFields(prev => ({ ...prev, expirationDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveMetadata}
                disabled={actionLoading !== null}
                className="text-xs bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Save Details
              </button>
              <button
                onClick={() => setShowMetadataForm(false)}
                className="text-xs text-slate-600 hover:text-slate-800 font-medium px-3 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cadence Form */}
      {showCadenceForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Set Review Schedule</h4>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {[
                { label: '3 months', days: 90 },
                { label: '6 months', days: 180 },
                { label: '1 year', days: 365 },
                { label: '2 years', days: 730 },
              ].map(({ label, days }) => (
                <button
                  key={days}
                  onClick={() => setCadenceDays(days)}
                  className={`text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                    cadenceDays === days
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Suggested for {documentCategory}: every {suggestedCadenceDays} days
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSetCadence}
                disabled={actionLoading !== null}
                className="text-xs bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Set Schedule
              </button>
              <button
                onClick={() => setShowCadenceForm(false)}
                className="text-xs text-slate-600 hover:text-slate-800 font-medium px-3 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Related Documents */}
      {(relationships.length > 0 || reverseRelationships.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-emerald-600" />
            Related Documents
          </h4>
          <div className="space-y-2">
            {[...relationships, ...reverseRelationships].map((rel: any, idx: number) => (
              <div key={idx} className="flex items-center gap-2 text-sm text-slate-700 p-2 bg-slate-50 rounded-lg">
                <FileText className="h-4 w-4 text-slate-400" />
                <span>{rel.documentName || 'Unknown'}</span>
                <span className="text-xs text-slate-400 capitalize">({rel.relationship_type})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ToastContainer toasts={feedback.toasts} onClose={feedback.removeToast} />
    </div>
  );
}

function InsightCard({ insight, onAction, isLoading }: {
  insight: DocumentInsight;
  onAction: () => void;
  isLoading: boolean;
}) {
  const severityStyles = {
    critical: 'border-l-red-400',
    warning: 'border-l-amber-400',
    info: 'border-l-blue-400',
  };

  const severityIcon = {
    critical: <AlertTriangle className="h-4 w-4 text-red-500" />,
    warning: <Clock className="h-4 w-4 text-amber-500" />,
    info: <Info className="h-4 w-4 text-blue-500" />,
  };

  return (
    <div className={`p-3 border-l-3 ${severityStyles[insight.severity]}`} style={{ borderLeftWidth: '3px' }}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{severityIcon[insight.severity]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900">{insight.title}</p>
          <p className="text-xs text-slate-600 mt-0.5">{insight.description}</p>
          {insight.actionLabel && (
            <button
              onClick={onAction}
              disabled={isLoading}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium mt-1.5 disabled:opacity-50"
            >
              {insight.actionLabel} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
