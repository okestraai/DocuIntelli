import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, Clock, Lock, Unlock, Eye, FileText, Shield,
  AlertCircle, CheckCircle2, Loader2, ExternalLink,
  ChevronDown, ChevronRight, XCircle, Sparkles, Download, Image, Info,
} from 'lucide-react';
import {
  getSharedWithMe, getSharedEventDetail, requestAccess, getDocumentContent, getDocumentPreviewUrl,
  type SharedEventSummary, type AccessibleDocument,
} from '../lib/emergencyAccessApi';
import type { Document } from '../App';
import { DocumentViewer } from './DocumentViewer';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface SharedWithMePageProps {
  currentPlan?: 'free' | 'starter' | 'pro';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a policy string into a human-readable badge label */
function policyLabel(policy: string): string {
  switch (policy) {
    case 'immediate': return 'Immediate';
    case 'time_delayed': return 'Time-Delayed';
    case 'approval': return 'Owner Approval';
    default: return policy;
  }
}

/** Compute remaining seconds until a target date */
function secondsUntil(isoDate: string): number {
  return Math.max(0, Math.floor((new Date(isoDate).getTime() - Date.now()) / 1000));
}

/** Format seconds into HH:MM:SS */
function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [
    h.toString().padStart(2, '0'),
    m.toString().padStart(2, '0'),
    s.toString().padStart(2, '0'),
  ].join(':');
}

