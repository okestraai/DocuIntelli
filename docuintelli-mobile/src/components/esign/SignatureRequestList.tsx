import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  FileSignature,
  Pen,
  Send,
  Download,
  Trash2,
  Check,
} from 'lucide-react-native';
import StatusBadge from './StatusBadge';
import RequestDetailSheet from './RequestDetailSheet';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import type { SentRequest, ReceivedRequest } from '../../types/esignature';
import * as esignApi from '../../lib/esignatureApi';
import { useAuth } from '../../hooks/useAuth';

interface SignatureRequestListProps {
  userEmail: string;
  onPendingCountChange?: (count: number) => void;
  onRefreshDocuments?: () => void;
}

type SubTab = 'received' | 'sent';

export default function SignatureRequestList({
  userEmail,
  onPendingCountChange,
  onRefreshDocuments,
}: SignatureRequestListProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<SubTab>('received');
  const [sent, setSent] = useState<SentRequest[]>([]);
  const [received, setReceived] = useState<ReceivedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const [vaultCaptureStates, setVaultCaptureStates] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});

  const fetchData = useCallback(async () => {
    try {
      const res = await esignApi.getMySignatures();
      setSent(res.data.sent);
      setReceived(res.data.received);

      const pendingCount = res.data.received.filter(
        (r) => r.signer_status !== 'signed' && r.signer_status !== 'declined'
      ).length;
      onPendingCountChange?.(pendingCount);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleStartSigning = (signerId: string) => {
    router.push({ pathname: '/esign/sign-auth', params: { signerId } });
  };

  const handleVaultCapture = async (signerId: string) => {
    setVaultCaptureStates((prev) => ({ ...prev, [signerId]: 'saving' }));
    try {
      await esignApi.captureSignerVault(signerId);
      setVaultCaptureStates((prev) => ({ ...prev, [signerId]: 'saved' }));
      onRefreshDocuments?.();
    } catch (err: any) {
      if (err.code === 'DOCUMENT_LIMIT_REACHED') {
        Alert.alert('Limit Reached', 'You have reached your document storage limit.');
      }
      setVaultCaptureStates((prev) => ({ ...prev, [signerId]: 'error' }));
    }
  };

  const handleDeleteDraft = async (requestId: string) => {
    Alert.alert('Delete Draft', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await esignApi.deleteRequest(requestId);
            fetchData();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  // ── Received list ─────────────────────────────────────────────────

  const pendingReceived = received.filter(
    (r) => r.signer_status !== 'signed' && r.signer_status !== 'declined'
  );
  const completedReceived = received.filter(
    (r) => r.signer_status === 'signed' || r.signer_status === 'declined'
  );

  const renderReceivedItem = ({ item }: { item: ReceivedRequest }) => {
    const isPending = item.signer_status !== 'signed' && item.signer_status !== 'declined';
    const captureState = vaultCaptureStates[item.signer_id] || 'idle';
    const canCapture = item.signer_status === 'signed' && item.request_status === 'completed' && !item.vault_captured;

    return (
      <TouchableOpacity
        style={[styles.card, isPending && styles.cardPending]}
        onPress={() => isPending ? handleStartSigning(item.signer_id) : undefined}
        activeOpacity={isPending ? 0.7 : 1}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <FileSignature size={16} color={isPending ? colors.warning[600] : colors.slate[400]} />
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          </View>
          <StatusBadge status={item.signer_status} />
        </View>

        <Text style={styles.cardSubtitle}>{item.document_name}</Text>
        <Text style={styles.cardMeta}>From: {item.owner_name} · {formatDate(item.created_at)}</Text>

        {isPending && (
          <View style={styles.cardAction}>
            <Pen size={14} color={colors.warning[600]} />
            <Text style={styles.cardActionText}>Tap to sign</Text>
          </View>
        )}

        {canCapture && captureState !== 'saved' && (
          <TouchableOpacity
            style={styles.vaultBtn}
            onPress={() => handleVaultCapture(item.signer_id)}
            disabled={captureState === 'saving'}
          >
            {captureState === 'saving' ? (
              <ActivityIndicator size="small" color={colors.primary[600]} />
            ) : (
              <>
                <Download size={14} color={colors.primary[600]} />
                <Text style={styles.vaultBtnText}>Save to Vault</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {captureState === 'saved' && (
          <View style={styles.vaultSaved}>
            <Check size={12} color={colors.primary[600]} />
            <Text style={styles.vaultSavedText}>In Vault</Text>
          </View>
        )}

        {item.vault_captured && captureState === 'idle' && (
          <View style={styles.vaultSaved}>
            <Check size={12} color={colors.primary[600]} />
            <Text style={styles.vaultSavedText}>In Vault</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ── Sent list ─────────────────────────────────────────────────────

  const renderSentItem = ({ item }: { item: SentRequest }) => {
    const progress = item.signer_count > 0 ? item.signed_count / item.signer_count : 0;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => setDetailRequestId(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Send size={14} color={colors.slate[400]} />
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          </View>
          <StatusBadge status={item.status} />
        </View>

        <Text style={styles.cardSubtitle}>{item.document_name}</Text>
        <Text style={styles.cardMeta}>{formatDate(item.created_at)}</Text>

        {/* Progress bar */}
        <View style={styles.progressRow}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {item.signed_count}/{item.signer_count} signed
          </Text>
        </View>

        {item.status === 'draft' && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDeleteDraft(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Trash2 size={14} color={colors.error[500]} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  // ── Main render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </View>
    );
  }

  const listData = subTab === 'received'
    ? [...pendingReceived, ...completedReceived]
    : sent;

  return (
    <View style={styles.container}>
      {/* Sub-tabs */}
      <View style={styles.subTabs}>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'received' && styles.subTabActive]}
          onPress={() => setSubTab('received')}
        >
          <Text style={[styles.subTabText, subTab === 'received' && styles.subTabTextActive]}>
            To Sign
            {pendingReceived.length > 0 && ` (${pendingReceived.length})`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'sent' && styles.subTabActive]}
          onPress={() => setSubTab('sent')}
        >
          <Text style={[styles.subTabText, subTab === 'sent' && styles.subTabTextActive]}>
            Sent
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={listData}
        keyExtractor={(item: any) => item.id + (item.signer_id || '')}
        renderItem={subTab === 'received'
          ? (props) => renderReceivedItem(props as any)
          : (props) => renderSentItem(props as any)
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary[600]}
          />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <FileSignature size={32} color={colors.slate[300]} />
            <Text style={styles.emptyText}>
              {subTab === 'received' ? 'No signature requests yet' : 'No sent requests'}
            </Text>
          </View>
        }
      />

      {/* Detail sheet */}
      <RequestDetailSheet
        requestId={detailRequestId}
        onClose={() => setDetailRequestId(null)}
        onRefresh={() => { setDetailRequestId(null); fetchData(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['5xl'],
  },
  subTabs: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    backgroundColor: colors.slate[100],
    borderRadius: borderRadius.md,
    padding: 3,
  },
  subTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  subTabActive: {
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  subTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.slate[400],
  },
  subTabTextActive: {
    color: colors.primary[600],
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.slate[200],
  },
  cardPending: {
    borderColor: colors.warning[300],
    backgroundColor: colors.warning[50],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    marginRight: spacing.sm,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.slate[900],
    flex: 1,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.slate[600],
    marginTop: 2,
  },
  cardMeta: {
    fontSize: 12,
    color: colors.slate[400],
    marginTop: 2,
  },
  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.warning[200],
  },
  cardActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.warning[600],
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: colors.slate[200],
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary[500],
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.slate[500],
  },
  deleteBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    padding: spacing.xs,
  },
  vaultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  vaultBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary[700],
  },
  vaultSaved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  vaultSavedText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary[600],
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing['5xl'],
    gap: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: colors.slate[400],
  },
});
