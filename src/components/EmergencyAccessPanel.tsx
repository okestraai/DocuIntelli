import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  UserCheck,
  UserPlus,
  Clock,
  Zap,
  CheckCircle,
  AlertTriangle,
  Pencil,
  Trash2,
  History,
  Mail,
  Eye,
  ShieldCheck,
  ShieldOff,
  ShieldAlert,
  FileText,
  Ban,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  StickyNote,
  Settings,
  Send,
} from 'lucide-react';
import {
  getContacts,
  getGrantsForEvent,
  createGrant,
  createContact,
  resendInvite,
  revokeContact,
  updateGrant,
  revokeGrant,
  approveAccess,
  denyAccess,
  vetoAccess,
  getAuditLog,
  type TrustedContact,
  type EmergencyAccessGrant,
  type AuditEntry,
} from '../lib/emergencyAccessApi';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EmergencyAccessPanelProps {
  lifeEventId: string;
  lifeEventTitle: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type AccessPolicy = 'immediate' | 'time_delayed' | 'approval';
type RequestStatus = EmergencyAccessGrant['request_status'];

const POLICY_BADGE: Record<AccessPolicy, { label: string; bg: string; text: string; border: string }> = {
  immediate:    { label: 'Immediate',    bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200' },
  time_delayed: { label: 'Time-Delayed', bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200' },
  approval:     { label: 'Approval',     bg: 'bg-blue-50',     text: 'text-blue-700',     border: 'border-blue-200' },
};

const STATUS_BADGE: Record<RequestStatus, { label: string; bg: string; text: string; border: string; pulse?: boolean }> = {
  none:         { label: 'No Request',    bg: 'bg-slate-50',    text: 'text-slate-600',    border: 'border-slate-200' },
  pending:      { label: 'Pending',       bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200', pulse: true },
  approved:     { label: 'Approved',      bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200' },
  auto_granted: { label: 'Auto-Granted',  bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200' },
  denied:       { label: 'Denied',        bg: 'bg-red-50',      text: 'text-red-700',      border: 'border-red-200' },
  vetoed:       { label: 'Vetoed',        bg: 'bg-red-50',      text: 'text-red-700',      border: 'border-red-200' },
};

const AUDIT_ICONS: Record<string, React.FC<{ className?: string }>> = {
  grant_created:    Plus,
  grant_revoked:    Trash2,
  grant_updated:    Settings,
  access_requested: ShieldAlert,
  access_granted:   ShieldCheck,
  access_auto_granted: ShieldCheck,
  access_denied:    ShieldOff,
  access_vetoed:    Ban,
  document_viewed:  Eye,
  invite_sent:      Send,
  invite_accepted:  UserCheck,
};

// ---------------------------------------------------------------------------
// Main component — Inline section (no card wrapper, eager loading)
// ---------------------------------------------------------------------------

export function EmergencyAccessPanel({ lifeEventId, lifeEventTitle }: EmergencyAccessPanelProps) {
  // Data
  const [grants, setGrants] = useState<EmergencyAccessGrant[]>([]);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);

  // Loading / error
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGrant, setEditingGrant] = useState<EmergencyAccessGrant | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  // Add form state
  const [selectedContactId, setSelectedContactId] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState<AccessPolicy>('approval');
  const [delayHours, setDelayHours] = useState(72);
  const [notes, setNotes] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Edit form state
  const [editPolicy, setEditPolicy] = useState<AccessPolicy>('approval');
  const [editDelayHours, setEditDelayHours] = useState(72);
  const [editNotes, setEditNotes] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // ── Data loading (eager — loads on mount) ──────────────────────────────

  const loadGrants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getGrantsForEvent(lifeEventId);
      setGrants(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load grants');
    } finally {
      setLoading(false);
    }
  }, [lifeEventId]);

  const loadContacts = useCallback(async () => {
    try {
      const data = await getContacts();
      setContacts(data);
    } catch {
      // Non-critical
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      setAuditLoading(true);
      const data = await getAuditLog();
      const grantIds = new Set(grants.map((g) => g.id));
      const filtered = data.filter((e) => grantIds.has(e.grant_id));
      setAuditEntries(filtered);
    } catch {
      setAuditEntries([]);
    } finally {
      setAuditLoading(false);
    }
  }, [grants]);

  // Load grants + contacts eagerly on mount
  useEffect(() => {
    loadGrants();
    loadContacts();
  }, [loadGrants, loadContacts]);

  useEffect(() => {
    if (showAudit && grants.length > 0) {
      loadAudit();
    }
  }, [showAudit, grants, loadAudit]);

  // ── Derived data ──────────────────────────────────────────────────────

  const activeGrants = grants.filter((g) => g.is_active);
  const activeCount = activeGrants.length;

  const grantedContactIds = new Set(grants.filter((g) => g.is_active).map((g) => g.trusted_contact_id));
  const availableContacts = contacts.filter(
    (c) => c.status === 'accepted' && !grantedContactIds.has(c.id)
  );
  const pendingContacts = contacts.filter((c) => c.status === 'pending');

  // ── Actions ───────────────────────────────────────────────────────────

  const handleCreateGrant = async () => {
    if (!selectedContactId) return;
    try {
      setCreateLoading(true);
      await createGrant(
        lifeEventId,
        selectedContactId,
        selectedPolicy,
        selectedPolicy === 'time_delayed' ? delayHours : undefined,
        notes || undefined
      );
      setShowAddModal(false);
      resetAddForm();
      await loadGrants();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create grant');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleUpdateGrant = async () => {
    if (!editingGrant) return;
    try {
      setEditLoading(true);
      await updateGrant(editingGrant.id, {
        access_policy: editPolicy,
        delay_hours: editPolicy === 'time_delayed' ? editDelayHours : undefined,
        notes: editNotes || undefined,
      });
      setEditingGrant(null);
      await loadGrants();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update grant');
    } finally {
      setEditLoading(false);
    }
  };

  const handleRevokeGrant = async (grantId: string) => {
    try {
      setActionLoading(grantId);
      await revokeGrant(grantId);
      await loadGrants();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke grant');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (grantId: string) => {
    try {
      setActionLoading(grantId);
      await approveAccess(grantId);
      await loadGrants();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve access');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeny = async (grantId: string) => {
    try {
      setActionLoading(grantId);
      await denyAccess(grantId);
      await loadGrants();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deny access');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVeto = async (grantId: string) => {
    try {
      setActionLoading(grantId);
      await vetoAccess(grantId);
      await loadGrants();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to veto access');
    } finally {
      setActionLoading(null);
    }
  };

  const handleContactCreated = () => {
    loadContacts();
  };

  const handleResendInvite = async (contactId: string) => {
    try {
      setActionLoading(contactId);
      await resendInvite(contactId);
      await loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invite');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeContact = async (contactId: string) => {
    const contact = contacts.find(c => c.id === contactId);
    const name = contact?.display_name || contact?.contact_email || 'this contact';
    if (!window.confirm(`Cancel the invitation to ${name}? They will no longer be able to accept it.`)) return;
    try {
      setActionLoading(contactId);
      await revokeContact(contactId);
      await loadContacts();
      await loadGrants();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke contact');
    } finally {
      setActionLoading(null);
    }
  };

  const openEditModal = (grant: EmergencyAccessGrant) => {
    setEditPolicy(grant.access_policy);
    setEditDelayHours(grant.delay_hours || 72);
    setEditNotes(grant.notes || '');
    setEditingGrant(grant);
  };

  const resetAddForm = () => {
    setSelectedContactId('');
    setSelectedPolicy('approval');
    setDelayHours(72);
    setNotes('');
  };

  // ── Helpers ───────────────────────────────────────────────────────────

  function formatDelayLabel(hours: number): string {
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    const remaining = hours % 24;
    return remaining > 0 ? `${days}d ${remaining}h` : `${days}d`;
  }

  function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  // ── Render — inline section (inside the header card) ──────────────────

  return (
    <>
      <div className="mt-5 pt-5 border-t border-slate-200">
        {/* Section header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-700">Emergency Access</h3>
            {activeCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                {activeCount}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add Contact
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 p-2.5 mb-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        )}

        {/* Empty state */}
        {!loading && activeCount === 0 && pendingContacts.length === 0 && (
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-dashed border-slate-200">
            <div className="bg-slate-100 w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0">
              <Shield className="h-4 w-4 text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-600">No emergency contacts assigned</p>
              <p className="text-xs text-slate-400">Designate trusted people who can access documents in this life event.</p>
            </div>
          </div>
        )}

        {/* Active grants — compact cards */}
        {!loading && activeCount > 0 && (
          <div className="space-y-2">
            {activeGrants.map((grant) => (
              <GrantCard
                key={grant.id}
                grant={grant}
                actionLoading={actionLoading}
                onEdit={() => openEditModal(grant)}
                onRevoke={() => handleRevokeGrant(grant.id)}
                onApprove={() => handleApprove(grant.id)}
                onDeny={() => handleDeny(grant.id)}
                onVeto={() => handleVeto(grant.id)}
                formatDelayLabel={formatDelayLabel}
              />
            ))}

            {/* Audit log link */}
            <button
              onClick={() => setShowAudit(!showAudit)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors mt-1"
            >
              <History className="h-3 w-3" />
              <span>Audit Log</span>
              {showAudit ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showAudit && (
              <div className="space-y-1.5 mt-2">
                {auditLoading && (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  </div>
                )}
                {!auditLoading && auditEntries.length === 0 && (
                  <p className="text-xs text-slate-400 py-2 text-center">No audit entries yet</p>
                )}
                {!auditLoading &&
                  auditEntries.map((entry) => (
                    <AuditRow key={entry.id} entry={entry} formatTimestamp={formatTimestamp} />
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Pending invitations */}
        {!loading && pendingContacts.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Pending Invitations</p>
            {pendingContacts.map((contact) => {
              const isLoading = actionLoading === contact.id;
              return (
                <div key={contact.id} className="flex items-center gap-2 p-2.5 bg-amber-50/50 border border-amber-100 rounded-lg">
                  <div className="bg-amber-100 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0">
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{contact.display_name}</p>
                    <p className="text-xs text-slate-500 truncate">{contact.contact_email}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleResendInvite(contact.id)}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors disabled:opacity-50"
                      title="Resend invitation email"
                    >
                      {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                      Resend
                    </button>
                    <button
                      onClick={() => handleRevokeContact(contact.id)}
                      disabled={isLoading}
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                      title="Cancel invitation"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Contact / Grant Modal */}
      {showAddModal && (
        <AddGrantModal
          lifeEventId={lifeEventId}
          availableContacts={availableContacts}
          contacts={contacts}
          selectedContactId={selectedContactId}
          selectedPolicy={selectedPolicy}
          delayHours={delayHours}
          notes={notes}
          loading={createLoading}
          onSelectContact={setSelectedContactId}
          onSelectPolicy={setSelectedPolicy}
          onChangeDelay={setDelayHours}
          onChangeNotes={setNotes}
          onSubmit={handleCreateGrant}
          onClose={() => {
            setShowAddModal(false);
            resetAddForm();
          }}
          onContactCreated={handleContactCreated}
          formatDelayLabel={formatDelayLabel}
        />
      )}

      {/* Edit Grant Modal */}
      {editingGrant && (
        <EditGrantModal
          grant={editingGrant}
          editPolicy={editPolicy}
          editDelayHours={editDelayHours}
          editNotes={editNotes}
          loading={editLoading}
          onSelectPolicy={setEditPolicy}
          onChangeDelay={setEditDelayHours}
          onChangeNotes={setEditNotes}
          onSubmit={handleUpdateGrant}
          onClose={() => setEditingGrant(null)}
          formatDelayLabel={formatDelayLabel}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// GrantCard — compact inline card
// ---------------------------------------------------------------------------

function GrantCard({
  grant,
  actionLoading,
  onEdit,
  onRevoke,
  onApprove,
  onDeny,
  onVeto,
  formatDelayLabel,
}: {
  grant: EmergencyAccessGrant;
  actionLoading: string | null;
  onEdit: () => void;
  onRevoke: () => void;
  onApprove: () => void;
  onDeny: () => void;
  onVeto: () => void;
  formatDelayLabel: (h: number) => string;
}) {
  const policy = POLICY_BADGE[grant.access_policy];
  const status = STATUS_BADGE[grant.request_status];
  const isLoading = actionLoading === grant.id;

  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2">
      {/* Top row: contact + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="bg-emerald-100 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0">
            <UserCheck className="h-3.5 w-3.5 text-emerald-700" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">
              {grant.contact_name || 'Unknown Contact'}
            </p>
            <p className="text-xs text-slate-500 truncate">{grant.contact_email || ''}</p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={onEdit} disabled={isLoading}
            className="p-1 text-slate-400 hover:text-emerald-600 rounded transition-colors disabled:opacity-50" title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onRevoke} disabled={isLoading}
            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors disabled:opacity-50" title="Revoke">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${policy.bg} ${policy.text} ${policy.border}`}>
          {grant.access_policy === 'immediate' && <Zap className="h-2.5 w-2.5" />}
          {grant.access_policy === 'time_delayed' && <Clock className="h-2.5 w-2.5" />}
          {grant.access_policy === 'approval' && <CheckCircle className="h-2.5 w-2.5" />}
          {policy.label}
          {grant.access_policy === 'time_delayed' && grant.delay_hours > 0 && (
            <span className="opacity-75">({formatDelayLabel(grant.delay_hours)})</span>
          )}
        </span>
        {grant.request_status !== 'none' && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${status.bg} ${status.text} ${status.border} ${status.pulse ? 'animate-pulse' : ''}`}>
            {status.label}
          </span>
        )}
      </div>

      {/* Instructions */}
      {grant.notes && (
        <p className="text-xs text-slate-500 flex items-start gap-1">
          <StickyNote className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span className="italic">{grant.notes}</span>
        </p>
      )}

      {/* Pending approval actions */}
      {grant.request_status === 'pending' && (
        <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-200">
          <span className="text-xs text-amber-700 font-medium flex-1">Action needed</span>
          <button onClick={onApprove} disabled={isLoading}
            className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50">
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
            Approve
          </button>
          <button onClick={onDeny} disabled={isLoading}
            className="inline-flex items-center gap-1 px-2 py-1 bg-slate-600 hover:bg-slate-700 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50">
            <ThumbsDown className="h-3 w-3" /> Deny
          </button>
          <button onClick={onVeto} disabled={isLoading}
            className="inline-flex items-center gap-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50" title="Permanently block">
            <Ban className="h-3 w-3" /> Veto
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddGrantModal — with inline contact invitation
// ---------------------------------------------------------------------------

type AddModalTab = 'select' | 'invite';

function AddGrantModal({
  lifeEventId,
  availableContacts,
  contacts,
  selectedContactId,
  selectedPolicy,
  delayHours,
  notes,
  loading,
  onSelectContact,
  onSelectPolicy,
  onChangeDelay,
  onChangeNotes,
  onSubmit,
  onClose,
  onContactCreated,
  formatDelayLabel,
}: {
  lifeEventId: string;
  availableContacts: TrustedContact[];
  contacts: TrustedContact[];
  selectedContactId: string;
  selectedPolicy: AccessPolicy;
  delayHours: number;
  notes: string;
  loading: boolean;
  onSelectContact: (id: string) => void;
  onSelectPolicy: (p: AccessPolicy) => void;
  onChangeDelay: (h: number) => void;
  onChangeNotes: (n: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  onContactCreated: () => void;
  formatDelayLabel: (h: number) => string;
}) {
  const acceptedContacts = contacts.filter((c) => c.status === 'accepted');
  const hasAcceptedContacts = acceptedContacts.length > 0;
  const hasAvailableContacts = availableContacts.length > 0;

  // Default to invite tab if no accepted contacts exist
  const [tab, setTab] = useState<AddModalTab>(hasAvailableContacts ? 'select' : 'invite');

  // Multi-contact invite form state
  interface InviteRow { email: string; name: string; relationship: string; }
  const [inviteRows, setInviteRows] = useState<InviteRow[]>([{ email: '', name: '', relationship: '' }]);
  const [inviteNotes, setInviteNotes] = useState('');
  const [invitePolicy, setInvitePolicy] = useState<AccessPolicy>('approval');
  const [inviteDelayHours, setInviteDelayHours] = useState(72);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const maxNewContacts = Math.max(0, 5 - contacts.filter((c) => c.status !== 'revoked').length);

  const updateInviteRow = (index: number, field: keyof InviteRow, value: string) => {
    setInviteRows((prev) => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
  };

  const addInviteRow = () => {
    if (inviteRows.length < maxNewContacts) {
      setInviteRows((prev) => [...prev, { email: '', name: '', relationship: '' }]);
    }
  };

  const removeInviteRow = (index: number) => {
    if (inviteRows.length > 1) {
      setInviteRows((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleInviteContacts = async () => {
    const validRows = inviteRows.filter((r) => r.email.trim() && r.name.trim());
    if (validRows.length === 0) return;

    // Check for duplicates against existing contacts
    for (const row of validRows) {
      const existing = contacts.find(
        (c) => c.contact_email.toLowerCase() === row.email.trim().toLowerCase() && (c.status === 'pending' || c.status === 'accepted')
      );
      if (existing) {
        setInviteError(
          existing.status === 'pending'
            ? `An invitation has already been sent to ${row.email}`
            : `${row.email} is already an accepted trusted contact. Use the "Select" tab to grant them access.`
        );
        return;
      }
    }

    try {
      setInviteLoading(true);
      setInviteError(null);
      let successCount = 0;
      for (const row of validRows) {
        const contact = await createContact(row.email.trim(), row.name.trim(), row.relationship.trim() || undefined);
        await createGrant(
          lifeEventId,
          contact.id,
          invitePolicy,
          invitePolicy === 'time_delayed' ? inviteDelayHours : undefined,
          inviteNotes || undefined
        );
        successCount++;
      }
      setInviteSuccess(
        successCount === 1
          ? `Invitation sent to ${validRows[0].email.trim()} with ${POLICY_BADGE[invitePolicy].label.toLowerCase()} access`
          : `${successCount} invitations sent with ${POLICY_BADGE[invitePolicy].label.toLowerCase()} access`
      );
      setInviteRows([{ email: '', name: '', relationship: '' }]);
      setInviteNotes('');
      setInvitePolicy('approval');
      setInviteDelayHours(72);
      onContactCreated();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-slate-900">Emergency Access</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setTab('select')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'select'
                ? 'text-emerald-700 border-b-2 border-emerald-600 bg-emerald-50/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            Select Existing
            {hasAvailableContacts && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                {availableContacts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('invite')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'invite'
                ? 'text-emerald-700 border-b-2 border-emerald-600 bg-emerald-50/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <UserPlus className="h-4 w-4" />
            Invite New
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* ── Tab: Select Existing ───────────────────────────────────── */}
          {tab === 'select' && (
            <>
              {!hasAvailableContacts && !hasAcceptedContacts && (
                <div className="text-center py-6">
                  <div className="bg-slate-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                    <UserPlus className="h-5 w-5 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-600 mb-1">No trusted contacts yet</p>
                  <p className="text-xs text-slate-400 mb-3">Invite someone you trust to get started.</p>
                  <button
                    onClick={() => setTab('invite')}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    <UserPlus className="h-4 w-4" />
                    Invite a Contact
                  </button>
                </div>
              )}

              {!hasAvailableContacts && hasAcceptedContacts && (
                <div className="text-center py-6">
                  <p className="text-sm text-slate-600 mb-1">All contacts already have access</p>
                  <p className="text-xs text-slate-400 mb-3">Invite another person to grant them access.</p>
                  <button
                    onClick={() => setTab('invite')}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    <UserPlus className="h-4 w-4" />
                    Invite Another Contact
                  </button>
                </div>
              )}

              {hasAvailableContacts && (
                <>
                  {/* Contact selector */}
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                      Trusted Contact
                    </label>
                    <select
                      value={selectedContactId}
                      onChange={(e) => onSelectContact(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                    >
                      <option value="">Select a contact...</option>
                      {availableContacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.display_name} ({c.contact_email})
                          {c.relationship ? ` — ${c.relationship}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Policy selector */}
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">
                      Access Policy
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <PolicyCard policy="immediate" icon={<Zap className="h-5 w-5" />}
                        title="Immediate" description="Instant access when requested"
                        selected={selectedPolicy === 'immediate'} onSelect={() => onSelectPolicy('immediate')} />
                      <PolicyCard policy="time_delayed" icon={<Clock className="h-5 w-5" />}
                        title="Time-Delayed" description="Access after a waiting period"
                        selected={selectedPolicy === 'time_delayed'} onSelect={() => onSelectPolicy('time_delayed')} />
                      <PolicyCard policy="approval" icon={<CheckCircle className="h-5 w-5" />}
                        title="Approval" description="Requires your explicit approval"
                        selected={selectedPolicy === 'approval'} onSelect={() => onSelectPolicy('approval')} />
                    </div>
                  </div>

                  {/* Delay slider */}
                  {selectedPolicy === 'time_delayed' && (
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                        Delay Period: <span className="text-emerald-600">{formatDelayLabel(delayHours)}</span>
                      </label>
                      <input type="range" min={1} max={168} value={delayHours}
                        onChange={(e) => onChangeDelay(Number(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600" />
                      <div className="flex justify-between text-xs text-slate-400 mt-1">
                        <span>1 hour</span><span>72 hours</span><span>7 days</span>
                      </div>
                    </div>
                  )}

                  {/* Instructions */}
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                      Instructions <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <textarea value={notes} onChange={(e) => onChangeNotes(e.target.value)}
                      placeholder="e.g., Only access in case of medical emergency" rows={2}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none transition-colors" />
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Tab: Invite New ────────────────────────────────────────── */}
          {tab === 'invite' && (
            <>
              {inviteSuccess && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{inviteSuccess}</span>
                  <button onClick={() => setInviteSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {inviteError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{inviteError}</span>
                  <button onClick={() => setInviteError(null)} className="ml-auto text-red-400 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <p className="text-sm text-slate-500">
                Send invitations to people you trust. They'll create a DocuIntelli account (or log in) to accept.
              </p>

              {/* Contact rows */}
              <div className="space-y-3">
                {inviteRows.map((row, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5">
                    {inviteRows.length > 1 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500">Contact {idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeInviteRow(idx)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                          title="Remove"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Email Address</label>
                      <input
                        type="email"
                        value={row.email}
                        onChange={(e) => updateInviteRow(idx, 'email', e.target.value)}
                        placeholder="contact@example.com"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Full Name</label>
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => updateInviteRow(idx, 'name', e.target.value)}
                          placeholder="e.g., Jane Smith"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Relationship <span className="text-slate-400 font-normal">(opt.)</span></label>
                        <select
                          value={row.relationship}
                          onChange={(e) => updateInviteRow(idx, 'relationship', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                        >
                          <option value="">Select...</option>
                          <option value="spouse">Spouse / Partner</option>
                          <option value="parent">Parent</option>
                          <option value="sibling">Sibling</option>
                          <option value="child">Adult Child</option>
                          <option value="attorney">Attorney</option>
                          <option value="accountant">Accountant</option>
                          <option value="business_partner">Business Partner</option>
                          <option value="friend">Friend</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}

                {inviteRows.length < maxNewContacts && (
                  <button
                    type="button"
                    onClick={addInviteRow}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add another contact
                  </button>
                )}
              </div>

              {/* Instructions (shared across all contacts) */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Instructions <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea value={inviteNotes} onChange={(e) => setInviteNotes(e.target.value)}
                  placeholder="e.g., Only access in case of medical emergency" rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none transition-colors" />
              </div>

              {/* Access Policy for invite */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Access Policy</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <PolicyCard policy="immediate" icon={<Zap className="h-5 w-5" />}
                    title="Immediate" description="Instant access when requested"
                    selected={invitePolicy === 'immediate'} onSelect={() => setInvitePolicy('immediate')} />
                  <PolicyCard policy="time_delayed" icon={<Clock className="h-5 w-5" />}
                    title="Time-Delayed" description="Access after a waiting period"
                    selected={invitePolicy === 'time_delayed'} onSelect={() => setInvitePolicy('time_delayed')} />
                  <PolicyCard policy="approval" icon={<CheckCircle className="h-5 w-5" />}
                    title="Approval" description="Requires your explicit approval"
                    selected={invitePolicy === 'approval'} onSelect={() => setInvitePolicy('approval')} />
                </div>
              </div>

              {invitePolicy === 'time_delayed' && (
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                    Delay Period: <span className="text-emerald-600">{formatDelayLabel(inviteDelayHours)}</span>
                  </label>
                  <input type="range" min={1} max={168} value={inviteDelayHours}
                    onChange={(e) => setInviteDelayHours(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600" />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>1 hour</span><span>72 hours</span><span>7 days</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
            {tab === 'invite' && inviteSuccess ? 'Done' : 'Cancel'}
          </button>

          {tab === 'select' && hasAvailableContacts && (
            <button
              onClick={onSubmit}
              disabled={!selectedContactId || loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Granting...</>
              ) : (
                <><Shield className="h-4 w-4" /> Grant Access</>
              )}
            </button>
          )}

          {tab === 'invite' && (
            <button
              onClick={handleInviteContacts}
              disabled={!inviteRows.some((r) => r.email.trim() && r.name.trim()) || inviteLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {inviteLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
              ) : (
                <><Send className="h-4 w-4" /> {inviteRows.filter((r) => r.email.trim() && r.name.trim()).length > 1 ? 'Send Invitations' : 'Send Invitation'}</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditGrantModal
// ---------------------------------------------------------------------------

function EditGrantModal({
  grant,
  editPolicy,
  editDelayHours,
  editNotes,
  loading,
  onSelectPolicy,
  onChangeDelay,
  onChangeNotes,
  onSubmit,
  onClose,
  formatDelayLabel,
}: {
  grant: EmergencyAccessGrant;
  editPolicy: AccessPolicy;
  editDelayHours: number;
  editNotes: string;
  loading: boolean;
  onSelectPolicy: (p: AccessPolicy) => void;
  onChangeDelay: (h: number) => void;
  onChangeNotes: (n: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  formatDelayLabel: (h: number) => string;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-slate-900">Edit Access Policy</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Contact info (read-only) */}
          <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <UserCheck className="h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-sm font-medium text-slate-900">{grant.contact_name || 'Unknown'}</p>
              <p className="text-xs text-slate-500">{grant.contact_email || ''}</p>
            </div>
          </div>

          {/* Policy selector */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Access Policy</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <PolicyCard policy="immediate" icon={<Zap className="h-5 w-5" />}
                title="Immediate" description="Instant access when requested"
                selected={editPolicy === 'immediate'} onSelect={() => onSelectPolicy('immediate')} />
              <PolicyCard policy="time_delayed" icon={<Clock className="h-5 w-5" />}
                title="Time-Delayed" description="Access after a waiting period"
                selected={editPolicy === 'time_delayed'} onSelect={() => onSelectPolicy('time_delayed')} />
              <PolicyCard policy="approval" icon={<CheckCircle className="h-5 w-5" />}
                title="Approval" description="Requires your explicit approval"
                selected={editPolicy === 'approval'} onSelect={() => onSelectPolicy('approval')} />
            </div>
          </div>

          {/* Delay slider */}
          {editPolicy === 'time_delayed' && (
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Delay Period: <span className="text-emerald-600">{formatDelayLabel(editDelayHours)}</span>
              </label>
              <input type="range" min={1} max={168} value={editDelayHours}
                onChange={(e) => onChangeDelay(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600" />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>1 hour</span><span>72 hours</span><span>7 days</span>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
              Instructions <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea value={editNotes} onChange={(e) => onChangeNotes(e.target.value)}
              placeholder="e.g., Only access in case of medical emergency" rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none transition-colors" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
            Cancel
          </button>
          <button onClick={onSubmit} disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {loading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>) : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PolicyCard
// ---------------------------------------------------------------------------

function PolicyCard({
  policy,
  icon,
  title,
  description,
  selected,
  onSelect,
}: {
  policy: AccessPolicy;
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const cfg = POLICY_BADGE[policy];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-center transition-all ${
        selected
          ? `${cfg.bg} ${cfg.border} ${cfg.text} ring-1 ring-offset-1 ${
              policy === 'immediate' ? 'ring-emerald-400' : policy === 'time_delayed' ? 'ring-amber-400' : 'ring-blue-400'
            }`
          : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className={selected ? cfg.text : 'text-slate-400'}>{icon}</div>
      <span className="text-xs font-semibold">{title}</span>
      <span className="text-[10px] leading-tight opacity-75">{description}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// AuditRow
// ---------------------------------------------------------------------------

function AuditRow({
  entry,
  formatTimestamp,
}: {
  entry: AuditEntry;
  formatTimestamp: (iso: string) => string;
}) {
  const Icon = AUDIT_ICONS[entry.action] || FileText;
  const actionLabel = entry.action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex items-start gap-2.5 py-2 px-3 bg-slate-50 rounded-lg text-xs">
      <div className="bg-white border border-slate-200 rounded p-1 mt-0.5">
        <Icon className="h-3 w-3 text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-700 font-medium">{actionLabel}</p>
        <div className="flex items-center gap-2 mt-0.5 text-slate-400">
          {entry.actor_name && <span>{entry.actor_name}</span>}
          {entry.actor_name && entry.document_name && <span>--</span>}
          {entry.document_name && <span className="truncate">{entry.document_name}</span>}
        </div>
      </div>
      <span className="text-slate-400 flex-shrink-0 whitespace-nowrap">
        {formatTimestamp(entry.created_at)}
      </span>
    </div>
  );
}
