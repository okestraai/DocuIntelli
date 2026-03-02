import React, { useState, useEffect, useCallback } from 'react';
import {
  Truck, Plane, Baby, Home, Briefcase, Scale,
  ChevronLeft, ChevronRight, Plus, Archive, RefreshCw,
  CheckCircle2, AlertTriangle, XCircle, Clock, HelpCircle,
  Upload, Tag, CalendarClock, Link2, FileText, Printer,
  Search, X, MessageSquare, Filter, Sparkles, Trash2,
  Pencil, Check, FolderPlus, Compass,
} from 'lucide-react';
import type { Document } from '../App';
import {
  getTemplates, getEvents, createEvent, getEventDetail,
  recomputeReadiness, markNotApplicable, manualMatch, unmatch,
  archiveEvent, unarchiveEvent, getEventExport,
  addCustomRequirement, updateCustomRequirement, deleteCustomRequirement,
  matchCustomRequirement, unmatchCustomRequirement,
  TemplateOverview, LifeEvent, EventDetail, ReadinessData,
  RequirementStatusItem, IntakeQuestion,
} from '../lib/lifeEventsApi';
import { useFeedback } from '../hooks/useFeedback';
import { ToastContainer } from './Toast';

// ---------------------------------------------------------------------------
// Icon map (lucide icons referenced by string name from templates)
// ---------------------------------------------------------------------------
const ICON_MAP: Record<string, React.FC<any>> = {
  Truck, Plane, Baby, Home, Briefcase, Scale, FileText,
};

function TemplateIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] || FileText;
  return <Icon className={className} />;
}

