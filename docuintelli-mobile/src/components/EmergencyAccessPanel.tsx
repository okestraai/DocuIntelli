import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import {
  Shield, Plus, UserCheck, UserPlus, Clock, Zap, CheckCircle, AlertTriangle,
  Pencil, Trash2, Mail, ThumbsUp, ThumbsDown, Ban, Send, X, ChevronDown,
} from 'lucide-react-native';
import {
  getContacts, getGrantsForEvent, createGrant, createContact, revokeGrant,
  resendInvite, revokeContact, approveAccess, denyAccess,
  type TrustedContact, type EmergencyAccessGrant,
} from '../lib/emergencyAccessApi';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

interface Props {
  lifeEventId: string;
  lifeEventTitle: string;
}

type AccessPolicy = 'immediate' | 'time_delayed' | 'approval';
type ModalTab = 'select' | 'invite';

const POLICY_COLORS: Record<AccessPolicy, { bg: string; text: string; border: string }> = {
  immediate:    { bg: colors.primary[50],  text: colors.primary[700],  border: colors.primary[200] },
  time_delayed: { bg: colors.warning[50],  text: colors.warning[700],  border: colors.warning[200] },
  approval:     { bg: colors.info[50],     text: colors.info[700],     border: colors.info[200] },
};

const POLICY_LABEL: Record<AccessPolicy, string> = {
  immediate: 'Immediate', time_delayed: 'Time-Delayed', approval: 'Approval',
};

const RELATIONSHIPS = [
  { value: 'spouse', label: 'My Spouse / Partner' },
  { value: 'parent', label: 'My Parent' },
  { value: 'sibling', label: 'My Sibling' },
  { value: 'child', label: 'My Adult Child' },
  { value: 'attorney', label: 'My Attorney' },
  { value: 'accountant', label: 'My Accountant' },
  { value: 'business_partner', label: 'My Business Partner' },
  { value: 'friend', label: 'My Friend' },
];

