import { useState } from 'react';
import {
  ClipboardCheck, AlertTriangle, Calendar, FileText, Tag, Clock,
  ChevronDown, ChevronUp, ArrowRight, CheckCircle, Lightbulb, X
} from 'lucide-react';
import { useWeeklyAudit, useEngagementActions } from '../hooks/useEngagement';
import { formatUTCDate } from '../lib/dateUtils';

interface WeeklyAuditProps {
  onNavigateToDocument?: (documentId: string) => void;
  embedded?: boolean;
}

// Category-based default cadence (mirrors backend suggestReviewCadence)
const getDefaultCadence = (category: string): number => {
  switch (category) {
    case 'lease': case 'contract': return 180;
    default: return 365;
  }
};

const CADENCE_PRESETS = [
  { days: 90, label: 'Every 3 months' },
  { days: 180, label: 'Every 6 months' },
  { days: 365, label: 'Every year' },
];

export function WeeklyAudit({ onNavigateToDocument, embedded }: WeeklyAuditProps) {
  const { data, loading, error, refresh } = useWeeklyAudit();
  const { dismissGap, setCadence, actionLoading } = useEngagementActions();
  const [expandedSection, setExpandedSection] = useState<string | null>('nearing_expiration');
  const [cadenceModal, setCadenceModal] = useState<{ docId: string; docName: string; category: string } | null>(null);
  const [selectedCadence, setSelectedCadence] = useState<number>(365);
  const [customDays, setCustomDays] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  if (loading) return <AuditSkeleton embedded={embedded} />;
  if (error) return (
    <div className={embedded ? '' : 'max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6'}>
      <p className="text-red-600">Failed to load audit data.</p>
      <button onClick={refresh} className="text-emerald-600 hover:text-emerald-700 font-medium text-sm mt-2">Retry</button>
    </div>
  );
  if (!data) return null;

  const toggleSection = (key: string) => {
    setExpandedSection(prev => prev === key ? null : key);
  };

  const openCadenceModal = (docId: string, docName: string, category: string) => {
    const defaultDays = getDefaultCadence(category);
    setSelectedCadence(defaultDays);
    setCustomDays('');
    setUseCustom(false);
    setCadenceModal({ docId, docName, category });
  };

  const handleConfirmCadence = async () => {
    if (!cadenceModal) return;
    const days = useCustom ? parseInt(customDays, 10) : selectedCadence;
    if (!days || days < 7 || days > 730) return;
    await setCadence(cadenceModal.docId, days);
    setCadenceModal(null);
    refresh();
  };

  const handleDismissGap = async (key: string) => {
    await dismissGap(key, 'unknown');
    refresh();
  };

  const sections = [
    {
      key: 'nearing_expiration',
      title: 'Nearing Expiration',
      icon: <Calendar className="h-5 w-5 text-amber-600" />,
      count: data.nearingExpiration.length,
      color: 'amber',
      items: data.nearingExpiration,
    },
    {
      key: 'incomplete_metadata',
      title: 'Incomplete Metadata',
      icon: <Tag className="h-5 w-5 text-blue-600" />,
      count: data.incompleteMetadata.length,
      color: 'blue',
      items: data.incompleteMetadata,
    },
    {
      key: 'missing_expirations',
      title: 'Missing Expiration Dates',
      icon: <AlertTriangle className="h-5 w-5 text-orange-600" />,
      count: data.missingExpirations.length,
      color: 'orange',
      items: data.missingExpirations,
    },
    {
      key: 'missing_cadence',
      title: 'No Review Schedule',
      icon: <Clock className="h-5 w-5 text-purple-600" />,
      count: data.missingReviewCadence.length,
      color: 'purple',
      items: data.missingReviewCadence,
    },
  ];

  return (
    <div className={embedded ? '' : 'max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8'}>
      {!embedded && (
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-600 p-2.5 rounded-xl shadow-md">
              <ClipboardCheck className="h-6 w-6 text-white" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Weekly Vault Audit</h1>
              <p className="text-sm sm:text-base text-slate-600">Review and improve your document vault health</p>
            </div>
          </div>
        </div>
      )}

      {/* Health + Preparedness Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-700">{data.healthSummary.healthy}</div>
          <div className="text-xs font-medium text-emerald-600">Healthy</div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-amber-700">{data.healthSummary.watch}</div>
          <div className="text-xs font-medium text-amber-600">Watch</div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-orange-700">{data.healthSummary.risk}</div>
          <div className="text-xs font-medium text-orange-600">Risk</div>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-pink-50 border-2 border-red-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-700">{data.healthSummary.critical}</div>
          <div className="text-xs font-medium text-red-600">Critical</div>
        </div>
        <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-slate-50 to-white border-2 border-slate-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-slate-900">{data.preparedness.score}</div>
          <div className="text-xs font-medium text-slate-600">Preparedness</div>
        </div>
      </div>

      {/* All-clear celebration when every section is empty */}
      {sections.every(s => s.count === 0) && data.gapSuggestions.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-12 mb-6">
          <div className="max-w-md mx-auto text-center">
            <div className="relative w-20 h-20 mx-auto mb-5">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-full animate-pulse" />
              <div className="relative bg-white rounded-full shadow-sm border border-emerald-200 w-full h-full flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-emerald-500" strokeWidth={1.5} />
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Your vault is in great shape</h3>
            <p className="text-slate-500 leading-relaxed">
              No issues found this week. All your documents have complete metadata, valid expiration dates, and healthy review schedules.
            </p>
          </div>
        </div>
      )}

      {/* Audit Sections */}
      <div className="space-y-4">
        {sections.map((section) => {
          const isExpanded = expandedSection === section.key;

          return (
            <div key={section.key} className={`bg-white rounded-xl sm:rounded-2xl shadow-sm border ${section.count > 0 ? 'border-slate-200' : 'border-slate-100'}`}>
              <button
                onClick={() => toggleSection(section.key)}
                className="w-full flex items-center justify-between p-4 sm:p-6 hover:bg-slate-50 transition-colors rounded-xl"
              >
                <div className="flex items-center gap-3">
                  {section.icon}
                  <span className="text-sm sm:text-base font-semibold text-slate-900">{section.title}</span>
                  {section.count > 0 && (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      section.color === 'amber' ? 'bg-amber-100 text-amber-700' :
                      section.color === 'blue' ? 'bg-blue-100 text-blue-700' :
                      section.color === 'orange' ? 'bg-orange-100 text-orange-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>
                      {section.count}
                    </span>
                  )}
                </div>
                {isExpanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
              </button>

              {isExpanded && section.items.length > 0 && (
                <div className="border-t border-slate-200 divide-y divide-slate-100">
                  {section.items.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 sm:px-6 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{doc.name}</p>
                          <p className="text-xs text-slate-500 capitalize">{doc.category}
                            {doc.expiration_date && ` • Expires ${formatUTCDate(doc.expiration_date)}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {section.key === 'missing_cadence' && (
                          <button
                            onClick={() => openCadenceModal(doc.id, doc.name, doc.category)}
                            disabled={actionLoading !== null}
                            className="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                          >
                            Set Schedule
                          </button>
                        )}
                        {onNavigateToDocument && (
                          <button
                            onClick={() => onNavigateToDocument(doc.id)}
                            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium px-2 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors flex items-center gap-1"
                          >
                            Details <ArrowRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isExpanded && section.items.length === 0 && (
                <div className="border-t border-slate-200 p-6 text-center">
                  <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-600">All clear in this area!</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Gap Suggestions */}
      {data.gapSuggestions.length > 0 && (
        <div className="mt-6 bg-white rounded-xl sm:rounded-2xl shadow-sm border border-slate-200">
          <div className="p-4 sm:p-6 border-b border-slate-200">
            <h3 className="text-sm sm:text-base font-semibold text-slate-900 flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              Suggested Missing Documents
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {data.gapSuggestions.map((gap) => (
              <div key={gap.key} className="flex items-center justify-between p-4 sm:px-6 hover:bg-slate-50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{gap.label}</p>
                  <p className="text-xs text-slate-500">{gap.description}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0 ml-4">
                  <button
                    onClick={() => handleDismissGap(gap.key)}
                    disabled={actionLoading !== null}
                    className="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-1 rounded transition-colors disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cadence Picker Modal */}
      {cadenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCadenceModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <button onClick={() => setCadenceModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 mb-1">
              <div className="bg-purple-100 p-2 rounded-xl">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Set Review Schedule</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5 ml-12">
              <span className="font-medium text-slate-700">{cadenceModal.docName}</span>
              <span className="capitalize"> &bull; {cadenceModal.category}</span>
            </p>

            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">How often should we remind you?</p>

            <div className="space-y-2 mb-4">
              {CADENCE_PRESETS.map((preset) => {
                const isDefault = preset.days === getDefaultCadence(cadenceModal.category);
                const isSelected = !useCustom && selectedCadence === preset.days;
                return (
                  <button
                    key={preset.days}
                    onClick={() => { setSelectedCadence(preset.days); setUseCustom(false); }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <span className={`text-sm font-semibold ${isSelected ? 'text-emerald-700' : 'text-slate-700'}`}>
                        {preset.label}
                      </span>
                      <span className={`text-xs ml-2 ${isSelected ? 'text-emerald-500' : 'text-slate-400'}`}>
                        ({preset.days} days)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isDefault && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
                          Recommended
                        </span>
                      )}
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-emerald-500' : 'border-slate-300'
                      }`}>
                        {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Custom option */}
              <button
                onClick={() => setUseCustom(true)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left ${
                  useCustom
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <span className={`text-sm font-semibold ${useCustom ? 'text-emerald-700' : 'text-slate-700'}`}>
                    Custom
                  </span>
                  {useCustom && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={7}
                        max={730}
                        value={customDays}
                        onChange={(e) => setCustomDays(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="e.g. 120"
                        className="w-24 px-3 py-1.5 text-sm border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                        autoFocus
                      />
                      <span className="text-xs text-emerald-600 font-medium">days</span>
                    </div>
                  )}
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  useCustom ? 'border-emerald-500' : 'border-slate-300'
                }`}>
                  {useCustom && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
                </div>
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-5">
              We'll notify you at 80%, 90%, and 100% of the review period via email and in-app notifications.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setCadenceModal(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCadence}
                disabled={actionLoading !== null || (useCustom && (!customDays || parseInt(customDays, 10) < 7 || parseInt(customDays, 10) > 730))}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === 'cadence' ? 'Setting...' : 'Set Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditSkeleton({ embedded }: { embedded?: boolean }) {
  return (
    <div className={`${embedded ? '' : 'max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8'} animate-pulse`}>
      <div className="mb-8">
        <div className="h-8 bg-slate-200 rounded w-64 mb-2" />
        <div className="h-4 bg-slate-200 rounded w-96" />
      </div>
      <div className="grid grid-cols-5 gap-4 mb-6">
        {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-slate-200 rounded-xl" />)}
      </div>
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-slate-200 rounded-xl" />)}
      </div>
    </div>
  );
}
