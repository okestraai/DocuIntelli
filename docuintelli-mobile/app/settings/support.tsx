import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import {
  ArrowLeft,
  Send,
  Plus,
  MessageSquare,
  CheckCircle2,
  Clock,
} from 'lucide-react-native';

import Card from '../../src/components/ui/Card';
import Badge from '../../src/components/ui/Badge';
import LoadingSpinner from '../../src/components/ui/LoadingSpinner';
import { useToast } from '../../src/contexts/ToastContext';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius } from '../../src/theme/spacing';

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
} from '../../src/lib/supportTicketApi';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<TicketStatus, { label: string; variant: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' }> = {
  open: { label: 'Open', variant: 'success' },
  in_progress: { label: 'In Progress', variant: 'info' },
  waiting_on_user: { label: 'Awaiting Reply', variant: 'warning' },
  resolved: { label: 'Resolved', variant: 'primary' },
  closed: { label: 'Closed', variant: 'default' },
};

const PRIORITY_DOT: Record<TicketPriority, string> = {
  low: colors.slate[400],
  medium: colors.info[500],
  high: colors.warning[500],
  urgent: colors.error[500],
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  general: 'General',
  billing: 'Billing',
  technical: 'Technical',
  account: 'Account',
  feature_request: 'Feature Request',
  bug_report: 'Bug Report',
};

const CATEGORIES: TicketCategory[] = ['general', 'billing', 'technical', 'account', 'feature_request', 'bug_report'];
const PRIORITIES: TicketPriority[] = ['low', 'medium', 'high', 'urgent'];

type ViewMode = 'list' | 'new' | 'detail';

// ─── Component ───────────────────────────────────────────────────────────────