// ---------------------------------------------------------------------------
// Status colors & labels
// ---------------------------------------------------------------------------
const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: React.FC<any>; label: string }> = {
  satisfied:           { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2, label: 'Complete' },
  expiring_soon:       { color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     icon: Clock,        label: 'Expiring Soon' },
  needs_update:        { color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         icon: AlertTriangle, label: 'Needs Update' },
  incomplete_metadata: { color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200',   icon: HelpCircle,   label: 'Incomplete' },
  missing:             { color: 'text-slate-600',   bg: 'bg-slate-50 border-slate-200',     icon: XCircle,      label: 'Missing' },
  not_applicable:      { color: 'text-slate-400',   bg: 'bg-slate-50 border-slate-100',     icon: X,            label: 'N/A' },
  pending:             { color: 'text-slate-500',   bg: 'bg-slate-50 border-slate-200',     icon: Clock,        label: 'Pending' },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sub-view type
// ---------------------------------------------------------------------------
type SubView = 'list' | 'start' | 'intake' | 'detail' | 'export';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface Props {
  documents: Document[];
  onShowUpload: () => void;
}

export function LifeEventsPage({ documents, onShowUpload }: Props) {
  const feedback = useFeedback();
  const [subView, setSubView] = useState<SubView>('list');
  const [templates, setTemplates] = useState<TemplateOverview[]>([]);
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [archivedEvents, setArchivedEvents] = useState<LifeEvent[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Start-event state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string>>({});

  // Detail state
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Export state
  const [exportData, setExportData] = useState<any>(null);

  // Search modal for manual match
  const [matchingReqId, setMatchingReqId] = useState<string | null>(null);
  const [docSearchQuery, setDocSearchQuery] = useState('');

  // Custom requirement form
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customSection, setCustomSection] = useState('');
  const [newSectionName, setNewSectionName] = useState('');

  // Edit state for custom items
  const [editingReqId, setEditingReqId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSection, setEditSection] = useState('');
  const [editNewSection, setEditNewSection] = useState('');

  // Edit state for custom section names
  const [editingSectionName, setEditingSectionName] = useState<string | null>(null);
  const [editSectionNewName, setEditSectionNewName] = useState('');

  // Load templates + events on mount
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tmpl, evts, archived] = await Promise.all([
        getTemplates(),
        getEvents(),
        getEvents('archived'),
      ]);
      setTemplates(tmpl);
      setEvents(evts);
      setArchivedEvents(archived);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleStartEvent = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setIntakeAnswers({});
    const tmpl = templates.find(t => t.id === templateId);
    if (tmpl && tmpl.intakeQuestions.length > 0) {
      setSubView('intake');
    } else {
      handleCreateEvent(templateId, {});
    }
  };

  const handleCreateEvent = async (templateId: string, answers: Record<string, string>) => {
    try {
      setDetailLoading(true);
      const result = await createEvent(templateId, answers);
      // Navigate to the new event detail
      const detail = await getEventDetail(result.event.id);
      setEventDetail(detail);
      setSubView('detail');
      // Refresh event list in background
      getEvents().then(setEvents).catch(() => {});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleOpenEvent = async (eventId: string) => {
    try {
      setDetailLoading(true);
      setSubView('detail');
      const detail = await getEventDetail(eventId);
      setEventDetail(detail);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRecompute = async () => {
    if (!eventDetail) return;
    try {
      setDetailLoading(true);
      const detail = await getEventDetail(eventDetail.event.id);
      setEventDetail(detail);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleMarkNA = async (reqId: string) => {
    if (!eventDetail) return;
    const reason = prompt('Reason (optional):');
    try {
      const readiness = await markNotApplicable(eventDetail.event.id, reqId, reason || undefined);
      setEventDetail(prev => prev ? { ...prev, readiness } : prev);
    } catch (err: any) { setError(err.message); }
  };

  const handleManualMatch = async (reqId: string, docId: string) => {
    if (!eventDetail) return;
    try {
      const readiness = await manualMatch(eventDetail.event.id, reqId, docId);
      setEventDetail(prev => prev ? { ...prev, readiness } : prev);
      setMatchingReqId(null);
    } catch (err: any) { setError(err.message); }
  };

  const handleUnmatch = async (reqId: string) => {
    if (!eventDetail) return;
    try {
      const readiness = await unmatch(eventDetail.event.id, reqId);
      setEventDetail(prev => prev ? { ...prev, readiness } : prev);
    } catch (err: any) { setError(err.message); }
  };

  // Custom requirement handlers
  const handleAddCustom = async () => {
    if (!eventDetail || !customTitle.trim()) return;
    const section = customSection === '__new__' ? newSectionName.trim() : customSection;
    if (!section) return;
    try {
      await addCustomRequirement(eventDetail.event.id, customTitle.trim(), section);
      // Reload full detail so template has correct custom IDs
      const detail = await getEventDetail(eventDetail.event.id);
      setEventDetail(detail);
      setCustomTitle('');
      setCustomSection('');
      setNewSectionName('');
      setShowAddCustom(false);
      feedback.showSuccess('Document added', `"${customTitle.trim()}" added to ${section}`);
    } catch (err: any) {
      feedback.showError('Failed to add document', err.message);
    }
  };

  const handleDeleteCustom = async (reqId: string) => {
    if (!eventDetail) return;
    const crid = reqId.replace('custom-', '');
    try {
      const readiness = await deleteCustomRequirement(eventDetail.event.id, crid);
      setEventDetail(prev => prev ? {
        ...prev,
        readiness,
        template: { ...prev.template, requirements: prev.template.requirements.filter(r => r.id !== reqId) },
      } : prev);
      feedback.showSuccess('Document removed', 'Custom document requirement deleted');
    } catch (err: any) {
      feedback.showError('Failed to remove document', err.message);
    }
  };

  const handleSaveEditCustom = async () => {
    if (!eventDetail || !editingReqId) return;
    const crid = editingReqId.replace('custom-', '');
    const section = editSection === '__new__' ? editNewSection.trim() : editSection;
    const updates: { title?: string; section?: string } = {};
    if (editTitle.trim()) updates.title = editTitle.trim();
    if (section) updates.section = section;
    if (Object.keys(updates).length === 0) return;
    try {
      await updateCustomRequirement(eventDetail.event.id, crid, updates);
      const detail = await getEventDetail(eventDetail.event.id);
      setEventDetail(detail);
      setEditingReqId(null);
      feedback.showSuccess('Updated', 'Custom document requirement updated');
    } catch (err: any) {
      feedback.showError('Failed to update', err.message);
    }
  };

  const handleRenameSectionAll = async (oldName: string) => {
    if (!eventDetail || !editSectionNewName.trim() || editSectionNewName.trim() === oldName) {
      setEditingSectionName(null);
      return;
    }
    try {
      const customReqsInSection = eventDetail.template.requirements.filter(
        r => r.id.startsWith('custom-') && r.section === oldName
      );
      for (const req of customReqsInSection) {
        const crid = req.id.replace('custom-', '');
        await updateCustomRequirement(eventDetail.event.id, crid, { section: editSectionNewName.trim() });
      }
      const detail = await getEventDetail(eventDetail.event.id);
      setEventDetail(detail);
      setEditingSectionName(null);
      feedback.showSuccess('Section renamed', `"${oldName}" renamed to "${editSectionNewName.trim()}"`);
    } catch (err: any) {
      feedback.showError('Failed to rename section', err.message);
    }
  };

  const handleDeleteSectionAll = async (sectionName: string) => {
    if (!eventDetail) return;
    const customReqsInSection = eventDetail.template.requirements.filter(
      r => r.id.startsWith('custom-') && r.section === sectionName
    );
    if (customReqsInSection.length === 0) return;
    try {
      for (const req of customReqsInSection) {
        const crid = req.id.replace('custom-', '');
        await deleteCustomRequirement(eventDetail.event.id, crid);
      }
      const detail = await getEventDetail(eventDetail.event.id);
      setEventDetail(detail);
      feedback.showSuccess('Section deleted', `All documents in "${sectionName}" removed`);
    } catch (err: any) {
      feedback.showError('Failed to delete section', err.message);
    }
  };

  const handleCustomMatch = async (reqId: string, docId: string) => {
    if (!eventDetail) return;
    const crid = reqId.replace('custom-', '');
    try {
      const readiness = await matchCustomRequirement(eventDetail.event.id, crid, docId);
      setEventDetail(prev => prev ? { ...prev, readiness } : prev);
      setMatchingReqId(null);
    } catch (err: any) { setError(err.message); }
  };

  const handleCustomUnmatch = async (reqId: string) => {
    if (!eventDetail) return;
    const crid = reqId.replace('custom-', '');
    try {
      const readiness = await unmatchCustomRequirement(eventDetail.event.id, crid);
      setEventDetail(prev => prev ? { ...prev, readiness } : prev);
    } catch (err: any) { setError(err.message); }
  };

  const handleArchive = async () => {
    if (!eventDetail) return;
    try {
      await archiveEvent(eventDetail.event.id);
      setSubView('list');
      loadData();
    } catch (err: any) { setError(err.message); }
  };

  const handleUnarchive = async () => {
    if (!eventDetail) return;
    try {
      await unarchiveEvent(eventDetail.event.id);
      setSubView('list');
      loadData();
    } catch (err: any) { setError(err.message); }
  };

  const handleExport = async () => {
    if (!eventDetail) return;
    try {
      const data = await getEventExport(eventDetail.event.id);
      setExportData(data);
      setSubView('export');
    } catch (err: any) { setError(err.message); }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-8">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-600 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  // Error banner
  const ErrorBanner = error ? (
    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
      <span>{error}</span>
      <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700"><X className="h-4 w-4" /></button>
    </div>
  ) : null;

  // Toast overlay — rendered by every sub-view via the wrapper below
  const Toasts = <ToastContainer toasts={feedback.toasts} onClose={feedback.removeToast} />;

  // ==========================================================================
  // SUB-VIEW: Event List (My Events + Start)
  // ==========================================================================
  if (subView === 'list') {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-600 p-2.5 rounded-xl shadow-md">
              <Compass className="h-6 w-6 text-white" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Life Events</h1>
              <p className="text-sm sm:text-base text-slate-600">Prepare for life's big moments by organizing your documents into actionable checklists.</p>
            </div>
          </div>
        </div>
        {ErrorBanner}

        {/* Welcome banner when no events yet */}
        {events.length === 0 && archivedEvents.length === 0 && (
          <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 rounded-2xl p-8 sm:p-10 mb-8 text-white">
            <div className="absolute top-0 right-0 w-56 h-56 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/4" />
            <div className="relative z-10 max-w-lg">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-5 w-5 text-purple-200" />
                <span className="text-purple-200 text-sm font-medium">Life Events</span>
              </div>
              <h2 className="text-2xl font-bold mb-2">Be ready for what's next</h2>
              <p className="text-purple-100 text-sm leading-relaxed">
                Planning a move? Traveling abroad? Starting a new job? Pick an event below and we'll build a personalized document checklist — then match it against your vault automatically.
              </p>
            </div>
          </div>
        )}

        {/* Active Events */}
        {events.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">My Active Events</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {events.map(ev => (
                <button
                  key={ev.id}
                  onClick={() => handleOpenEvent(ev.id)}
                  className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:shadow-md hover:border-emerald-200 transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-2.5 rounded-lg">
                      <TemplateIcon name={ev.templateIcon} className="h-5 w-5 text-emerald-600" />
                    </div>
                    <ReadinessRing score={ev.readiness_score} size={44} />
                  </div>
                  <h3 className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors">{ev.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">Started {new Date(ev.created_at).toLocaleDateString()}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Template Gallery */}
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            {events.length > 0 ? 'Start Another Event' : 'Start an Event'}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(tmpl => (
              <button
                key={tmpl.id}
                onClick={() => handleStartEvent(tmpl.id)}
                className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:shadow-md hover:border-emerald-200 transition-all group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-2.5 rounded-lg">
                    <TemplateIcon name={tmpl.icon} className="h-5 w-5 text-emerald-600" />
                  </div>
                  <h3 className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors">{tmpl.name}</h3>
                </div>
                <p className="text-sm text-slate-600 mb-3">{tmpl.description}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{tmpl.requirementCount} documents</span>
                  <span className="text-slate-300">|</span>
                  <span>{tmpl.sections.length} sections</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Archived Events */}
        {archivedEvents.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors mb-4"
            >
              <Archive className="h-4 w-4" />
              <span>Archived Events ({archivedEvents.length})</span>
              <ChevronRight className={`h-4 w-4 transition-transform ${showArchived ? 'rotate-90' : ''}`} />
            </button>
            {showArchived && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedEvents.map(ev => (
                  <button
                    key={ev.id}
                    onClick={() => handleOpenEvent(ev.id)}
                    className="bg-slate-50 rounded-xl border border-slate-200 p-5 text-left hover:shadow-md hover:border-slate-300 transition-all group opacity-75 hover:opacity-100"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="bg-slate-100 p-2.5 rounded-lg">
                        <TemplateIcon name={ev.templateIcon} className="h-5 w-5 text-slate-500" />
                      </div>
                      <ReadinessRing score={ev.readiness_score} size={44} />
                    </div>
                    <h3 className="font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">{ev.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">
                        <Archive className="h-3 w-3" /> Archived
                      </span>
                      <span className="text-xs text-slate-500">Started {new Date(ev.created_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Disclaimer */}
        <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>Disclaimer:</strong> Life Events checklists and readiness scores are generated by AI for informational purposes only. They do not constitute legal, financial, or professional advice. Requirements may vary by jurisdiction, institution, and individual circumstances. Always verify specific document requirements with the relevant authorities or qualified professionals.
            </p>
          </div>
        </div>
        {Toasts}
      </div>
    );
  }

  // ==========================================================================
  // SUB-VIEW: Intake Questions
  // ==========================================================================
  if (subView === 'intake' && selectedTemplateId) {
    const tmpl = templates.find(t => t.id === selectedTemplateId);
    if (!tmpl) return null;

    return (
      <div className="max-w-2xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8">
        <button onClick={() => setSubView('list')} className="flex items-center gap-1 text-sm text-slate-600 hover:text-emerald-700 mb-6">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        {ErrorBanner}

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-3 rounded-lg">
              <TemplateIcon name={tmpl.icon} className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{tmpl.name}</h2>
              <p className="text-sm text-slate-600">Answer a few questions to tailor your checklist.</p>
            </div>
          </div>

          <div className="space-y-5">
            {tmpl.intakeQuestions.map((q: IntakeQuestion) => (
              <div key={q.id}>
                <label className="block text-sm font-medium text-slate-700 mb-2">{q.label}</label>
                {q.type === 'select' && q.options ? (
                  <div className="flex flex-wrap gap-2">
                    {q.options.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setIntakeAnswers(prev => ({ ...prev, [q.id]: opt.value }))}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                          intakeAnswers[q.id] === opt.value
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {['true', 'false'].map(val => (
                      <button
                        key={val}
                        onClick={() => setIntakeAnswers(prev => ({ ...prev, [q.id]: val }))}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                          intakeAnswers[q.id] === val
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        {val === 'true' ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <button onClick={() => setSubView('list')} className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900">Cancel</button>
            <button
              onClick={() => handleCreateEvent(selectedTemplateId, intakeAnswers)}
              disabled={detailLoading}
              className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {detailLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate Checklist
            </button>
          </div>
        </div>
        {Toasts}
      </div>
    );
  }

  // ==========================================================================
  // SUB-VIEW: Event Detail (Checklist)
  // ==========================================================================
  if (subView === 'detail') {
    if (detailLoading && !eventDetail) {
      return (
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-8">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-600 border-t-transparent"></div>
          </div>
        </div>
      );
    }

    if (!eventDetail) return null;

    const { event, template, readiness } = eventDetail;
    const reqs = readiness.requirements;

    // Group by section
    const sections: Record<string, { req: typeof template.requirements[0]; status: RequirementStatusItem }[]> = {};
    for (const rs of reqs) {
      const tmplReq = template.requirements.find(r => r.id === rs.requirementId);
      if (!tmplReq) continue;
      const sec = tmplReq.section;
      if (!sections[sec]) sections[sec] = [];
      sections[sec].push({ req: tmplReq, status: rs });
    }

    // Filter
    const filteredSections: typeof sections = {};
    for (const [sec, items] of Object.entries(sections)) {
      const filtered = statusFilter === 'all' ? items : items.filter(i => i.status.status === statusFilter);
      if (filtered.length > 0) filteredSections[sec] = filtered;
    }

    // Status counts
    const counts: Record<string, number> = {};
    for (const rs of reqs) {
      counts[rs.status] = (counts[rs.status] || 0) + 1;
    }

    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8">
        <button onClick={() => { setSubView('list'); loadData(); }} className="flex items-center gap-1 text-sm text-slate-600 hover:text-emerald-700 mb-4">
          <ChevronLeft className="h-4 w-4" /> Back to Events
        </button>
        {ErrorBanner}

        {/* Header */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-3 rounded-lg">
                <TemplateIcon name={event.templateIcon || 'FileText'} className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{event.title}</h1>
                <p className="text-sm text-slate-500">Started {new Date(event.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ReadinessRing score={readiness.readinessScore} size={56} />
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-900">{Math.round(readiness.readinessScore)}%</div>
                <div className="text-xs text-slate-500">Readiness</div>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="w-full bg-slate-100 rounded-full h-2.5">
              <div
                className="h-2.5 rounded-full transition-all duration-500 bg-gradient-to-r from-emerald-500 to-teal-500"
                style={{ width: `${Math.min(100, readiness.readinessScore)}%` }}
              />
            </div>
          </div>

          {/* Next best action */}
          {readiness.nextBestAction && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <span><strong>Next:</strong> {readiness.nextBestAction}</span>
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={handleRecompute} disabled={detailLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${detailLoading ? 'animate-spin' : ''}`} /> Recompute
            </button>
            <button onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
              <Printer className="h-3.5 w-3.5" /> Export
            </button>
            {eventDetail.event.status === 'archived' ? (
              <button onClick={handleUnarchive}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
                <Archive className="h-3.5 w-3.5" /> Unarchive
              </button>
            ) : (
              <button onClick={handleArchive}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
                <Archive className="h-3.5 w-3.5" /> Archive
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { key: 'all', label: 'All' },
            { key: 'missing', label: `Missing (${counts.missing || 0})` },
            { key: 'needs_update', label: `Needs Update (${counts.needs_update || 0})` },
            { key: 'expiring_soon', label: `Expiring (${counts.expiring_soon || 0})` },
            { key: 'incomplete_metadata', label: `Incomplete (${counts.incomplete_metadata || 0})` },
            { key: 'satisfied', label: `Complete (${counts.satisfied || 0})` },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                statusFilter === f.key
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Sections */}
        <div className="space-y-6">
          {Object.entries(filteredSections).map(([section, items]) => {
            const isCustomSection = items.every(i => i.req.id.startsWith('custom-'));

            return (
            <div key={section}>
              {/* Section header */}
              <div className="flex items-center gap-2 mb-3">
                {editingSectionName === section ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editSectionNewName}
                      onChange={e => setEditSectionNewName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRenameSectionAll(section); if (e.key === 'Escape') setEditingSectionName(null); }}
                      className="px-2 py-1 border border-emerald-300 rounded-lg text-sm font-semibold text-slate-700 uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      autoFocus
                    />
                    <button onClick={() => handleRenameSectionAll(section)} className="p-1 text-emerald-600 hover:text-emerald-700"><Check className="h-4 w-4" /></button>
                    <button onClick={() => setEditingSectionName(null)} className="p-1 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{section}</h3>
                    {isCustomSection && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingSectionName(section); setEditSectionNewName(section); }}
                          className="p-1 text-slate-300 hover:text-emerald-600 transition-colors" title="Rename section"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Delete section "${section}" and all its documents?`)) handleDeleteSectionAll(section); }}
                          className="p-1 text-slate-300 hover:text-red-500 transition-colors" title="Delete section"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-2">
                {items.map(({ req, status: rs }) => {
                  const isCustom = req.id.startsWith('custom-');
                  const isEditing = editingReqId === req.id;

                  if (isEditing) {
                    // Inline edit form for custom requirement
                    const allSections = [...new Set(template.requirements.map(r => r.section))];
                    return (
                      <div key={req.id} className="bg-white rounded-xl border-2 border-emerald-200 p-4">
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-medium text-slate-600 mb-1 block">Document Name</label>
                            <input
                              type="text"
                              value={editTitle}
                              onChange={e => setEditTitle(e.target.value)}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-600 mb-1 block">Section</label>
                            <select
                              value={editSection}
                              onChange={e => setEditSection(e.target.value)}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            >
                              {allSections.map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                              <option value="__new__">+ Create New Section</option>
                            </select>
                          </div>
                          {editSection === '__new__' && (
                            <input
                              type="text"
                              value={editNewSection}
                              onChange={e => setEditNewSection(e.target.value)}
                              placeholder="New section name"
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={handleSaveEditCustom}
                              disabled={!editTitle.trim() || (editSection === '__new__' && !editNewSection.trim())}
                              className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                            >
                              Save
                            </button>
                            <button onClick={() => setEditingReqId(null)} className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-800">Cancel</button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                  <div key={req.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-slate-900 text-sm">{req.title}</h4>
                          <StatusPill status={rs.status} />
                          {isCustom && (
                            <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Custom</span>
                          )}
                        </div>
                        {req.description && <p className="text-xs text-slate-500 mb-2">{req.description}</p>}

                        {/* Matched doc */}
                        {rs.matchedDocuments.length > 0 && (
                          <div className="flex items-center gap-2 mb-2 p-2 bg-emerald-50/50 rounded-lg border border-emerald-100">
                            <FileText className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-medium text-emerald-800 truncate block">{rs.matchedDocuments[0].documentName}</span>
                              <span className="text-xs text-emerald-600">
                                {Math.round(rs.matchedDocuments[0].confidence * 100)}% match ({rs.matchedDocuments[0].method})
                                {rs.matchedDocuments[0].expirationDate && (
                                  <> | Expires: {new Date(rs.matchedDocuments[0].expirationDate).toLocaleDateString()}</>
                                )}
                              </span>
                            </div>
                            <button onClick={() => isCustom ? handleCustomUnmatch(req.id) : handleUnmatch(req.id)} className="text-slate-400 hover:text-red-500 p-1" title="Remove match">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Suggested action */}
                        {rs.suggestedAction && (
                          <p className="text-xs text-amber-700 font-medium">{rs.suggestedAction}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        {(rs.status === 'missing' || rs.status === 'needs_update') && (
                          <>
                            <button onClick={onShowUpload}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
                              <Upload className="h-3 w-3" /> Upload
                            </button>
                            <button onClick={() => { setMatchingReqId(req.id); setDocSearchQuery(''); }}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
                              <Search className="h-3 w-3" /> Find Doc
                            </button>
                          </>
                        )}
                        {isCustom ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => {
                              setEditingReqId(req.id);
                              setEditTitle(req.title);
                              setEditSection(req.section);
                              setEditNewSection('');
                            }}
                              title="Edit"
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => handleDeleteCustom(req.id)}
                              title="Remove"
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          rs.status !== 'not_applicable' && rs.status !== 'satisfied' && (
                            <button onClick={() => handleMarkNA(req.id)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors">
                              <X className="h-3 w-3" /> N/A
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>

        {/* Add Custom Document */}
        <div className="mt-6">
          {showAddCustom ? (
            <div className="bg-white rounded-xl border-2 border-emerald-200 p-5">
              <h4 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Plus className="h-4 w-4 text-emerald-600" />
                Add Custom Document
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Section</label>
                  <select
                    value={customSection}
                    onChange={e => setCustomSection(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    <option value="">Select a section...</option>
                    {[...new Set(template.requirements.map(r => r.section))].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                    <option value="__new__">+ Create New Section</option>
                  </select>
                </div>
                {customSection === '__new__' && (
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">New Section Name</label>
                    <div className="relative">
                      <FolderPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={newSectionName}
                        onChange={e => setNewSectionName(e.target.value)}
                        placeholder="e.g., Pets, Travel, Medical"
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Document Name</label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={e => setCustomTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddCustom()}
                    placeholder="e.g., Pet vaccination records"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleAddCustom}
                    disabled={!customTitle.trim() || !customSection || (customSection === '__new__' && !newSectionName.trim())}
                    className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                  >
                    Add Document
                  </button>
                  <button
                    onClick={() => { setShowAddCustom(false); setCustomTitle(''); setCustomSection(''); setNewSectionName(''); }}
                    className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddCustom(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-dashed border-emerald-300 rounded-xl hover:bg-emerald-100 transition-colors w-full justify-center"
            >
              <Plus className="h-4 w-4" />
              Add Your Own Document
            </button>
          )}
        </div>

        {/* Document search modal for manual matching */}
        {matchingReqId && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setMatchingReqId(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Select a Document</h3>
                <button onClick={() => setMatchingReqId(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-4 border-b border-slate-100">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={docSearchQuery}
                    onChange={e => setDocSearchQuery(e.target.value)}
                    placeholder="Search documents..."
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    autoFocus
                  />
                </div>
              </div>
              <div className="overflow-y-auto max-h-[50vh] p-2">
                {documents
                  .filter(d => !docSearchQuery || d.name.toLowerCase().includes(docSearchQuery.toLowerCase()) || (d.tags || []).some(t => t.toLowerCase().includes(docSearchQuery.toLowerCase())))
                  .map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => matchingReqId!.startsWith('custom-') ? handleCustomMatch(matchingReqId!, doc.id) : handleManualMatch(matchingReqId!, doc.id)}
                      className="w-full text-left p-3 rounded-lg hover:bg-emerald-50 transition-colors flex items-center gap-3"
                    >
                      <FileText className="h-5 w-5 text-slate-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{doc.name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          <span>{doc.category}</span>
                          {doc.tags && doc.tags.length > 0 && (
                            <span className="truncate">{doc.tags.slice(0, 3).join(', ')}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                {documents.length === 0 && (
                  <p className="text-center text-sm text-slate-500 py-8">No documents in vault. Upload one first.</p>
                )}
              </div>
            </div>
          </div>
        )}
        {Toasts}
      </div>
    );
  }

  // ==========================================================================
  // SUB-VIEW: Export / Print View
  // ==========================================================================
  if (subView === 'export' && exportData) {
    return (
      <div className="max-w-3xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8">
        <div className="no-print mb-4 flex items-center justify-between">
          <button onClick={() => setSubView('detail')} className="flex items-center gap-1 text-sm text-slate-600 hover:text-emerald-700">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors">
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-8 print:border-none print:shadow-none">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">{exportData.title} - Readiness Summary</h1>
          <p className="text-sm text-slate-500 mb-1">Started: {new Date(exportData.dateStarted).toLocaleDateString()}</p>
          <p className="text-lg font-semibold text-emerald-700 mb-6">Readiness: {Math.round(exportData.readinessScore)}%</p>

          {Object.entries(exportData.sections as Record<string, any[]>).map(([section, items]) => (
            <div key={section} className="mb-6">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 pb-2 mb-3">{section}</h2>
              <div className="space-y-2">
                {items.map((item: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className="flex-shrink-0 mt-0.5">
                      {item.status === 'satisfied' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : item.status === 'not_applicable' ? (
                        <X className="h-4 w-4 text-slate-300" />
                      ) : (
                        <XCircle className="h-4 w-4 text-slate-400" />
                      )}
                    </span>
                    <div>
                      <span className="font-medium text-slate-800">{item.title}</span>
                      {item.matchedDocument && (
                        <span className="text-slate-500"> — {item.matchedDocument}</span>
                      )}
                      {item.suggestedAction && (
                        <p className="text-xs text-amber-700">{item.suggestedAction}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {Toasts}
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Readiness Ring (small circular progress)
// ---------------------------------------------------------------------------
function ReadinessRing({ score, size = 48 }: { score: number; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, score));
  const offset = circumference - (progress / 100) * circumference;

  const color = progress >= 80 ? '#059669' : progress >= 50 ? '#d97706' : '#dc2626';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={3} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold text-slate-700">{Math.round(progress)}%</span>
      </div>
    </div>
  );
}