export default function EmergencyAccessPanel({ lifeEventId }: Props) {
  const [grants, setGrants] = useState<EmergencyAccessGrant[]>([]);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState<ModalTab>('select');

  // Grant form
  const [selectedContactId, setSelectedContactId] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState<AccessPolicy>('approval');
  const [delayHours, setDelayHours] = useState(72);
  const [grantNotes, setGrantNotes] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Multi-contact invite form
  interface InvRow { email: string; name: string; relationship: string; }
  const [invRows, setInvRows] = useState<InvRow[]>([{ email: '', name: '', relationship: '' }]);
  const [invNotes, setInvNotes] = useState('');
  const [invPolicy, setInvPolicy] = useState<AccessPolicy>('approval');
  const [invDelayHours, setInvDelayHours] = useState(72);
  const [invLoading, setInvLoading] = useState(false);
  const [invSuccess, setInvSuccess] = useState<string | null>(null);
  const [invError, setInvError] = useState<string | null>(null);
  const [showRelPicker, setShowRelPicker] = useState<number | null>(null);

  const maxNewContacts = Math.max(0, 5 - contacts.filter(c => c.status !== 'revoked').length);

  const updateInvRow = (idx: number, field: keyof InvRow, value: string) => {
    setInvRows(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const addInvRow = () => {
    if (invRows.length < maxNewContacts) {
      setInvRows(prev => [...prev, { email: '', name: '', relationship: '' }]);
    }
  };

  const removeInvRow = (idx: number) => {
    if (invRows.length > 1) {
      setInvRows(prev => prev.filter((_, i) => i !== idx));
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [g, c] = await Promise.all([getGrantsForEvent(lifeEventId), getContacts()]);
      setGrants(g);
      setContacts(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [lifeEventId]);

  useEffect(() => { loadData(); }, [loadData]);

  const activeGrants = grants.filter(g => g.is_active);
  const grantedIds = new Set(activeGrants.map(g => g.trusted_contact_id));
  const availableContacts = contacts.filter(c => c.status === 'accepted' && !grantedIds.has(c.id));
  const pendingContacts = contacts.filter(c => c.status === 'pending');

  const openModal = () => {
    setTab(availableContacts.length > 0 ? 'select' : 'invite');
    setShowModal(true);
  };

  const handleCreateGrant = async () => {
    if (!selectedContactId) return;
    try {
      setCreateLoading(true);
      await createGrant(lifeEventId, selectedContactId, selectedPolicy,
        selectedPolicy === 'time_delayed' ? delayHours : undefined,
        grantNotes || undefined);
      setShowModal(false);
      resetForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleInvite = async () => {
    const validRows = invRows.filter(r => r.email.trim() && r.name.trim());
    if (validRows.length === 0) return;

    // Check for duplicates
    for (const row of validRows) {
      const existing = contacts.find(
        (c) => c.contact_email.toLowerCase() === row.email.trim().toLowerCase() && (c.status === 'pending' || c.status === 'accepted')
      );
      if (existing) {
        setInvError(
          existing.status === 'pending'
            ? `An invitation has already been sent to ${row.email}`
            : `${row.email} is already an accepted contact. Use the "Select" tab.`
        );
        return;
      }
    }

    try {
      setInvLoading(true);
      setInvError(null);
      let count = 0;
      for (const row of validRows) {
        const contact = await createContact(row.email.trim(), row.name.trim(), row.relationship || undefined);
        await createGrant(
          lifeEventId,
          contact.id,
          invPolicy,
          invPolicy === 'time_delayed' ? invDelayHours : undefined,
          invNotes || undefined
        );
        count++;
      }
      setInvSuccess(
        count === 1
          ? `Invitation sent to ${validRows[0].email.trim()} with ${POLICY_LABEL[invPolicy].toLowerCase()} access`
          : `${count} invitations sent with ${POLICY_LABEL[invPolicy].toLowerCase()} access`
      );
      setInvRows([{ email: '', name: '', relationship: '' }]);
      setInvNotes('');
      setInvPolicy('approval'); setInvDelayHours(72);
      loadData();
    } catch (err) {
      setInvError(err instanceof Error ? err.message : 'Failed to invite');
    } finally {
      setInvLoading(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      setActionLoading(id);
      await revokeGrant(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      setActionLoading(id);
      await approveAccess(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeny = async (id: string) => {
    try {
      setActionLoading(id);
      await denyAccess(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deny');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResendInvite = async (contactId: string) => {
    try {
      setActionLoading(contactId);
      await resendInvite(contactId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeContact = (contactId: string) => {
    const contact = contacts.find(c => c.id === contactId);
    const name = contact?.display_name || contact?.contact_email || 'this contact';
    Alert.alert(
      'Cancel Invitation',
      `Cancel the invitation to ${name}? They will no longer be able to accept it.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Invitation',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(contactId);
              await revokeContact(contactId);
              await loadData();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to cancel invitation');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setSelectedContactId(''); setSelectedPolicy('approval');
    setDelayHours(72); setGrantNotes('');
    setInvRows([{ email: '', name: '', relationship: '' }]);
    setInvNotes('');
    setInvPolicy('approval'); setInvDelayHours(72);
    setInvSuccess(null); setInvError(null);
  };

  return (
    <>
      {/* Section divider + header */}
      <View style={s.divider} />
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          <Shield size={16} color={colors.primary[600]} strokeWidth={2} />
          <Text style={s.headerTitle}>Emergency Access</Text>
          {activeGrants.length > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{activeGrants.length}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openModal} activeOpacity={0.7}>
          <Plus size={12} color={colors.primary[600]} strokeWidth={2.5} />
          <Text style={s.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Error */}
      {error && (
        <View style={s.errorBox}>
          <AlertTriangle size={14} color={colors.error[700]} strokeWidth={2} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}><X size={14} color={colors.error[500]} /></TouchableOpacity>
        </View>
      )}

      {/* Loading */}
      {loading && (
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color={colors.slate[400]} />
        </View>
      )}

      {/* Empty */}
      {!loading && activeGrants.length === 0 && pendingContacts.length === 0 && (
        <View style={s.emptyBox}>
          <View style={s.emptyIconCircle}>
            <Shield size={16} color={colors.slate[400]} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.emptyTitle}>No emergency contacts</Text>
            <Text style={s.emptyDesc}>Designate trusted people who can access documents in this life event.</Text>
          </View>
        </View>
      )}

      {/* Grant cards */}
      {!loading && activeGrants.map(grant => {
        const pcfg = POLICY_COLORS[grant.access_policy];
        const isLoading = actionLoading === grant.id;
        return (
          <View key={grant.id} style={s.grantCard}>
            <View style={s.grantTop}>
              <View style={s.grantContactRow}>
                <View style={s.contactAvatar}>
                  <UserCheck size={14} color={colors.primary[700]} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.contactName} numberOfLines={1}>{grant.contact_name || 'Unknown'}</Text>
                  <Text style={s.contactEmail} numberOfLines={1}>{grant.contact_email || ''}</Text>
                </View>
                <TouchableOpacity onPress={() => handleRevoke(grant.id)} disabled={isLoading} style={s.iconBtn}>
                  <Trash2 size={14} color={colors.slate[400]} strokeWidth={2} />
                </TouchableOpacity>
              </View>
              <View style={s.badgeRow}>
                <View style={[s.policyBadge, { backgroundColor: pcfg.bg, borderColor: pcfg.border }]}>
                  {grant.access_policy === 'immediate' && <Zap size={10} color={pcfg.text} />}
                  {grant.access_policy === 'time_delayed' && <Clock size={10} color={pcfg.text} />}
                  {grant.access_policy === 'approval' && <CheckCircle size={10} color={pcfg.text} />}
                  <Text style={[s.policyBadgeText, { color: pcfg.text }]}>{POLICY_LABEL[grant.access_policy]}</Text>
                </View>
                {grant.request_status === 'pending' && (
                  <View style={[s.policyBadge, { backgroundColor: colors.warning[50], borderColor: colors.warning[200] }]}>
                    <Text style={[s.policyBadgeText, { color: colors.warning[700] }]}>Pending</Text>
                  </View>
                )}
                {(grant.request_status === 'approved' || grant.request_status === 'auto_granted') && (
                  <View style={[s.policyBadge, { backgroundColor: colors.primary[50], borderColor: colors.primary[200] }]}>
                    <Text style={[s.policyBadgeText, { color: colors.primary[700] }]}>
                      {grant.request_status === 'approved' ? 'Approved' : 'Auto-Granted'}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Instructions */}
            {grant.notes ? (
              <View style={s.instructionsBox}>
                <Text style={s.instructionsText}>{grant.notes}</Text>
              </View>
            ) : null}

            {/* Pending actions */}
            {grant.request_status === 'pending' && (
              <View style={s.pendingActions}>
                <Text style={s.pendingLabel}>Action needed</Text>
                <View style={s.pendingBtns}>
                  <TouchableOpacity style={s.approveBtn} onPress={() => handleApprove(grant.id)} disabled={isLoading}>
                    <ThumbsUp size={12} color={colors.white} /><Text style={s.actionBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.denyBtn} onPress={() => handleDeny(grant.id)} disabled={isLoading}>
                    <ThumbsDown size={12} color={colors.white} /><Text style={s.actionBtnText}>Deny</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        );
      })}

      {/* Pending invitations */}
      {!loading && pendingContacts.length > 0 && (
        <View style={s.pendingSection}>
          <Text style={s.pendingSectionLabel}>Pending Invitations</Text>
          {pendingContacts.map(contact => {
            const isLoading = actionLoading === contact.id;
            return (
              <View key={contact.id} style={s.pendingCard}>
                <View style={s.pendingCardLeft}>
                  <View style={s.pendingAvatar}>
                    <Mail size={12} color={colors.warning[600]} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pendingName} numberOfLines={1}>{contact.display_name}</Text>
                    <Text style={s.pendingEmail} numberOfLines={1}>{contact.contact_email}</Text>
                  </View>
                </View>
                <View style={s.pendingCardActions}>
                  <TouchableOpacity
                    style={s.resendBtn}
                    onPress={() => handleResendInvite(contact.id)}
                    disabled={isLoading}
                    activeOpacity={0.7}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color={colors.primary[600]} />
                    ) : (
                      <>
                        <Send size={11} color={colors.primary[600]} strokeWidth={2} />
                        <Text style={s.resendBtnText}>Resend</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.cancelInvBtn}
                    onPress={() => handleRevokeContact(contact.id)}
                    disabled={isLoading}
                    activeOpacity={0.7}
                  >
                    <X size={14} color={colors.slate[400]} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Add / Invite Modal */}
      <Modal visible={showModal} onClose={() => { setShowModal(false); resetForm(); }} title="Emergency Access">
        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
          {/* Tabs */}
          <View style={s.tabs}>
            <TouchableOpacity
              style={[s.tabBtn, tab === 'select' && s.tabBtnActive]}
              onPress={() => setTab('select')} activeOpacity={0.7}
            >
              <UserCheck size={14} color={tab === 'select' ? colors.primary[700] : colors.slate[500]} />
              <Text style={[s.tabText, tab === 'select' && s.tabTextActive]}>Select</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tabBtn, tab === 'invite' && s.tabBtnActive]}
              onPress={() => setTab('invite')} activeOpacity={0.7}
            >
              <UserPlus size={14} color={tab === 'invite' ? colors.primary[700] : colors.slate[500]} />
              <Text style={[s.tabText, tab === 'invite' && s.tabTextActive]}>Invite New</Text>
            </TouchableOpacity>
          </View>

          {/* Select tab */}
          {tab === 'select' && (
            <View style={s.tabContent}>
              {availableContacts.length === 0 ? (
                <View style={s.noContacts}>
                  <Text style={s.noContactsText}>
                    {contacts.filter(c => c.status === 'accepted').length === 0
                      ? 'No trusted contacts yet. Invite someone to get started.'
                      : 'All contacts already have access.'}
                  </Text>
                  <TouchableOpacity onPress={() => setTab('invite')}>
                    <Text style={s.switchTabLink}>Invite a Contact</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={s.label}>Trusted Contact</Text>
                  {availableContacts.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      style={[s.contactOption, selectedContactId === c.id && s.contactOptionActive]}
                      onPress={() => setSelectedContactId(c.id)} activeOpacity={0.7}
                    >
                      <View style={[s.radio, selectedContactId === c.id && s.radioActive]}>
                        {selectedContactId === c.id && <View style={s.radioDot} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.contactOptName}>{c.display_name}</Text>
                        <Text style={s.contactOptEmail}>{c.contact_email}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}

                  <Text style={[s.label, { marginTop: spacing.lg }]}>Access Policy</Text>
                  <View style={s.policyRow}>
                    {(['immediate', 'time_delayed', 'approval'] as AccessPolicy[]).map(p => (
                      <TouchableOpacity
                        key={p}
                        style={[s.policyOption, selectedPolicy === p && {
                          backgroundColor: POLICY_COLORS[p].bg,
                          borderColor: POLICY_COLORS[p].border,
                        }]}
                        onPress={() => setSelectedPolicy(p)} activeOpacity={0.7}
                      >
                        {p === 'immediate' && <Zap size={16} color={selectedPolicy === p ? POLICY_COLORS[p].text : colors.slate[400]} />}
                        {p === 'time_delayed' && <Clock size={16} color={selectedPolicy === p ? POLICY_COLORS[p].text : colors.slate[400]} />}
                        {p === 'approval' && <CheckCircle size={16} color={selectedPolicy === p ? POLICY_COLORS[p].text : colors.slate[400]} />}
                        <Text style={[s.policyOptLabel, selectedPolicy === p && { color: POLICY_COLORS[p].text }]}>
                          {POLICY_LABEL[p]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[s.label, { marginTop: spacing.lg }]}>Instructions <Text style={{ color: colors.slate[400], fontWeight: typography.fontWeight.normal }}>(optional)</Text></Text>
                  <TextInput
                    style={[s.input, { height: 60, textAlignVertical: 'top' }]}
                    value={grantNotes}
                    onChangeText={setGrantNotes}
                    placeholder="e.g., Only access in case of medical emergency"
                    placeholderTextColor={colors.slate[400]}
                    multiline
                    numberOfLines={2}
                  />

                  <View style={{ marginTop: spacing.sm }}>
                    <Button
                      title={createLoading ? 'Granting...' : 'Grant Access'}
                      onPress={handleCreateGrant}
                      loading={createLoading}
                      disabled={!selectedContactId || createLoading}
                      icon={<Shield size={14} color={colors.white} />}
                    />
                  </View>
                </>
              )}
            </View>
          )}

          {/* Invite tab */}
          {tab === 'invite' && (
            <View style={s.tabContent}>
              {invSuccess && (
                <View style={s.successBox}>
                  <CheckCircle size={14} color={colors.primary[700]} />
                  <Text style={s.successText}>{invSuccess}</Text>
                </View>
              )}
              {invError && (
                <View style={s.invErrorBox}>
                  <AlertTriangle size={14} color={colors.error[700]} />
                  <Text style={s.invErrorText}>{invError}</Text>
                </View>
              )}

              <Text style={s.invHint}>Send invitations to people you trust. They'll create a DocuIntelli account to accept.</Text>

              {/* Contact rows */}
              {invRows.map((row, idx) => (
                <View key={idx} style={s.invRowCard}>
                  {invRows.length > 1 && (
                    <View style={s.invRowHeader}>
                      <Text style={s.invRowLabel}>Contact {idx + 1}</Text>
                      <TouchableOpacity onPress={() => removeInvRow(idx)}>
                        <X size={14} color={colors.slate[400]} />
                      </TouchableOpacity>
                    </View>
                  )}
                  <Text style={s.label}>Email Address</Text>
                  <TextInput
                    style={s.input}
                    value={row.email}
                    onChangeText={(v) => updateInvRow(idx, 'email', v)}
                    placeholder="contact@example.com"
                    placeholderTextColor={colors.slate[400]}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <Text style={s.label}>Full Name</Text>
                  <TextInput
                    style={s.input}
                    value={row.name}
                    onChangeText={(v) => updateInvRow(idx, 'name', v)}
                    placeholder="e.g., Jane Smith"
                    placeholderTextColor={colors.slate[400]}
                  />
                  <Text style={s.label}>Relationship <Text style={{ color: colors.slate[400], fontWeight: typography.fontWeight.normal }}>(opt.)</Text></Text>
                  <TouchableOpacity style={s.input} onPress={() => setShowRelPicker(showRelPicker === idx ? null : idx)} activeOpacity={0.7}>
                    <View style={s.selectRow}>
                      <Text style={row.relationship ? s.selectText : s.selectPlaceholder}>
                        {row.relationship ? RELATIONSHIPS.find(r => r.value === row.relationship)?.label || row.relationship : 'Select...'}
                      </Text>
                      <ChevronDown size={16} color={colors.slate[400]} />
                    </View>
                  </TouchableOpacity>
                  {showRelPicker === idx && (
                    <View style={s.relOptions}>
                      {RELATIONSHIPS.map(r => (
                        <TouchableOpacity
                          key={r.value}
                          style={[s.relOption, row.relationship === r.value && s.relOptionActive]}
                          onPress={() => { updateInvRow(idx, 'relationship', r.value); setShowRelPicker(null); }}
                        >
                          <Text style={[s.relOptionText, row.relationship === r.value && s.relOptionTextActive]}>{r.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ))}

              {invRows.length < maxNewContacts && (
                <TouchableOpacity style={s.addAnotherBtn} onPress={addInvRow} activeOpacity={0.7}>
                  <Plus size={14} color={colors.primary[600]} strokeWidth={2} />
                  <Text style={s.addAnotherText}>Add another contact</Text>
                </TouchableOpacity>
              )}

              {/* Instructions (shared) */}
              <Text style={[s.label, { marginTop: spacing.sm }]}>Instructions <Text style={{ color: colors.slate[400], fontWeight: typography.fontWeight.normal }}>(optional)</Text></Text>
              <TextInput
                style={[s.input, { height: 60, textAlignVertical: 'top' }]}
                value={invNotes}
                onChangeText={setInvNotes}
                placeholder="e.g., Only access in case of medical emergency"
                placeholderTextColor={colors.slate[400]}
                multiline
                numberOfLines={2}
              />

              {/* Access Policy */}
              <Text style={[s.label, { marginTop: spacing.sm }]}>Access Policy</Text>
              <View style={s.policyRow}>
                {(['immediate', 'time_delayed', 'approval'] as AccessPolicy[]).map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[s.policyOption, invPolicy === p && {
                      backgroundColor: POLICY_COLORS[p].bg,
                      borderColor: POLICY_COLORS[p].border,
                    }]}
                    onPress={() => setInvPolicy(p)} activeOpacity={0.7}
                  >
                    {p === 'immediate' && <Zap size={16} color={invPolicy === p ? POLICY_COLORS[p].text : colors.slate[400]} />}
                    {p === 'time_delayed' && <Clock size={16} color={invPolicy === p ? POLICY_COLORS[p].text : colors.slate[400]} />}
                    {p === 'approval' && <CheckCircle size={16} color={invPolicy === p ? POLICY_COLORS[p].text : colors.slate[400]} />}
                    <Text style={[s.policyOptLabel, invPolicy === p && { color: POLICY_COLORS[p].text }]}>
                      {POLICY_LABEL[p]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ marginTop: spacing.lg }}>
                <Button
                  title={invLoading ? 'Sending...' : invRows.filter(r => r.email.trim() && r.name.trim()).length > 1 ? 'Send Invitations' : 'Send Invitation'}
                  onPress={handleInvite}
                  loading={invLoading}
                  disabled={!invRows.some(r => r.email.trim() && r.name.trim()) || invLoading}
                  icon={<Send size={14} color={colors.white} />}
                />
              </View>
            </View>
          )}
        </ScrollView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: colors.slate[200],
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[700],
  },
  badge: {
    backgroundColor: colors.primary[100],
    borderRadius: borderRadius.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[700],
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  addBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[600],
  },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[200],
    borderRadius: borderRadius.md,
  },
  errorText: { fontSize: typography.fontSize.xs, color: colors.error[700], flex: 1 },

  // Loading
  loadingRow: { alignItems: 'center', paddingVertical: spacing.lg },

  // Empty
  emptyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.slate[50],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.slate[200],
  },
  emptyIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: typography.fontSize.sm, color: colors.slate[600], fontWeight: typography.fontWeight.medium },
  emptyDesc: { fontSize: typography.fontSize.xs, color: colors.slate[400], marginTop: 2 },

  // Grant card
  grantCard: {
    backgroundColor: colors.slate[50],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.slate[200],
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  grantTop: { gap: spacing.sm },
  grantContactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  contactAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactName: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.slate[900] },
  contactEmail: { fontSize: 11, color: colors.slate[500] },
  iconBtn: { padding: 4 },
  badgeRow: { flexDirection: 'row', gap: spacing.xs },
  policyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  policyBadgeText: { fontSize: 11, fontWeight: typography.fontWeight.medium },

  // Pending actions
  pendingActions: {
    borderTopWidth: 1,
    borderTopColor: colors.slate[200],
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  pendingLabel: { fontSize: typography.fontSize.xs, color: colors.warning[700], fontWeight: typography.fontWeight.medium },
  pendingBtns: { flexDirection: 'row', gap: spacing.xs },
  approveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    backgroundColor: colors.primary[600], borderRadius: borderRadius.md,
  },
  denyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    backgroundColor: colors.slate[600], borderRadius: borderRadius.md,
  },
  actionBtnText: { fontSize: typography.fontSize.xs, color: colors.white, fontWeight: typography.fontWeight.medium },

  // Pending invitations section
  pendingSection: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  pendingSectionLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[400],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm + 2,
    backgroundColor: colors.warning[50],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.warning[100],
  },
  pendingCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  pendingAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.warning[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
  },
  pendingEmail: {
    fontSize: 11,
    color: colors.slate[500],
  },
  pendingCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  resendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  resendBtnText: {
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[600],
  },
  cancelInvBtn: {
    padding: 4,
  },

  // Modal tabs
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[200],
    marginBottom: spacing.lg,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  tabBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary[600],
  },
  tabText: { fontSize: typography.fontSize.sm, color: colors.slate[500], fontWeight: typography.fontWeight.medium },
  tabTextActive: { color: colors.primary[700], fontWeight: typography.fontWeight.semibold },
  tabContent: { gap: spacing.md },

  // Select tab
  noContacts: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  noContactsText: { fontSize: typography.fontSize.sm, color: colors.slate[600], textAlign: 'center' },
  switchTabLink: { fontSize: typography.fontSize.sm, color: colors.primary[600], fontWeight: typography.fontWeight.semibold },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
    marginBottom: spacing.xs,
  },
  contactOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    marginBottom: spacing.xs,
  },
  contactOptionActive: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[400],
  },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.slate[300],
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary[600] },
  radioDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.primary[600],
  },
  contactOptName: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.slate[900] },
  contactOptEmail: { fontSize: 11, color: colors.slate[500] },
  policyRow: { flexDirection: 'row', gap: spacing.xs },
  policyOption: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  policyOptLabel: {
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[500],
  },

  // Instructions on grant cards
  instructionsBox: {
    backgroundColor: colors.info[50],
    borderWidth: 1,
    borderColor: colors.info[200],
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  instructionsText: {
    fontSize: 11,
    color: colors.info[700],
    fontStyle: 'italic',
  },

  // Multi-contact invite row
  invRowCard: {
    backgroundColor: colors.slate[50],
    borderWidth: 1,
    borderColor: colors.slate[200],
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  invRowHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: spacing.sm,
  },
  invRowLabel: {
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[500],
  },
  addAnotherBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  addAnotherText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[600],
  },

  // Invite tab
  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, backgroundColor: colors.primary[50],
    borderWidth: 1, borderColor: colors.primary[200], borderRadius: borderRadius.md,
  },
  successText: { fontSize: typography.fontSize.sm, color: colors.primary[700], flex: 1 },
  invErrorBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, backgroundColor: colors.error[50],
    borderWidth: 1, borderColor: colors.error[200], borderRadius: borderRadius.md,
  },
  invErrorText: { fontSize: typography.fontSize.sm, color: colors.error[700], flex: 1 },
  invHint: { fontSize: typography.fontSize.sm, color: colors.slate[500], marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.slate[300],
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.sm,
    color: colors.slate[900],
    backgroundColor: colors.white,
    marginBottom: spacing.sm,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: { fontSize: typography.fontSize.sm, color: colors.slate[900] },
  selectPlaceholder: { fontSize: typography.fontSize.sm, color: colors.slate[400] },
  relOptions: {
    borderWidth: 1,
    borderColor: colors.slate[200],
    borderRadius: borderRadius.lg,
    backgroundColor: colors.white,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  relOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
  },
  relOptionActive: { backgroundColor: colors.primary[50] },
  relOptionText: { fontSize: typography.fontSize.sm, color: colors.slate[700] },
  relOptionTextActive: { color: colors.primary[700], fontWeight: typography.fontWeight.semibold },
});
