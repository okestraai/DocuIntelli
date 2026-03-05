import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  UserPlus,
  Mail,
  Send,
  XCircle,
  CheckCircle2,
  Clock,
  Users,
  AlertTriangle,
  Loader2,
  ChevronDown,
  Lock,
  Crown,
} from 'lucide-react';
import {
  getContacts,
  createContact,
  resendInvite,
  revokeContact,
  type TrustedContact,
} from '../lib/emergencyAccessApi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONTACTS = 5;

const RELATIONSHIP_OPTIONS = [
  'My Spouse',
  'My Parent',
  'My Sibling',
  'My Adult Child',
  'My Attorney',
  'My Accountant',
  'My Business Partner',
  'My Friend',
  'Other',
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TrustedContactsSettingsProps {
  currentPlan?: 'free' | 'starter' | 'pro';
}

// ---------------------------------------------------------------------------
// Inline feedback message (auto-dismiss)
// ---------------------------------------------------------------------------

interface InlineMessage {
  type: 'success' | 'error';
  text: string;
}

function InlineFeedback({ message, onDismiss }: { message: InlineMessage; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const styles =
    message.type === 'success'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
      : 'bg-red-50 border-red-200 text-red-800';

  const Icon = message.type === 'success' ? CheckCircle2 : AlertTriangle;

  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm ${styles}`}>
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span>{message.text}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: TrustedContact['status'] }) {
  const config = {
    pending: { label: 'Pending', bg: 'bg-amber-100', text: 'text-amber-800', icon: Clock },
    accepted: { label: 'Accepted', bg: 'bg-emerald-100', text: 'text-emerald-800', icon: CheckCircle2 },
    revoked: { label: 'Revoked', bg: 'bg-gray-100', text: 'text-gray-500', icon: XCircle },
  }[status];

  const StatusIcon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
    >
      <StatusIcon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Confirmation dialog (scoped to this component)
// ---------------------------------------------------------------------------

function RevokeConfirmDialog({
  contactName,
  isLoading,
  onConfirm,
  onCancel,
}: {
  contactName: string;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-red-100 w-10 h-10 rounded-full flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Revoke Access</h3>
        </div>

        <p className="text-gray-700 mb-6">
          Revoking <span className="font-semibold">{contactName}</span> will remove their access to
          all shared life events. This cannot be undone.
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Revoking...
              </>
            ) : (
              'Revoke Contact'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add contact form
// ---------------------------------------------------------------------------

function AddContactForm({
  existingEmails,
  contactCount,
  onSubmit,
  onCancel,
  onDone,
}: {
  existingEmails: string[];
  contactCount: number;
  onSubmit: (email: string, displayName: string, relationship?: string) => Promise<void>;
  onCancel: () => void;
  onDone?: (count: number) => void;
}) {
  interface ContactRow { email: string; displayName: string; relationship: string; }
  const [rows, setRows] = useState<ContactRow[]>([{ email: '', displayName: '', relationship: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const maxRows = Math.max(0, MAX_CONTACTS - contactCount);

  const updateRow = (index: number, field: keyof ContactRow, value: string) => {
    setRows((prev) => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
  };

  const addRow = () => {
    if (rows.length < maxRows) {
      setRows((prev) => [...prev, { email: '', displayName: '', relationship: '' }]);
    }
  };

  const removeRow = (index: number) => {
    if (rows.length > 1) {
      setRows((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const validate = (): string | null => {
    const validRows = rows.filter((r) => r.email.trim() || r.displayName.trim());
    if (validRows.length === 0) return 'At least one contact is required.';
    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      const label = validRows.length > 1 ? ` (contact ${i + 1})` : '';
      if (!r.email.trim()) return `Email is required${label}.`;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) return `Please enter a valid email address${label}.`;
      if (!r.displayName.trim()) return `Full name is required${label}.`;
      if (existingEmails.includes(r.email.trim().toLowerCase())) return `${r.email} has already been invited.`;
    }
    if (contactCount + validRows.length > MAX_CONTACTS) return `This would exceed the maximum of ${MAX_CONTACTS} trusted contacts.`;
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const validRows = rows.filter((r) => r.email.trim() && r.displayName.trim());
    setError(null);
    setSubmitting(true);
    try {
      for (const row of validRows) {
        await onSubmit(row.email.trim(), row.displayName.trim(), row.relationship || undefined);
      }
      onDone?.(validRows.length);
    } catch (err: any) {
      setError(err.message || 'Failed to invite contact.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
      <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-emerald-600" />
        Invite Trusted Contact{rows.length > 1 ? 's' : ''}
      </h4>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-3">
        {rows.map((row, idx) => (
          <div key={idx} className={`${rows.length > 1 ? 'bg-white border border-slate-200 rounded-lg p-3' : ''} space-y-3`}>
            {rows.length > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Contact {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                  title="Remove"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Email */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    value={row.email}
                    onChange={(e) => updateRow(idx, 'email', e.target.value)}
                    placeholder="contact@example.com"
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* Full name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Full name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={row.displayName}
                  onChange={(e) => updateRow(idx, 'displayName', e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  disabled={submitting}
                />
              </div>

              {/* Relationship */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Relationship <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <select
                    value={row.relationship}
                    onChange={(e) => updateRow(idx, 'relationship', e.target.value)}
                    className="w-full appearance-none px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 pr-8"
                    disabled={submitting}
                  >
                    <option value="">Select (optional)</option>
                    {RELATIONSHIP_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        ))}

        {rows.length < maxRows && (
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add another contact
          </button>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending {rows.filter((r) => r.email.trim() && r.displayName.trim()).length > 1 ? 'Invites' : 'Invite'}...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Send {rows.filter((r) => r.email.trim() && r.displayName.trim()).length > 1 ? 'Invites' : 'Invite'}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Contact card
// ---------------------------------------------------------------------------

function ContactCard({
  contact,
  onResend,
  onRevoke,
  resendingId,
}: {
  contact: TrustedContact;
  onResend: (id: string) => void;
  onRevoke: (contact: TrustedContact) => void;
  resendingId: string | null;
}) {
  const isResending = resendingId === contact.id;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:shadow-sm transition-shadow">
      {/* Avatar / icon */}
      <div className="flex-shrink-0">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
            contact.status === 'revoked'
              ? 'bg-gray-100 text-gray-400'
              : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {contact.display_name
            .split(' ')
            .map((w) => w[0])
            .slice(0, 2)
            .join('')
            .toUpperCase()}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900 text-sm truncate">{contact.display_name}</span>
          <StatusBadge status={contact.status} />
        </div>
        <p className="text-xs text-slate-500 truncate mt-0.5">{contact.contact_email}</p>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          {contact.relationship && (
            <span className="text-xs text-slate-500">{contact.relationship}</span>
          )}
          {typeof contact.grant_count === 'number' && contact.grant_count > 0 && (
            <span className="text-xs text-slate-500">
              Access to {contact.grant_count} event{contact.grant_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {contact.status === 'pending' && (
          <button
            onClick={() => onResend(contact.id)}
            disabled={isResending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors disabled:opacity-50"
            title="Resend invitation email"
          >
            {isResending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Resend
          </button>
        )}
        {contact.status !== 'revoked' && (
          <button
            onClick={() => onRevoke(contact)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
            title="Revoke access"
          >
            <XCircle className="h-3.5 w-3.5" />
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 rounded-2xl mb-4">
        <Users className="h-7 w-7 text-emerald-600" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">No Trusted Contacts Yet</h3>
      <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
        Trusted contacts are people you designate to access important documents and life-event
        information in case of an emergency. They will only see what you explicitly share with them.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold shadow-md hover:shadow-lg transition-all"
      >
        <UserPlus className="h-4 w-4" />
        Add Your First Contact
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pro gate (locked state)
// ---------------------------------------------------------------------------

function LockedState() {
  return (
    <div className="text-center py-10 px-4">
      <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl mb-4">
        <Lock className="h-7 w-7 text-emerald-600" />
      </div>
      <div className="flex items-center justify-center mb-3">
        <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs px-2.5 py-1 rounded-full">
          <Crown className="h-3 w-3" />
          Pro Feature
        </span>
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-1">Trusted Contacts</h3>
      <p className="text-sm text-slate-600 max-w-sm mx-auto mb-5">
        Designate up to 5 trusted contacts who can access your critical documents and life-event
        information in an emergency. Upgrade to Pro to unlock this feature.
      </p>
      <button
        onClick={() => {
          // Navigate to billing/upgrade. This is a settings section so we dispatch a
          // custom event that the parent settings page can listen for.
          window.dispatchEvent(new CustomEvent('navigate', { detail: 'billing' }));
        }}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all"
      >
        <Lock className="h-4 w-4" />
        Upgrade to Pro
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Limits progress indicator
// ---------------------------------------------------------------------------

function LimitsDisplay({ count }: { count: number }) {
  const pct = Math.min((count / MAX_CONTACTS) * 100, 100);

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
        {count} of {MAX_CONTACTS} used
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TrustedContactsSettings({ currentPlan }: TrustedContactsSettingsProps) {
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState<InlineMessage | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<TrustedContact | null>(null);
  const [revoking, setRevoking] = useState(false);

  // ---- Data fetching ----

  const loadContacts = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await getContacts();
      setContacts(data);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load contacts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentPlan === 'pro') {
      loadContacts();
    } else {
      setLoading(false);
    }
  }, [currentPlan, loadContacts]);

  // ---- Handlers ----

  const pendingAddsRef = React.useRef(0);
  const handleAddContact = async (email: string, displayName: string, relationship?: string) => {
    const newContact = await createContact(email, displayName, relationship);
    setContacts((prev) => [...prev, newContact]);
    pendingAddsRef.current++;
  };

  const handleFormDone = (count: number) => {
    setShowForm(false);
    setFeedback({
      type: 'success',
      text: count === 1
        ? 'Invitation sent successfully.'
        : `${count} invitations sent successfully.`,
    });
    pendingAddsRef.current = 0;
  };

  const handleResend = async (contactId: string) => {
    setResendingId(contactId);
    try {
      await resendInvite(contactId);
      setFeedback({ type: 'success', text: 'Invitation email resent.' });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to resend invite.' });
    } finally {
      setResendingId(null);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeContact(revokeTarget.id);
      setContacts((prev) =>
        prev.map((c) => (c.id === revokeTarget.id ? { ...c, status: 'revoked' as const } : c))
      );
      setFeedback({
        type: 'success',
        text: `${revokeTarget.display_name} has been revoked and can no longer access shared events.`,
      });
      setRevokeTarget(null);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to revoke contact.' });
    } finally {
      setRevoking(false);
    }
  };

  // ---- Derived values ----

  const activeCount = contacts.filter((c) => c.status !== 'revoked').length;
  const existingEmails = contacts
    .filter((c) => c.status !== 'revoked')
    .map((c) => c.contact_email.toLowerCase());

  // ---- Pro gate ----

  if (currentPlan !== 'pro') {
    return (
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <Shield className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-900">Trusted Contacts</h2>
        </div>
        <LockedState />
      </section>
    );
  }

  // ---- Loading state ----

  if (loading) {
    return (
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <Shield className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-900">Trusted Contacts</h2>
        </div>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 text-emerald-600 animate-spin" />
        </div>
      </section>
    );
  }

  // ---- Error state ----

  if (loadError) {
    return (
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <Shield className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-900">Trusted Contacts</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500 mb-3" />
          <p className="text-sm text-slate-700 mb-4">{loadError}</p>
          <button
            onClick={() => {
              setLoading(true);
              loadContacts();
            }}
            className="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  // ---- Main render ----

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1">
          <Shield className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-900">Trusted Contacts</h2>
        </div>
        {contacts.length > 0 && !showForm && activeCount < MAX_CONTACTS && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-semibold shadow-sm transition-all"
          >
            <UserPlus className="h-4 w-4" />
            Add Contact
          </button>
        )}
      </div>

      <div className="p-6 space-y-5">
        {/* Limits */}
        {contacts.length > 0 && <LimitsDisplay count={activeCount} />}

        {/* Feedback */}
        {feedback && (
          <InlineFeedback message={feedback} onDismiss={() => setFeedback(null)} />
        )}

        {/* Add form */}
        {showForm && (
          <AddContactForm
            existingEmails={existingEmails}
            contactCount={activeCount}
            onSubmit={handleAddContact}
            onCancel={() => setShowForm(false)}
            onDone={handleFormDone}
          />
        )}

        {/* Empty state */}
        {contacts.length === 0 && !showForm && (
          <EmptyState onAdd={() => setShowForm(true)} />
        )}

        {/* Contact list */}
        {contacts.length > 0 && (
          <div className="space-y-3">
            {contacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onResend={handleResend}
                onRevoke={setRevokeTarget}
                resendingId={resendingId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Revoke confirmation dialog */}
      {revokeTarget && (
        <RevokeConfirmDialog
          contactName={revokeTarget.display_name}
          isLoading={revoking}
          onConfirm={handleRevokeConfirm}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </section>
  );
}