export default function SupportScreen() {
  const { showToast } = useToast();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Detail state
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  // New ticket form
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory>('general');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [submitting, setSubmitting] = useState(false);

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getMyTickets();
      setTickets(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load tickets', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTickets();
    setRefreshing(false);
  };

  const openDetail = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setViewMode('detail');
    setMessagesLoading(true);
    try {
      const msgs = await getTicketMessages(ticket.id);
      setMessages(msgs);
      markTicketSeen(ticket.id).catch(() => {});
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, has_unread: false } : t));
    } catch {
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setReplying(true);
    try {
      const msg = await replyToTicket(selectedTicket.id, replyText.trim());
      setMessages(prev => [...prev, msg]);
      setReplyText('');
      showToast('Reply sent', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to send reply', 'error');
    } finally {
      setReplying(false);
    }
  };

  const handleCreate = async () => {
    if (!subject.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      await createTicket(subject.trim(), description.trim(), category, priority);
      showToast('Ticket created successfully', 'success');
      setViewMode('list');
      setSubject('');
      setDescription('');
      setCategory('general');
      setPriority('medium');
      loadTickets();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create ticket', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    setViewMode('list');
    setSelectedTicket(null);
    setMessages([]);
    setReplyText('');
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatDateTime(dateStr: string) {
    return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function formatResolution(hours: number) {
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    if (hours < 24) return `${hours} hrs`;
    return `${(hours / 24).toFixed(1)} days`;
  }

  // ─── Detail View ───────────────────────────────────────────────────────────

  if (viewMode === 'detail' && selectedTicket) {
    const canReply = !['closed', 'resolved'].includes(selectedTicket.status);
    const statusCfg = STATUS_BADGE[selectedTicket.status];

    return (
      <>
        <Stack.Screen options={{ title: selectedTicket.ticket_number, headerShown: true }} />
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
            <ScrollView contentContainerStyle={styles.scroll}>
              {/* Ticket header card */}
              <Card style={styles.card}>
                <View style={styles.headerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ticketNumber}>{selectedTicket.ticket_number}</Text>
                    <Text style={styles.ticketSubject}>{selectedTicket.subject}</Text>
                  </View>
                  <Badge label={statusCfg.label} variant={statusCfg.variant} />
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <View style={[styles.priorityDot, { backgroundColor: PRIORITY_DOT[selectedTicket.priority] }]} />
                    <Text style={styles.metaText}>{PRIORITY_LABELS[selectedTicket.priority]}</Text>
                  </View>
                  <Text style={styles.metaText}>{CATEGORY_LABELS[selectedTicket.category]}</Text>
                  <Text style={styles.metaText}>{formatDate(selectedTicket.created_at)}</Text>
                </View>

                {selectedTicket.resolution_hours != null && (
                  <View style={[styles.metaRow, { marginTop: spacing.xs }]}>
                    <View style={styles.metaItem}>
                      <CheckCircle2 size={12} color={colors.success[600]} />
                      <Text style={[styles.metaText, { color: colors.success[600] }]}>
                        Resolved in {formatResolution(selectedTicket.resolution_hours)}
                      </Text>
                    </View>
                  </View>
                )}

                <Text style={styles.descriptionText}>{selectedTicket.description}</Text>
              </Card>

              {/* Messages */}
              <Card style={styles.card}>
                <View style={styles.sectionHeader}>
                  <MessageSquare size={16} color={colors.slate[500]} />
                  <Text style={styles.sectionTitle}>Conversation</Text>
                </View>

                {messagesLoading ? (
                  <LoadingSpinner />
                ) : messages.length === 0 ? (
                  <Text style={styles.emptyText}>No messages yet. The support team will respond shortly.</Text>
                ) : (
                  messages.map(msg => (
                    <View
                      key={msg.id}
                      style={[
                        styles.msgBubble,
                        msg.is_admin ? styles.msgAdmin : styles.msgUser,
                      ]}
                    >
                      <View style={styles.msgHeader}>
                        <Text style={[styles.msgSender, msg.is_admin ? styles.msgSenderAdmin : styles.msgSenderUser]}>
                          {msg.is_admin ? (msg.sender_name || 'Support Team') : 'You'}
                        </Text>
                        <Text style={styles.msgTime}>{formatDateTime(msg.created_at)}</Text>
                      </View>
                      <Text style={styles.msgBody}>{msg.body}</Text>
                    </View>
                  ))
                )}
              </Card>
            </ScrollView>

            {/* Reply input */}
            {canReply && (
              <View style={styles.replyBar}>
                <TextInput
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder="Type your reply..."
                  placeholderTextColor={colors.slate[400]}
                  style={styles.replyInput}
                  multiline
                />
                <TouchableOpacity
                  onPress={handleReply}
                  disabled={!replyText.trim() || replying}
                  style={[styles.sendBtn, (!replyText.trim() || replying) && styles.sendBtnDisabled]}
                >
                  <Send size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
            {!canReply && (
              <View style={styles.closedBar}>
                <Text style={styles.closedText}>This ticket has been {selectedTicket.status.replace('_', ' ')}.</Text>
              </View>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </>
    );
  }

  // ─── New Ticket Form ───────────────────────────────────────────────────────

  if (viewMode === 'new') {
    return (
      <>
        <Stack.Screen options={{ title: 'New Ticket', headerShown: true }} />
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
            <ScrollView contentContainerStyle={styles.scroll}>
              <Card style={styles.card}>
                <Text style={styles.formLabel}>Subject</Text>
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="Brief summary of your issue"
                  placeholderTextColor={colors.slate[400]}
                  maxLength={200}
                  style={styles.textInput}
                />

                <Text style={[styles.formLabel, { marginTop: spacing.lg }]}>Description</Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe your issue in detail..."
                  placeholderTextColor={colors.slate[400]}
                  maxLength={5000}
                  multiline
                  numberOfLines={5}
                  style={[styles.textInput, styles.textArea]}
                  textAlignVertical="top"
                />
                <Text style={styles.charCount}>{description.length}/5000</Text>

                <Text style={[styles.formLabel, { marginTop: spacing.lg }]}>Category</Text>
                <View style={styles.chipRow}>
                  {CATEGORIES.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setCategory(c)}
                      style={[styles.chip, category === c && styles.chipSelected]}
                    >
                      <Text style={[styles.chipText, category === c && styles.chipTextSelected]}>
                        {CATEGORY_LABELS[c]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.formLabel, { marginTop: spacing.lg }]}>Priority</Text>
                <View style={styles.chipRow}>
                  {PRIORITIES.map(p => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setPriority(p)}
                      style={[styles.chip, priority === p && styles.chipSelected]}
                    >
                      <View style={[styles.priorityDot, { backgroundColor: PRIORITY_DOT[p] }]} />
                      <Text style={[styles.chipText, priority === p && styles.chipTextSelected]}>
                        {PRIORITY_LABELS[p]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.formActions}>
                  <TouchableOpacity
                    onPress={handleCreate}
                    disabled={!subject.trim() || !description.trim() || submitting}
                    style={[styles.primaryBtn, (!subject.trim() || !description.trim() || submitting) && styles.primaryBtnDisabled]}
                  >
                    {submitting ? (
                      <LoadingSpinner size="small" color="#fff" />
                    ) : (
                      <Send size={16} color="#fff" />
                    )}
                    <Text style={styles.primaryBtnText}>Submit Ticket</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={goBack} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </>
    );
  }

  // ─── Ticket List View ──────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ title: 'Support Tickets', headerShown: true }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[600]} />}
        >
          {/* New ticket button */}
          <TouchableOpacity
            onPress={() => setViewMode('new')}
            style={styles.newTicketBtn}
          >
            <Plus size={18} color="#fff" />
            <Text style={styles.newTicketBtnText}>New Ticket</Text>
          </TouchableOpacity>

          {loading ? (
            <View style={styles.centered}>
              <LoadingSpinner />
            </View>
          ) : tickets.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No tickets yet</Text>
              <Text style={styles.emptySubtext}>Create a support ticket to get help from our team.</Text>
            </Card>
          ) : (
            tickets.map(ticket => {
              const statusCfg = STATUS_BADGE[ticket.status];
              return (
                <TouchableOpacity key={ticket.id} onPress={() => openDetail(ticket)}>
                  <Card style={styles.ticketCard}>
                    <View style={styles.ticketCardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.ticketCardTitleRow}>
                          {ticket.has_unread && <View style={styles.unreadDot} />}
                          <Text style={styles.ticketCardNumber}>{ticket.ticket_number}</Text>
                          <Badge label={statusCfg.label} variant={statusCfg.variant} />
                        </View>
                        <Text style={styles.ticketCardSubject} numberOfLines={1}>{ticket.subject}</Text>
                      </View>
                    </View>

                    <View style={styles.ticketCardMeta}>
                      <View style={styles.metaItem}>
                        <View style={[styles.priorityDot, { backgroundColor: PRIORITY_DOT[ticket.priority] }]} />
                        <Text style={styles.metaText}>{PRIORITY_LABELS[ticket.priority]}</Text>
                      </View>
                      <Text style={styles.metaText}>{CATEGORY_LABELS[ticket.category]}</Text>
                      <Text style={styles.metaText}>{formatDate(ticket.created_at)}</Text>
                      {(ticket.message_count ?? 0) > 0 && (
                        <View style={styles.metaItem}>
                          <MessageSquare size={11} color={colors.slate[400]} />
                          <Text style={styles.metaText}>{ticket.message_count}</Text>
                        </View>
                      )}
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate[50] },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  card: { marginBottom: 0 },
  centered: { alignItems: 'center', paddingVertical: spacing['3xl'] },

  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  ticketNumber: { fontSize: typography.fontSize.xs, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: colors.info[600], marginBottom: 2 },
  ticketSubject: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.slate[900] },

  // Meta
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: typography.fontSize.xs, color: colors.slate[500] },
  priorityDot: { width: 7, height: 7, borderRadius: 4 },
  descriptionText: { fontSize: typography.fontSize.sm, color: colors.slate[700], marginTop: spacing.md, lineHeight: 20 },

  // Messages
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  sectionTitle: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.slate[900] },
  emptyText: { fontSize: typography.fontSize.sm, color: colors.slate[500], textAlign: 'center', paddingVertical: spacing.xl },

  msgBubble: { borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginBottom: spacing.sm, maxWidth: '85%' as any },
  msgAdmin: { alignSelf: 'flex-start', backgroundColor: colors.slate[100], borderWidth: 1, borderColor: colors.slate[200] },
  msgUser: { alignSelf: 'flex-end', backgroundColor: colors.info[50], borderWidth: 1, borderColor: colors.info[200] },
  msgHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  msgSender: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium },
  msgSenderAdmin: { color: colors.slate[700] },
  msgSenderUser: { color: colors.info[700] },
  msgTime: { fontSize: 10, color: colors.slate[400] },
  msgBody: { fontSize: typography.fontSize.sm, color: colors.slate[700], lineHeight: 19 },

  // Reply bar
  replyBar: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.slate[200], backgroundColor: '#fff' },
  replyInput: { flex: 1, minHeight: 40, maxHeight: 100, borderWidth: 1, borderColor: colors.slate[200], borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.fontSize.sm, color: colors.slate[900] },
  sendBtn: { width: 40, height: 40, borderRadius: borderRadius.lg, backgroundColor: colors.info[600], alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
  closedBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.slate[200], backgroundColor: '#fff' },
  closedText: { fontSize: typography.fontSize.sm, color: colors.slate[500], textAlign: 'center' },

  // New ticket form
  formLabel: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.slate[700], marginBottom: spacing.xs },
  textInput: { borderWidth: 1, borderColor: colors.slate[200], borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.fontSize.sm, color: colors.slate[900], backgroundColor: '#fff' },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  charCount: { fontSize: 10, color: colors.slate[400], textAlign: 'right', marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipSelected: { backgroundColor: colors.primary[50], borderColor: colors.primary[300] },
  chipText: { fontSize: typography.fontSize.xs, color: colors.slate[600] },
  chipTextSelected: { color: colors.primary[700], fontWeight: typography.fontWeight.medium },
  formActions: { marginTop: spacing.xl, gap: spacing.sm },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: borderRadius.lg, backgroundColor: colors.primary[600] },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold },
  secondaryBtn: { alignItems: 'center', paddingVertical: spacing.md, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.slate[200] },
  secondaryBtnText: { color: colors.slate[600], fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },

  // Ticket list
  newTicketBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: borderRadius.lg, backgroundColor: colors.primary[600] },
  newTicketBtnText: { color: '#fff', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold },
  emptyCard: { alignItems: 'center', paddingVertical: spacing['3xl'] },
  emptyTitle: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.medium, color: colors.slate[700], marginBottom: spacing.xs },
  emptySubtext: { fontSize: typography.fontSize.sm, color: colors.slate[500] },

  // Ticket card
  ticketCard: { marginBottom: 0 },
  ticketCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  ticketCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  ticketCardNumber: { fontSize: typography.fontSize.xs, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: colors.info[600] },
  ticketCardSubject: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.slate[900] },
  ticketCardMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.info[500] },
});
