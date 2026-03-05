import React, { useState, useEffect, useCallback } from 'react';
import {
  LifeBuoy,
  Plus,
  ArrowLeft,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquare,
  ChevronRight,
  Filter,
} from 'lucide-react';
import {
  getMyTickets,
  createTicket,
  getTicketMessages,
  replyToTicket,
  markTicketSeen,
  type SupportTicket,
  type TicketMessage,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from '../lib/supportTicketApi';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TicketStatus, { label: string; bg: string; text: string; border: string }> = {
  open: { label: 'Open', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  in_progress: { label: 'In Progress', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  waiting_on_user: { label: 'Awaiting Reply', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  resolved: { label: 'Resolved', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  closed: { label: 'Closed', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
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

type FilterTab = 'all' | 'open' | 'in_progress' | 'resolved' | 'closed';

// ─── Component ───────────────────────────────────────────────────────────────

export function SupportTicketsTab() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  // Detail view
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  // New ticket form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<TicketCategory>('general');
  const [newPriority, setNewPriority] = useState<TicketPriority>('medium');
  const [submitting, setSubmitting] = useState(false);

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const status = filterTab === 'all' ? undefined : filterTab as TicketStatus;
      const data = await getMyTickets(status);
      setTickets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [filterTab]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const openTicketDetail = useCallback(async (ticket: SupportTicket) => {
    setSelectedTicketId(ticket.id);
    setSelectedTicket(ticket);
    setMessagesLoading(true);
    try {
      const msgs = await getTicketMessages(ticket.id);
      setMessages(msgs);
      // Mark ticket as seen (clears unread indicator)
      markTicketSeen(ticket.id).catch(() => {});
      // Clear local unread flag immediately
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, has_unread: false } : t));
    } catch {
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const handleReply = async () => {
    if (!replyText.trim() || !selectedTicketId) return;
    setReplying(true);
    try {
      const msg = await replyToTicket(selectedTicketId, replyText.trim());
      setMessages(prev => [...prev, msg]);
      setReplyText('');
      loadTickets(); // refresh status
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setReplying(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!newSubject.trim() || !newDescription.trim()) return;
    setSubmitting(true);
    try {
      await createTicket(newSubject.trim(), newDescription.trim(), newCategory, newPriority);
      setShowNewForm(false);
      setNewSubject('');
      setNewDescription('');
      setNewCategory('general');
      setNewPriority('medium');
      loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
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

  // ─── Ticket Detail View ────────────────────────────────────────────────────

  if (selectedTicketId && selectedTicket) {
    const canReply = !['closed', 'resolved'].includes(selectedTicket.status);
    return (
      <div className="space-y-4">
        {/* Back button */}
        <button
          onClick={() => { setSelectedTicketId(null); setSelectedTicket(null); setMessages([]); setReplyText(''); }}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to tickets
        </button>

        {/* Ticket header */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 mb-1 inline-block">{selectedTicket.ticket_number}</span>
              <h3 className="text-lg font-semibold text-slate-900">{selectedTicket.subject}</h3>
            </div>
            <StatusBadge status={selectedTicket.status} />
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-500 mb-4">
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[selectedTicket.priority].dot}`} />
              {PRIORITY_CONFIG[selectedTicket.priority].label} priority
            </span>
            <span>{CATEGORY_LABELS[selectedTicket.category]}</span>
            <span>Created {formatDate(selectedTicket.created_at)}</span>
            {selectedTicket.resolution_hours != null && (
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-3 w-3" />
                Resolved in {selectedTicket.resolution_hours < 1
                  ? `${Math.round(selectedTicket.resolution_hours * 60)} min`
                  : selectedTicket.resolution_hours < 24
                    ? `${selectedTicket.resolution_hours} hrs`
                    : `${(selectedTicket.resolution_hours / 24).toFixed(1)} days`}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedTicket.description}</p>
        </div>

        {/* Messages thread */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4 border-b border-slate-100">
            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-slate-500" />
              Conversation
            </h4>
          </div>
          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">No messages yet. The support team will respond shortly.</p>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.is_admin ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    msg.is_admin
                      ? 'bg-slate-100 border border-slate-200'
                      : 'bg-blue-50 border border-blue-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${msg.is_admin ? 'text-slate-700' : 'text-blue-700'}`}>
                        {msg.is_admin ? (msg.sender_name || 'Support Team') : 'You'}
                      </span>
                      <span className="text-xs text-slate-400">{formatDateTime(msg.created_at)}</span>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.body}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Reply box */}
          {canReply && (
            <div className="p-4 border-t border-slate-100">
              <div className="flex gap-2">
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Type your reply..."
                  rows={2}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <button
                  onClick={handleReply}
                  disabled={!replyText.trim() || replying}
                  className="self-end px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                >
                  {replying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </button>
              </div>
            </div>
          )}
          {!canReply && (
            <div className="p-4 border-t border-slate-100">
              <p className="text-sm text-slate-500 text-center">This ticket has been {selectedTicket.status}. No further replies can be sent.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── New Ticket Form ───────────────────────────────────────────────────────

  if (showNewForm) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setShowNewForm(false)}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to tickets
        </button>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">New Support Ticket</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
              <input
                type="text"
                value={newSubject}
                onChange={e => setNewSubject(e.target.value)}
                placeholder="Brief summary of your issue"
                maxLength={200}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="Describe your issue in detail..."
                rows={5}
                maxLength={5000}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <p className="text-xs text-slate-400 mt-1">{newDescription.length}/5000</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value as TicketCategory)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  {(Object.keys(CATEGORY_LABELS) as TicketCategory[]).map(cat => (
                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                <select
                  value={newPriority}
                  onChange={e => setNewPriority(e.target.value as TicketPriority)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  {(Object.keys(PRIORITY_CONFIG) as TicketPriority[]).map(p => (
                    <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg border bg-red-50 border-red-200 text-red-800 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCreateTicket}
                disabled={!newSubject.trim() || !newDescription.trim() || submitting}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit Ticket
              </button>
              <button
                onClick={() => setShowNewForm(false)}
                className="px-5 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Ticket List View ──────────────────────────────────────────────────────

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'open', label: 'Open' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'resolved', label: 'Resolved' },
    { id: 'closed', label: 'Closed' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Support Tickets</h3>
          <p className="text-sm text-slate-500">Get help from our support team</p>
        </div>
        <button
          onClick={() => { setShowNewForm(true); setError(null); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Ticket
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {filterTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilterTab(tab.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              filterTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border bg-red-50 border-red-200 text-red-800 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : tickets.length === 0 ? (
        /* Empty state */
        <div className="text-center py-12">
          <LifeBuoy className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h4 className="text-base font-medium text-slate-700 mb-1">No tickets found</h4>
          <p className="text-sm text-slate-500 mb-4">
            {filterTab === 'all'
              ? "You haven't created any support tickets yet."
              : `No ${filterTab.replace('_', ' ')} tickets.`}
          </p>
          {filterTab === 'all' && (
            <button
              onClick={() => setShowNewForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Create Your First Ticket
            </button>
          )}
        </div>
      ) : (
        /* Ticket cards */
        <div className="space-y-2">
          {tickets.map(ticket => (
            <button
              key={ticket.id}
              onClick={() => openTicketDetail(ticket)}
              className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm hover:border-slate-300 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {ticket.has_unread && (
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0 animate-pulse" title="New reply from support" />
                    )}
                    <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 flex-shrink-0">{ticket.ticket_number}</span>
                    <h4 className="text-sm font-semibold text-slate-900 truncate">{ticket.subject}</h4>
                    <StatusBadge status={ticket.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_CONFIG[ticket.priority].dot}`} />
                      {PRIORITY_CONFIG[ticket.priority].label}
                    </span>
                    <span>{CATEGORY_LABELS[ticket.category]}</span>
                    <span>{formatDate(ticket.created_at)}</span>
                    {(ticket.message_count ?? 0) > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {ticket.message_count}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}
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

export default SupportTicketsTab;
