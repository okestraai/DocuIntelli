import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  X,
  Bell,
  Download,
  Ban,
  FileText,
  Clock,
  Users,
} from 'lucide-react-native';
import StatusBadge from './StatusBadge';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import type { RequestDetail } from '../../types/esignature';
import * as esignApi from '../../lib/esignatureApi';

interface RequestDetailSheetProps {
  requestId: string | null;
  onClose: () => void;
  onRefresh: () => void;
}

export default function RequestDetailSheet({ requestId, onClose, onRefresh }: RequestDetailSheetProps) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) return;
    setLoading(true);
    esignApi.getRequestDetail(requestId)
      .then((res) => setDetail(res.data))
      .catch(() => Alert.alert('Error', 'Failed to load request details'))
      .finally(() => setLoading(false));
  }, [requestId]);

  const handleRemind = async () => {
    if (!requestId) return;
    setActionLoading('remind');
    try {
      const res = await esignApi.remindSigners(requestId);
      Alert.alert('Sent', res.message || 'Reminders sent');
      onRefresh();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownload = async () => {
    if (!requestId) return;
    setActionLoading('download');
    try {
      const res = await esignApi.getSignedPdf(requestId);
      if (Platform.OS === 'web') {
        window.open(res.data.url, '_blank');
      } else {
        const fileUri = FileSystem.documentDirectory + (res.data.documentName || 'signed.pdf');
        const download = await FileSystem.downloadAsync(res.data.url, fileUri);
        await Sharing.shareAsync(download.uri);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to download');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVoid = async () => {
    if (!requestId) return;
    Alert.alert('Void Request', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Void',
        style: 'destructive',
        onPress: async () => {
          setActionLoading('void');
          try {
            await esignApi.voidRequest(requestId);
            onRefresh();
            onClose();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <Modal visible={!!requestId} animationType="slide" transparent statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {detail?.title || 'Request Details'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.slate[500]} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.primary[600]} />
            </View>
          ) : detail ? (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {/* Info row */}
              <View style={styles.infoRow}>
                <View style={styles.infoItem}>
                  <FileText size={14} color={colors.slate[400]} />
                  <Text style={styles.infoText} numberOfLines={1}>{detail.document_name}</Text>
                </View>
                <StatusBadge status={detail.status} size="md" />
              </View>

              <View style={styles.infoRow}>
                <View style={styles.infoItem}>
                  <Clock size={14} color={colors.slate[400]} />
                  <Text style={styles.infoText}>Created {formatDate(detail.created_at)}</Text>
                </View>
              </View>

              {detail.completed_at && (
                <View style={styles.infoRow}>
                  <View style={styles.infoItem}>
                    <Clock size={14} color={colors.success[500]} />
                    <Text style={[styles.infoText, { color: colors.success[700] }]}>
                      Completed {formatDate(detail.completed_at)}
                    </Text>
                  </View>
                </View>
              )}

              {/* Signers */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Users size={16} color={colors.slate[600]} />
                  <Text style={styles.sectionTitle}>
                    Signers ({detail.signers.filter((s) => s.status === 'signed').length}/{detail.signers.length})
                  </Text>
                </View>

                {detail.signers.map((signer) => (
                  <View key={signer.id} style={styles.signerRow}>
                    <View style={styles.signerInfo}>
                      <Text style={styles.signerName}>{signer.signer_name}</Text>
                      <Text style={styles.signerEmail}>{signer.signer_email}</Text>
                      {signer.signed_at && (
                        <Text style={styles.signerDate}>Signed {formatDate(signer.signed_at)}</Text>
                      )}
                    </View>
                    <StatusBadge status={signer.status} />
                  </View>
                ))}
              </View>

              {/* Actions */}
              <View style={styles.actionsSection}>
                {detail.status === 'pending' && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={handleRemind}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === 'remind' ? (
                      <ActivityIndicator size="small" color={colors.info[600]} />
                    ) : (
                      <Bell size={16} color={colors.info[600]} />
                    )}
                    <Text style={[styles.actionBtnText, { color: colors.info[600] }]}>Send Reminder</Text>
                  </TouchableOpacity>
                )}

                {detail.status === 'completed' && detail.signed_file_path && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={handleDownload}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === 'download' ? (
                      <ActivityIndicator size="small" color={colors.primary[600]} />
                    ) : (
                      <Download size={16} color={colors.primary[600]} />
                    )}
                    <Text style={[styles.actionBtnText, { color: colors.primary[600] }]}>Download Signed PDF</Text>
                  </TouchableOpacity>
                )}

                {(detail.status === 'pending' || detail.status === 'draft') && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={handleVoid}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === 'void' ? (
                      <ActivityIndicator size="small" color={colors.error[600]} />
                    ) : (
                      <Ban size={16} color={colors.error[600]} />
                    )}
                    <Text style={[styles.actionBtnText, { color: colors.error[600] }]}>Void Request</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '80%',
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.slate[900],
    flex: 1,
    marginRight: spacing.md,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  centered: {
    paddingVertical: spacing['5xl'],
    alignItems: 'center',
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  infoText: {
    fontSize: 13,
    color: colors.slate[600],
    flex: 1,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.slate[800],
  },
  signerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
  },
  signerInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  signerName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate[900],
  },
  signerEmail: {
    fontSize: 12,
    color: colors.slate[500],
    marginTop: 2,
  },
  signerDate: {
    fontSize: 11,
    color: colors.primary[600],
    marginTop: 2,
  },
  actionsSection: {
    marginTop: spacing.xl,
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
