import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSignature, Clock, CheckCircle2, XCircle, AlertTriangle, Loader2,
  MoreHorizontal, Send, Trash2, Download, Inbox, RefreshCw, Eye,
  ChevronRight, FolderPlus, Crown, ArrowLeft, User, Mail,
} from 'lucide-react';
import { auth } from '../../lib/auth';
import { useTabParam } from '../../hooks/useTabParams';

interface SentRequest {
  id: string;
  title: string;
  document_id: string;
  document_name: string;
  status: string;
  signer_count: number;
  signed_count: number;
  created_at: string;
  completed_at: string | null;
  signed_file_path: string | null;
}

interface SignerDetail {
  id: string;
  signer_email: string;
  signer_name: string;
  signing_order_index: number;
  status: string;
  signed_at: string | null;
}

interface RequestDetail {
  id: string;
  title: string;
  document_name: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  signers: SignerDetail[];
}

interface ReceivedRequest {
  id: string;
  title: string;
  request_status: string;
  document_name: string;
  owner_name: string;
  signer_id: string;
  signer_status: string;
  signed_at: string | null;
  created_at: string;
  vault_captured: boolean;
}

interface SignatureRequestListProps {
  userEmail: string | null;
  onStartSigning?: (signerId: string) => void;
  onRefreshDocuments?: () => void;
  onPendingCountChange?: (count: number) => void;
  onViewDocument?: (documentId: string) => void;
}