/** Format a file size string for display (pass-through since API returns formatted) */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Policy badge component
// ---------------------------------------------------------------------------
function PolicyBadge({ policy }: { policy: string }) {
  const config: Record<string, { icon: React.FC<any>; bg: string; text: string }> = {
    immediate: { icon: Unlock, bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
    time_delayed: { icon: Clock, bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
    approval: { icon: Lock, bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
  };
  const cfg = config[policy] || config.immediate;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text}`}>
      <Icon className="h-3 w-3" />
      {policyLabel(policy)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status badge component
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: React.FC<any>; bg: string; text: string; label: string }> = {
    none: { icon: Shield, bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', label: 'Not requested' },
    pending: { icon: Clock, bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'Pending' },
    approved: { icon: CheckCircle2, bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Approved' },
    auto_granted: { icon: CheckCircle2, bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Access granted' },
    denied: { icon: XCircle, bg: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'Denied' },
    vetoed: { icon: XCircle, bg: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'Vetoed' },
  };
  const cfg = config[status] || config.none;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cooldown timer hook
// ---------------------------------------------------------------------------
function useCooldownTimer(cooldownEndsAt: string | null): number {
  const [remaining, setRemaining] = useState(() =>
    cooldownEndsAt ? secondsUntil(cooldownEndsAt) : 0,
  );

  useEffect(() => {
    if (!cooldownEndsAt) return;
    setRemaining(secondsUntil(cooldownEndsAt));
    const interval = setInterval(() => {
      const left = secondsUntil(cooldownEndsAt);
      setRemaining(left);
      if (left <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownEndsAt]);

  return remaining;
}

// ---------------------------------------------------------------------------
// Cooldown countdown display
// ---------------------------------------------------------------------------
function CooldownCountdown({ cooldownEndsAt }: { cooldownEndsAt: string }) {
  const remaining = useCooldownTimer(cooldownEndsAt);

  if (remaining <= 0) {
    return (
      <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
        <span className="text-sm font-medium">Cooldown complete. Refresh to see updated access.</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <Clock className="h-5 w-5 text-amber-600 flex-shrink-0" />
      <div>
        <p className="text-sm font-medium text-amber-800">Access will be granted after cooldown period</p>
        <p className="text-2xl font-mono font-bold text-amber-700 mt-1">{formatCountdown(remaining)}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document list for granted access
// ---------------------------------------------------------------------------
function DocumentList({ grantId, documents, onViewDocument }: { grantId: string; documents: AccessibleDocument[]; onViewDocument?: (grantId: string, doc: AccessibleDocument) => void }) {
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);

  const handleView = async (doc: AccessibleDocument) => {
    if (onViewDocument) {
      onViewDocument(grantId, doc);
      return;
    }
    setLoadingDocId(doc.id);
    try {
      const url = await getDocumentPreviewUrl(grantId, doc.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      alert(err.message || 'Failed to get document preview URL');
    } finally {
      setLoadingDocId(null);
    }
  };

  if (documents.length === 0) {
    return (
      <div className="text-center py-6 text-slate-500">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No documents available for this event yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-emerald-300 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{doc.name}</p>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                <span>{doc.category}</span>
                <span className="text-slate-300">|</span>
                <span>{doc.size}</span>
                <span className="text-slate-300">|</span>
                <span>{formatDate(doc.upload_date)}</span>
                {doc.expiration_date && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span className={doc.status === 'expired' ? 'text-red-500' : ''}>
                      Exp: {formatDate(doc.expiration_date)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => handleView(doc)}
            disabled={loadingDocId === doc.id}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0 ml-3"
          >
            {loadingDocId === doc.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            View
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded event detail panel
// ---------------------------------------------------------------------------
function EventDetailPanel({ event, onRefreshParent, onViewDocument }: { event: SharedEventSummary; onRefreshParent: () => void; onViewDocument?: (grantId: string, doc: AccessibleDocument) => void }) {
  const [documents, setDocuments] = useState<AccessibleDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const fetchedRef = useRef(false);

  const hasAccess = event.request_status === 'approved' || event.request_status === 'auto_granted';
  const isDenied = event.request_status === 'denied' || event.request_status === 'vetoed';
  const isPending = event.request_status === 'pending';
  const isNone = event.request_status === 'none';

  // Fetch documents when access is granted
  useEffect(() => {
    if (!hasAccess || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    getSharedEventDetail(event.grant_id)
      .then((detail) => setDocuments(detail.documents))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [hasAccess, event.grant_id]);

  const handleRequestAccess = async () => {
    setRequesting(true);
    setError(null);
    try {
      await requestAccess(event.grant_id);
      onRefreshParent();
    } catch (err: any) {
      setError(err.message || 'Failed to request access');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      {/* Instructions from the event owner */}
      {event.notes && (
        <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-3">
          <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-blue-700 mb-0.5">Instructions from {event.owner_name}</p>
            <p className="text-sm text-blue-800">{event.notes}</p>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Request status: none */}
      {isNone && (
        <div className="space-y-3">
          {event.access_policy === 'immediate' && (
            <p className="text-sm text-slate-600">
              This event uses <strong>immediate access</strong>. Your request will be granted automatically.
            </p>
          )}
          {event.access_policy === 'time_delayed' && (
            <p className="text-sm text-slate-600">
              This event uses a <strong>time-delayed policy</strong>. After requesting, there will be a{' '}
              <strong>{event.delay_hours}-hour</strong> cooldown before access is granted.
              The owner can veto during this period.
            </p>
          )}
          {event.access_policy === 'approval' && (
            <p className="text-sm text-slate-600">
              This event requires <strong>owner approval</strong>. The owner will be notified and must
              approve your request before you can view documents.
            </p>
          )}
          <button
            onClick={handleRequestAccess}
            disabled={requesting}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-xl transition-colors"
          >
            {requesting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Shield className="h-4 w-4" />
            )}
            Request Access
          </button>
        </div>
      )}

      {/* Pending: time_delayed with cooldown */}
      {isPending && event.access_policy === 'time_delayed' && event.cooldown_ends_at && (
        <CooldownCountdown cooldownEndsAt={event.cooldown_ends_at} />
      )}

      {/* Pending: approval-based */}
      {isPending && event.access_policy === 'approval' && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <Clock className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-800">Waiting for owner approval</p>
            <p className="text-xs text-blue-600 mt-0.5">
              {event.owner_name} will be notified and can approve or deny your request.
            </p>
          </div>
        </div>
      )}

      {/* Pending: immediate (should resolve quickly, show spinner) */}
      {isPending && event.access_policy === 'immediate' && (
        <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <Loader2 className="h-5 w-5 animate-spin flex-shrink-0" />
          <span className="text-sm font-medium">Processing your access request...</span>
        </div>
      )}

      {/* Denied or vetoed */}
      {isDenied && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Access denied</p>
            <p className="text-xs text-red-600 mt-0.5">
              {event.request_status === 'vetoed'
                ? 'The owner vetoed your access request during the cooldown period.'
                : 'The owner has denied your access request.'}
            </p>
          </div>
        </div>
      )}

      {/* Access granted: show documents */}
      {hasAccess && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">
              Access granted
              {event.access_granted_at && (
                <span className="font-normal text-slate-500 ml-1">
                  on {formatDate(event.access_granted_at)}
                </span>
              )}
            </span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 text-emerald-600 animate-spin" />
            </div>
          ) : (
            <DocumentList grantId={event.grant_id} documents={documents} onViewDocument={onViewDocument} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event card
// ---------------------------------------------------------------------------
function EventCard({ event, onRefreshParent, onViewDocument }: { event: SharedEventSummary; onRefreshParent: () => void; onViewDocument?: (grantId: string, doc: AccessibleDocument) => void }) {
  const [expanded, setExpanded] = useState(false);

  const hasAccess = event.request_status === 'approved' || event.request_status === 'auto_granted';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4 flex items-center gap-4"
      >
        {/* Event icon */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
          hasAccess ? 'bg-emerald-50' : 'bg-slate-50'
        }`}>
          <FileText className={`h-5 w-5 ${hasAccess ? 'text-emerald-600' : 'text-slate-400'}`} />
        </div>

        {/* Event info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{event.event_title}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Shared by {event.owner_name}
            {event.document_count > 0 && (
              <span className="ml-2 text-slate-400">
                {event.document_count} document{event.document_count !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <PolicyBadge policy={event.access_policy} />
          <StatusBadge status={event.request_status} />
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4">
          <EventDetailPanel event={event} onRefreshParent={onRefreshParent} onViewDocument={onViewDocument} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------
function SkeletonCard() {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-5 py-4 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-slate-100" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-100 rounded w-2/3" />
          <div className="h-3 bg-slate-100 rounded w-1/3" />
        </div>
        <div className="flex gap-2">
          <div className="h-6 w-20 bg-slate-100 rounded-full" />
          <div className="h-6 w-20 bg-slate-100 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline document viewer overlay (blob-based, like vault DocumentViewer)
// ---------------------------------------------------------------------------
function DocumentViewerOverlay({ docName, blobUrl, contentType, onClose }: {
  docName: string;
  blobUrl: string;
  contentType: string;
  onClose: () => void;
}) {
  const fileName = docName.toLowerCase();
  const mime = contentType.toLowerCase();

  const isPdf = mime === 'application/pdf' || fileName.endsWith('.pdf');
  const isImage = mime.startsWith('image/') || !!fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff)$/);
  const isWord = mime.includes('wordprocessingml') || mime === 'application/msword' || !!fileName.match(/\.(doc|docx)$/);
  const isOffice = isWord ||
    mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel' || !!fileName.match(/\.(xls|xlsx)$/) ||
    mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint' || !!fileName.match(/\.(ppt|pptx)$/);

  const handleDownload = () => {
    const link = window.document.createElement('a');
    link.href = blobUrl;
    link.download = docName;
    link.style.display = 'none';
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {isPdf ? <FileText className="h-5 w-5 text-red-600 flex-shrink-0" /> :
           isImage ? <Image className="h-5 w-5 text-emerald-600 flex-shrink-0" /> :
           <FileText className="h-5 w-5 text-emerald-600 flex-shrink-0" />}
          <span className="text-sm font-medium text-slate-900 truncate">{docName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>
      </div>
      {/* Document content */}
      <div className="flex-1 bg-slate-100 overflow-auto">
        {isPdf && (
          <embed
            src={blobUrl}
            type="application/pdf"
            className="w-full h-full"
            title={docName}
          />
        )}
        {isImage && (
          <div className="flex items-center justify-center h-full p-8">
            <img
              src={blobUrl}
              alt={docName}
              className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
            />
          </div>
        )}
        {isOffice && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <FileText className="h-20 w-20 text-blue-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">{docName}</h3>
              <p className="text-sm text-slate-500 mb-6">
                Office documents cannot be previewed in the browser. Download the file to view it.
              </p>
              <button
                onClick={handleDownload}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors inline-flex items-center gap-2"
              >
                <Download className="h-5 w-5" />
                Download Document
              </button>
            </div>
          </div>
        )}
        {!isPdf && !isImage && !isOffice && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FileText className="h-16 w-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Preview not available</h3>
              <p className="text-sm text-slate-500 mb-4">This file type cannot be previewed in the browser.</p>
              <button
                onClick={handleDownload}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors inline-flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download to View
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Embeddable section (used inside LifeEventsPage tab)
// ---------------------------------------------------------------------------
interface SharedWithMeSectionProps {
  currentPlan?: 'free' | 'starter' | 'pro';
}

export function SharedWithMeSection({ currentPlan }: SharedWithMeSectionProps) {
  const [events, setEvents] = useState<SharedEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerBlobUrl, setViewerBlobUrl] = useState<string | null>(null);
  const [viewerDoc, setViewerDoc] = useState<Document | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerDocName, setViewerDocName] = useState('');

  const fetchEvents = useCallback(async () => {
    try {
      setError(null);
      const data = await getSharedWithMe();
      setEvents(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load shared events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Cleanup blob URL on unmount or when viewer closes
  useEffect(() => {
    return () => {
      if (viewerBlobUrl) URL.revokeObjectURL(viewerBlobUrl);
    };
  }, [viewerBlobUrl]);

  const handleViewDocument = async (grantId: string, doc: AccessibleDocument) => {
    try {
      setViewerLoading(true);
      setViewerDocName(doc.name);
      const blob = await getDocumentContent(grantId, doc.id);
      const blobUrl = URL.createObjectURL(blob);
      const validCategories = ['warranty', 'insurance', 'lease', 'employment', 'contract', 'other'] as const;
      const category = validCategories.includes(doc.category as any) ? doc.category as Document['category'] : 'other';
      const mapped: Document = {
        id: doc.id,
        name: doc.name,
        type: blob.type || doc.type || 'application/octet-stream',
        category,
        uploadDate: doc.upload_date,
        expirationDate: doc.expiration_date,
        size: doc.size,
        status: doc.status === 'expired' ? 'expired' : 'active',
      };
      setViewerDoc(mapped);
      setViewerBlobUrl(blobUrl);
    } catch (err: any) {
      alert(err.message || 'Failed to load document');
    } finally {
      setViewerLoading(false);
    }
  };

  const closeViewer = () => {
    if (viewerBlobUrl) URL.revokeObjectURL(viewerBlobUrl);
    setViewerBlobUrl(null);
    setViewerDoc(null);
    setViewerDocName('');
  };

  // Group events by owner name
  const groupedByOwner = events.reduce<Record<string, SharedEventSummary[]>>((acc, event) => {
    const key = event.owner_name || event.owner_email;
    if (!acc[key]) acc[key] = [];
    acc[key].push(event);
    return acc;
  }, {});

  const ownerNames = Object.keys(groupedByOwner).sort();

  return (
    <>
      {/* Loading overlay when fetching document content */}
      {viewerLoading && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 text-center shadow-xl">
            <Loader2 className="h-10 w-10 text-emerald-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">Loading {viewerDocName}...</p>
          </div>
        </div>
      )}

      {/* Document viewer overlay */}
      {viewerBlobUrl && viewerDoc && !viewerLoading && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden">
            <DocumentViewer
              document={viewerDoc}
              onBack={closeViewer}
              preloadedBlobUrl={viewerBlobUrl}
              hideDownload
              isOverlay
            />
          </div>
        </div>
      )}

      {/* Upsell banner for non-pro users */}
      {currentPlan !== 'pro' && (
        <div className="mb-6 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <p className="text-sm text-emerald-800">
            You're viewing shared documents. Want to organize your own?{' '}
            <span className="font-semibold">Upgrade to Pro</span> to create life events and share
            documents with your trusted contacts.
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 mb-6">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
          <button
            onClick={() => { setLoading(true); fetchEvents(); }}
            className="text-sm font-medium text-red-700 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && events.length === 0 && (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
            <Shield className="h-8 w-8 text-slate-300" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">No shared documents yet</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            When someone adds you as a trusted contact and shares a life event with you,
            it will appear here. You'll be able to request access to their important documents
            when the time comes.
          </p>
        </div>
      )}

      {/* Event list grouped by owner */}
      {!loading && !error && ownerNames.length > 0 && (
        <div className="space-y-8">
          {ownerNames.map((ownerName) => (
            <div key={ownerName}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                  <Users className="h-4 w-4 text-teal-700" />
                </div>
                <h2 className="text-base font-semibold text-slate-800">{ownerName}</h2>
                <span className="text-xs text-slate-400">
                  {groupedByOwner[ownerName].length} event{groupedByOwner[ownerName].length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-3">
                {groupedByOwner[ownerName].map((event) => (
                  <EventCard
                    key={event.grant_id}
                    event={event}
                    onRefreshParent={fetchEvents}
                    onViewDocument={handleViewDocument}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Standalone page (kept for backwards compat, delegates to section)
// ---------------------------------------------------------------------------
export function SharedWithMePage({ currentPlan }: SharedWithMePageProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Users className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Shared With Me</h1>
            <p className="text-sm text-slate-500">
              Life event documents that others have shared with you
            </p>
          </div>
        </div>
      </div>
      <SharedWithMeSection currentPlan={currentPlan} />
    </div>
  );
}
