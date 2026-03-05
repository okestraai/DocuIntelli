import React, { useState, useEffect, useCallback } from 'react';
import {
  Headset,
  Search,
  RefreshCw,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Send,
  MessageSquare,
  User,
  Clock,
  Filter,
} from 'lucide-react';
import {
  adminGetAllTickets,
  adminGetTicketDetail,
  adminUpdateStatus,
  adminReply,
  type SupportTicket,
  type TicketMessage,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from '../../lib/supportTicketApi';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TicketStatus, { label: string; bg: string; text: string; border: string }> = {
  open: { label: 'Open', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  in_progress: { label: 'In Progress', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  waiting_on_user: { label: 'Waiting on User', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  resolved: { label: 'Resolved', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  closed: { label: 'Closed', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' },
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; dot: string }> = {
  low: { label: 'Low', dot: 'bg-slate-400' },
  medium: { label: 'Medium', dot: 'bg-blue-500' },
  high: { label: 'High', dot: 'bg-amber-500' },
  urgent: { label: 'Urgent', dot: 'bg-red-500' },
};

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  general: 'General',
  billing: 'Billing',
  technical: 'Technical',
  account: 'Account',
  feature_request: 'Feature Request',
  bug_report: 'Bug Report',
};

const ALL_STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting_on_user', 'resolved', 'closed'];
const ALL_CATEGORIES: TicketCategory[] = ['general', 'billing', 'technical', 'account', 'feature_request', 'bug_report'];
const ALL_PRIORITIES: TicketPriority[] = ['low', 'medium', 'high', 'urgent'];

const PAGE_SIZE = 20;

// ─── Component ───────────────────────────────────────────────────────────────

export function AdminSupportTickets() {
  // List state
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | ''>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Detail state
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<TicketMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await adminGetAllTickets({
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        priority: priorityFilter || undefined,
        search: search || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setTickets(result.tickets);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, priorityFilter, search, page]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const openDetail = useCallback(async (ticketId: string) => {
    setDetailLoading(true);
    try {
      const { ticket, messages } = await adminGetTicketDetail(ticketId);
      setSelectedTicket(ticket);
      setSelectedMessages(messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!selectedTicket) return;
    setStatusUpdating(true);
    try {
      const updated = await adminUpdateStatus(selectedTicket.id, newStatus);
      setSelectedTicket({ ...selectedTicket, ...updated });
      loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAdminReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setReplying(true);
    try {
      const msg = await adminReply(selectedTicket.id, replyText.trim());
      setSelectedMessages(prev => [...prev, msg]);
      setReplyText('');
      loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setReplying(false);
    }
  };

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ─── Detail View ───────────────────────────────────────────────────────────

  if (selectedTicket) {
    return (
      <div className="space-y-4">
        {/* Back button */}
        <button
          onClick={() => { setSelectedTicket(null); setSelectedMessages([]); setReplyText(''); }}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to all tickets
        </button>

        {detailLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {/* Ticket header */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <span className="text-xs font-mono text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200 mb-1 inline-block">{selectedTicket.ticket_number}</span>
                  <h3 className="text-lg font-semibold text-slate-900">{selectedTicket.subject}</h3>
                </div>
                <StatusBadge status={selectedTicket.status} />
              </div>

              {/* Meta info */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                <div>
                  <span className="text-xs text-slate-500 block">Submitted By</span>
                  <span className="text-sm font-medium text-slate-900">
                    {selectedTicket.user_name || selectedTicket.user_email || 'Unknown'}
                  </span>
                  {selectedTicket.user_name && selectedTicket.user_email && (
                    <span className="text-xs text-slate-500 block">{selectedTicket.user_email}</span>
                  )}
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Category</span>
                  <span className="text-sm font-medium text-slate-900">{CATEGORY_LABELS[selectedTicket.category]}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Priority</span>
                  <span className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[selectedTicket.priority].dot}`} />
                    {PRIORITY_CONFIG[selectedTicket.priority].label}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Created</span>
                  <span className="text-sm font-medium text-slate-900">{formatDate(selectedTicket.created_at)}</span>
                </div>
                {selectedTicket.resolution_hours != null && (
                  <div>
                    <span className="text-xs text-slate-500 block">Resolution Time</span>
                    <span className="text-sm font-medium text-emerald-700 flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {selectedTicket.resolution_hours < 1
                        ? `${Math.round(selectedTicket.resolution_hours * 60)} min`
                        : selectedTicket.resolution_hours < 24
                          ? `${selectedTicket.resolution_hours} hrs`
                          : `${(selectedTicket.resolution_hours / 24).toFixed(1)} days`}
                    </span>
                  </div>
                )}
              </div>

              <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedTicket.description}</p>

              {/* Status controls */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500 mr-1">Set status:</span>
                {ALL_STATUSES.map(s => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    disabled={selectedTicket.status === s || statusUpdating}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      selectedTicket.status === s
                        ? `${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].text} ${STATUS_CONFIG[s].border}`
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
                {statusUpdating && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              </div>
            </div>

            {/* Messages thread */}
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="p-4 border-b border-slate-100">
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-slate-500" />
                  Conversation ({selectedMessages.length})
                </h4>
              </div>
              <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                {selectedMessages.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6">No messages yet.</p>
                ) : (
                  selectedMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.is_admin ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-lg px-4 py-3 ${
                        msg.is_admin
                          ? 'bg-blue-50 border border-blue-200'
                          : 'bg-slate-100 border border-slate-200'
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium ${msg.is_admin ? 'text-blue-700' : 'text-slate-700'}`}>
                            {msg.sender_name || msg.sender_email || (msg.is_admin ? 'Admin' : 'User')}
                          </span>
                          {msg.is_admin && (
                            <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">Staff</span>
                          )}
                          <span className="text-xs text-slate-400">{formatDateTime(msg.created_at)}</span>
                        </div>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.body}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Admin reply box */}
              <div className="p-4 border-t border-slate-100">
                <div className="flex gap-2">
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Reply as admin..."
                    rows={2}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                  />
                  <button
                    onClick={handleAdminReply}
                    disabled={!replyText.trim() || replying}
                    className="self-end px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                  >
                    {replying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Reply
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ─── Ticket List View ──────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="flex gap-1 flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search subject or email..."
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
            <button
              onClick={handleSearch}
              className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <Search className="h-4 w-4 text-slate-600" />
            </button>
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="">All Statuses</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value as any); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="">All Categories</option>
            {ALL_CATEGORIES.map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>

          {/* Priority filter */}
          <select
            value={priorityFilter}
            onChange={e => { setPriorityFilter(e.target.value as any); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="">All Priorities</option>
            {ALL_PRIORITIES.map(p => (
              <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
            ))}
          </select>

          {/* Refresh */}
          <button
            onClick={loadTickets}
            disabled={loading}
            className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border bg-red-50 border-red-200 text-red-800 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12">
            <Headset className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No tickets found matching your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Ticket #</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Subject</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Submitted By</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Category</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Priority</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Status</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-900">Msgs</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Resolution</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(ticket => (
                  <tr
                    key={ticket.id}
                    onClick={() => openDetail(ticket.id)}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">{ticket.ticket_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-900 line-clamp-1">{ticket.subject}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-medium text-slate-900 block">{ticket.user_name || '—'}</span>
                        {ticket.user_email && <span className="text-xs text-slate-500">{ticket.user_email}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-600">{CATEGORY_LABELS[ticket.category]}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[ticket.priority].dot}`} />
                        <span className="text-slate-700">{PRIORITY_CONFIG[ticket.priority].label}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {ticket.message_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {ticket.resolution_hours != null ? (
                        <span className="text-emerald-600 text-xs font-medium">
                          {ticket.resolution_hours < 1
                            ? `${Math.round(ticket.resolution_hours * 60)}m`
                            : ticket.resolution_hours < 24
                              ? `${ticket.resolution_hours}h`
                              : `${(ticket.resolution_hours / 24).toFixed(1)}d`}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDate(ticket.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-600">
              Page {page} of {totalPages} ({total} tickets)
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-slate-600" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared sub-component ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TicketStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
      {config.label}
    </span>
  );
}

export default AdminSupportTickets;