const STATUS_CONFIG: Record<string, { icon: typeof Clock; label: string; color: string; bg: string }> = {
  draft: { icon: FileSignature, label: 'Draft', color: 'text-slate-500', bg: 'bg-slate-100' },
  pending: { icon: Clock, label: 'Pending', color: 'text-amber-600', bg: 'bg-amber-50' },
  completed: { icon: CheckCircle2, label: 'Completed', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  voided: { icon: XCircle, label: 'Voided', color: 'text-red-500', bg: 'bg-red-50' },
  expired: { icon: AlertTriangle, label: 'Expired', color: 'text-orange-500', bg: 'bg-orange-50' },
  notified: { icon: Clock, label: 'Awaiting', color: 'text-amber-600', bg: 'bg-amber-50' },
  viewed: { icon: Eye, label: 'Viewed', color: 'text-blue-600', bg: 'bg-blue-50' },
  signed: { icon: CheckCircle2, label: 'Signed', color: 'text-emerald-600', bg: 'bg-emerald-50' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${config.bg} ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type SubTab = 'received' | 'sent';
const SUB_TABS = ['received', 'sent'] as const;

export function SignatureRequestList({ userEmail, onStartSigning, onRefreshDocuments, onPendingCountChange, onViewDocument }: SignatureRequestListProps) {
  const [subTab, setSubTab] = useTabParam<SubTab>('subtab', 'received', SUB_TABS);
  const [sent, setSent] = useState<SentRequest[]>([]);
  const [received, setReceived] = useState<ReceivedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [vaultCapturing, setVaultCapturing] = useState<string | null>(null); // signer_id being captured
  const [vaultCaptureResult, setVaultCaptureResult] = useState<Record<string, 'saved' | 'limit-reached' | 'error'>>({});
  const [requestDetail, setRequestDetail] = useState<RequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await auth.getSession();
      if (!session) return;

      const res = await fetch(`${API_BASE}/api/esignature/my-signatures`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to load signatures');
      const { data } = await res.json();
      setSent(data.sent || []);
      setReceived(data.received || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAction = useCallback(async (requestId: string, action: 'void' | 'delete' | 'remind' | 'download') => {
    try {
      const { data: { session } } = await auth.getSession();
      if (!session) return;

      let url = `${API_BASE}/api/esignature/requests/${requestId}`;
      let method = 'POST';

      switch (action) {
        case 'void': url += '/void'; break;
        case 'delete': method = 'DELETE'; break;
        case 'remind': url += '/remind'; break;
        case 'download':
          url += '/signed-pdf';
          const dlRes = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
          if (dlRes.ok) {
            const { data } = await dlRes.json();
            window.open(data.url, '_blank');
          }
          setActionMenu(null);
          return;
      }

      await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      });

      setActionMenu(null);
      fetchData();
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    }
  }, [API_BASE, fetchData]);

  const handleVaultCapture = useCallback(async (signerId: string) => {
    setVaultCapturing(signerId);
    try {
      const { data: { session } } = await auth.getSession();
      if (!session) return;

      const res = await fetch(`${API_BASE}/api/esignature/signer/${signerId}/vault-capture`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: session.user.id }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.code === 'DOCUMENT_LIMIT_REACHED') {
          setVaultCaptureResult(prev => ({ ...prev, [signerId]: 'limit-reached' }));
        } else {
          setVaultCaptureResult(prev => ({ ...prev, [signerId]: 'error' }));
        }
        return;
      }

      setVaultCaptureResult(prev => ({ ...prev, [signerId]: 'saved' }));
      // Refresh signature list + documents list
      fetchData();
      onRefreshDocuments?.();
    } catch {
      setVaultCaptureResult(prev => ({ ...prev, [signerId]: 'error' }));
    } finally {
      setVaultCapturing(null);
    }
  }, [API_BASE, fetchData]);

  const fetchRequestDetail = useCallback(async (requestId: string) => {
    setDetailLoading(true);
    try {
      const { data: { session } } = await auth.getSession();
      if (!session) return;

      const res = await fetch(`${API_BASE}/api/esignature/requests/${requestId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to load request detail');
      const { data } = await res.json();
      setRequestDetail(data);
    } catch (err) {
      console.error('Failed to fetch request detail:', err);
    } finally {
      setDetailLoading(false);
    }
  }, [API_BASE]);

  const pendingToSign = received.filter(r => r.signer_status !== 'signed' && r.request_status === 'pending');
  const completedReceived = received.filter(r => r.signer_status === 'signed' || r.request_status !== 'pending');
  const pendingSent = sent.filter(r => r.status === 'pending');

  // Report total pending count (received to sign + sent awaiting) to parent for badge display
  useEffect(() => {
    onPendingCountChange?.(pendingToSign.length + pendingSent.length);
  }, [pendingToSign.length, pendingSent.length, onPendingCountChange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
        <p className="text-slate-600 mb-3">{error}</p>
        <button onClick={fetchData} className="text-emerald-600 font-medium text-sm hover:text-emerald-700 inline-flex items-center gap-1">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6">
        <button
          onClick={() => setSubTab('received')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
            subTab === 'received'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Inbox className="h-4 w-4" />
          To Sign
          {pendingToSign.length > 0 && (
            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-bold">
              {pendingToSign.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab('sent')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
            subTab === 'sent'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Send className="h-4 w-4" />
          Sent
          {sent.length > 0 && (
            <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              subTab === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
            }`}>
              {sent.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Received (To Sign) ─────────────────────────────────── */}
      {subTab === 'received' && (
        <div className="space-y-3">
          {received.length === 0 ? (
            <div className="text-center py-12">
              <Inbox className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No signature requests</p>
              <p className="text-sm text-slate-400 mt-1">When someone requests your signature, it will appear here.</p>
            </div>
          ) : (
            <>
              {pendingToSign.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2 px-1">Action Required</h4>
                  {pendingToSign.map(r => (
                    <div
                      key={r.signer_id}
                      onClick={() => onStartSigning?.(r.signer_id)}
                      className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-2 cursor-pointer hover:border-amber-400 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">{r.document_name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">From {r.owner_name} &middot; {timeAgo(r.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={r.signer_status} />
                          <ChevronRight className="h-4 w-4 text-amber-400" />
                        </div>
                      </div>
                      <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                        <FileSignature className="h-3 w-3" />
                        Tap to review and sign this document
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {completedReceived.length > 0 && (
                <div>
                  {pendingToSign.length > 0 && (
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">Completed</h4>
                  )}
                  {completedReceived.map(r => {
                    const captureResult = vaultCaptureResult[r.signer_id];
                    const isCapturing = vaultCapturing === r.signer_id;
                    const canSave = !r.vault_captured && r.signer_status === 'signed' && r.request_status === 'completed' && !captureResult;

                    return (
                      <div key={r.signer_id} className="bg-white border border-slate-200 rounded-xl p-4 mb-2 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">{r.document_name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            From {r.owner_name} &middot; {r.signed_at ? `Signed ${timeAgo(r.signed_at)}` : timeAgo(r.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {canSave && (
                            <button
                              onClick={() => handleVaultCapture(r.signer_id)}
                              disabled={isCapturing}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-full transition-colors disabled:opacity-50"
                            >
                              {isCapturing ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderPlus className="h-3 w-3" />}
                              {isCapturing ? 'Saving...' : 'Save to Vault'}
                            </button>
                          )}
                          {captureResult === 'saved' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-full">
                              <CheckCircle2 className="h-3 w-3" /> Saved
                            </span>
                          )}
                          {r.vault_captured && !captureResult && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-full">
                              <CheckCircle2 className="h-3 w-3" /> In Vault
                            </span>
                          )}
                          {captureResult === 'limit-reached' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-amber-700 bg-amber-50 rounded-full">
                              <Crown className="h-3 w-3" /> Limit reached
                            </span>
                          )}
                          {captureResult === 'error' && (
                            <button
                              onClick={() => { setVaultCaptureResult(prev => { const n = {...prev}; delete n[r.signer_id]; return n; }); }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-full transition-colors"
                            >
                              <AlertTriangle className="h-3 w-3" /> Retry
                            </button>
                          )}
                          <StatusBadge status={r.signer_status === 'signed' ? 'signed' : r.request_status} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Sent (As Initiator) ────────────────────────────────── */}
      {subTab === 'sent' && (
        <div className="space-y-2">
          {/* Request detail overlay */}
          {requestDetail && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-4">
              <div className="flex items-center gap-3 p-4 border-b border-slate-100">
                <button
                  onClick={() => setRequestDetail(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-slate-900 truncate">{requestDetail.document_name}</h4>
                  <p className="text-xs text-slate-500">{requestDetail.title}</p>
                </div>
                <StatusBadge status={requestDetail.status} />
              </div>

              <div className="p-4">
                <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Signers</h5>
                <div className="space-y-2">
                  {requestDetail.signers.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        s.status === 'signed' ? 'bg-emerald-100' : 'bg-slate-200'
                      }`}>
                        {s.status === 'signed'
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          : <User className="h-4 w-4 text-slate-400" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{s.signer_name}</p>
                        <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {s.signer_email}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <StatusBadge status={s.status} />
                      </div>
                      {s.signed_at && (
                        <span className="text-[10px] text-slate-400 flex-shrink-0">{timeAgo(s.signed_at)}</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                  {requestDetail.status === 'pending' && (
                    <button
                      onClick={() => { handleAction(requestDetail.id, 'remind'); setRequestDetail(null); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      <Send className="h-3.5 w-3.5" /> Send Reminder
                    </button>
                  )}
                  {requestDetail.status === 'completed' && (
                    <button
                      onClick={() => { handleAction(requestDetail.id, 'download'); setRequestDetail(null); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" /> Download Signed PDF
                    </button>
                  )}
                  {(requestDetail.status === 'draft' || requestDetail.status === 'pending') && (
                    <button
                      onClick={() => { handleAction(requestDetail.id, 'void'); setRequestDetail(null); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Void Request
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {detailLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 text-emerald-600 animate-spin" />
            </div>
          )}

          {!requestDetail && !detailLoading && (
            <>
              {sent.length === 0 ? (
                <div className="text-center py-12">
                  <Send className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No sent requests</p>
                  <p className="text-sm text-slate-400 mt-1">Signature requests you send will appear here.</p>
                </div>
              ) : (
                sent.map(r => {
                  const handleClick = () => {
                    if (r.status === 'completed') {
                      onViewDocument?.(r.document_id);
                    } else {
                      fetchRequestDetail(r.id);
                    }
                  };

                  return (
                    <div
                      key={r.id}
                      onClick={handleClick}
                      className="bg-white border border-slate-200 rounded-xl p-3 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-semibold text-slate-900 truncate">{r.document_name}</h4>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <span>{r.signed_count}/{r.signer_count} signed</span>
                            <span>&middot;</span>
                            <span>{timeAgo(r.created_at)}</span>
                            {r.completed_at && <><span>&middot;</span><span>Done {timeAgo(r.completed_at)}</span></>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <StatusBadge status={r.status} />
                          <div className="relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); setActionMenu(actionMenu === r.id ? null : r.id); }}
                              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                            {actionMenu === r.id && (
                              <div className="absolute right-0 top-8 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-10">
                                {r.status === 'pending' && (
                                  <button onClick={(e) => { e.stopPropagation(); handleAction(r.id, 'remind'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                                    <Send className="h-4 w-4" /> Send Reminder
                                  </button>
                                )}
                                {r.status === 'completed' && r.signed_file_path && (
                                  <button onClick={(e) => { e.stopPropagation(); handleAction(r.id, 'download'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                                    <Download className="h-4 w-4" /> Download Signed PDF
                                  </button>
                                )}
                                {(r.status === 'draft' || r.status === 'pending') && (
                                  <button onClick={(e) => { e.stopPropagation(); handleAction(r.id, 'void'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                                    <XCircle className="h-4 w-4" /> Void Request
                                  </button>
                                )}
                                {r.status === 'draft' && (
                                  <button onClick={(e) => { e.stopPropagation(); handleAction(r.id, 'delete'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                                    <Trash2 className="h-4 w-4" /> Delete Draft
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-300" />
                        </div>
                      </div>
                      {r.status === 'pending' && r.signer_count > 0 && (
                        <div className="mt-2 w-full bg-slate-100 rounded-full h-1">
                          <div
                            className={`h-1 rounded-full transition-all ${
                              r.signed_count === r.signer_count ? 'bg-emerald-500' : 'bg-amber-400'
                            }`}
                            style={{ width: `${(r.signed_count / r.signer_count) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
