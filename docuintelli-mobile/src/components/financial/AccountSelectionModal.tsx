import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity,
  StyleSheet, Platform,
} from 'react-native';
import { AlertTriangle, Building2, Check, ArrowUpRight } from 'lucide-react-native';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

// ── Types ────────────────────────────────────────────────────────

export interface ExistingAccount {
  account_id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  initial_balance: number | null;
  item_id: string;
  institution_name: string;
}

export interface NewAccount {
  account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  current_balance: number | null;
  available_balance: number | null;
}

interface AccountSelectionModalProps {
  visible: boolean;
  existingAccounts: ExistingAccount[];
  newAccounts: NewAccount[];
  newItemId: string;
  newInstitutionName: string;
  bankAccountLimit: number;
  currentPlan: 'free' | 'starter' | 'pro';
  onSubmit: (selectedAccountIds: string[]) => Promise<void>;
  onCancel: (newItemId: string) => Promise<void>;
  onUpgrade: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

function planDisplayName(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

// ── Checkbox ─────────────────────────────────────────────────────

function Checkbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7} hitSlop={8}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Check size={14} color={colors.white} strokeWidth={3} />}
      </View>
    </TouchableOpacity>
  );
}

// ── AccountRow ───────────────────────────────────────────────────

function AccountRow({
  accountId,
  name,
  mask,
  type,
  subtype,
  balance,
  checked,
  onToggle,
  isNew,
}: {
  accountId: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  balance: number | null;
  checked: boolean;
  onToggle: (id: string) => void;
  isNew?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onToggle(accountId)}
      style={[styles.accountRow, checked && styles.accountRowChecked]}
    >
      <Checkbox checked={checked} onToggle={() => onToggle(accountId)} />
      <View style={styles.accountInfo}>
        <View style={styles.accountNameRow}>
          <Text style={styles.accountName} numberOfLines={1}>{name}</Text>
          {mask && <Text style={styles.accountMask}>{'\u2022\u2022'}{mask}</Text>}
          {isNew && <Badge label="NEW" variant="info" />}
        </View>
        <Text style={styles.accountType}>
          {type}{subtype ? ` \u00B7 ${subtype}` : ''}
        </Text>
      </View>
      {balance != null && (
        <Text style={[styles.accountBalance, balance < 0 && styles.negativeBalance]}>
          {formatCurrency(balance)}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ── Main Modal ───────────────────────────────────────────────────

export default function AccountSelectionModal({
  visible,
  existingAccounts,
  newAccounts,
  newItemId,
  newInstitutionName,
  bankAccountLimit,
  currentPlan,
  onSubmit,
  onCancel,
  onUpgrade,
}: AccountSelectionModalProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Initialize checked state when modal opens: existing = checked, new = unchecked
  useEffect(() => {
    if (visible) {
      setCheckedIds(new Set(existingAccounts.map(a => a.account_id)));
      setSubmitting(false);
      setCancelling(false);
    }
  }, [visible, existingAccounts]);

  // Block Escape key on web
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const handler = (e: any) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    (window as any).addEventListener('keydown', handler, true);
    return () => (window as any).removeEventListener('keydown', handler, true);
  }, [visible]);

  const checkedCount = checkedIds.size;
  const overLimit = checkedCount > bankAccountLimit;
  const progressPct = Math.min((checkedCount / bankAccountLimit) * 100, 100);

  const toggleAccount = useCallback((accountId: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  }, []);

  const handleSubmit = async () => {
    if (overLimit || checkedCount === 0) return;
    setSubmitting(true);
    try {
      await onSubmit(Array.from(checkedIds));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await onCancel(newItemId);
    } finally {
      setCancelling(false);
    }
  };

  // Group existing accounts by institution
  const existingByInstitution = useMemo(() => {
    const map = new Map<string, ExistingAccount[]>();
    for (const acct of existingAccounts) {
      const key = acct.institution_name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(acct);
    }
    return map;
  }, [existingAccounts]);

  const progressColor = overLimit
    ? colors.error[500]
    : checkedCount === bankAccountLimit
    ? colors.warning[500]
    : colors.primary[500];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {}}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Select Bank Accounts</Text>
            <Text style={styles.headerSubtitle}>
              Choose which accounts to include. Your {planDisplayName(currentPlan)} plan allows up to{' '}
              <Text style={styles.headerBold}>{bankAccountLimit}</Text> account{bankAccountLimit !== 1 ? 's' : ''}.
            </Text>
          </View>

          {/* Progress indicator */}
          <View style={styles.progressSection}>
            <Text style={styles.progressLabel}>
              {checkedCount} / {bankAccountLimit} selected
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: progressColor }]} />
            </View>
          </View>

          {/* Scrollable account list */}
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            {/* Existing accounts by institution */}
            {existingByInstitution.size > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>CURRENTLY CONNECTED</Text>
                {Array.from(existingByInstitution.entries()).map(([instName, accts]) => (
                  <View key={instName} style={styles.institutionGroup}>
                    <View style={styles.institutionHeader}>
                      <Building2 size={16} color={colors.slate[400]} strokeWidth={2} />
                      <Text style={styles.institutionName}>{instName}</Text>
                    </View>
                    <View style={styles.accountsList}>
                      {accts.map(acct => (
                        <AccountRow
                          key={acct.account_id}
                          accountId={acct.account_id}
                          name={acct.name}
                          mask={acct.mask}
                          type={acct.type}
                          subtype={acct.subtype}
                          balance={acct.initial_balance}
                          checked={checkedIds.has(acct.account_id)}
                          onToggle={toggleAccount}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* New accounts from this Plaid session */}
            {newAccounts.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>NEW FROM {newInstitutionName.toUpperCase()}</Text>
                <View style={styles.accountsList}>
                  {newAccounts.map(acct => (
                    <AccountRow
                      key={acct.account_id}
                      accountId={acct.account_id}
                      name={acct.name}
                      mask={acct.mask}
                      type={acct.type}
                      subtype={acct.subtype}
                      balance={acct.current_balance}
                      checked={checkedIds.has(acct.account_id)}
                      onToggle={toggleAccount}
                      isNew
                    />
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Over-limit warning */}
          {overLimit && (
            <View style={styles.warningBox}>
              <AlertTriangle size={18} color={colors.error[500]} strokeWidth={2} />
              <View style={styles.warningTextWrap}>
                <Text style={styles.warningTitle}>
                  You've selected more accounts than your {planDisplayName(currentPlan)} plan allows.
                </Text>
                {currentPlan === 'pro' ? (
                  <Text style={styles.warningBody}>
                    Deselect {checkedCount - bankAccountLimit} account{checkedCount - bankAccountLimit > 1 ? 's' : ''} to continue.
                  </Text>
                ) : (
                  <View style={styles.warningBodyRow}>
                    <Text style={styles.warningBody}>
                      Deselect {checkedCount - bankAccountLimit} account{checkedCount - bankAccountLimit > 1 ? 's' : ''} or{' '}
                    </Text>
                    <TouchableOpacity onPress={onUpgrade} activeOpacity={0.7} style={styles.upgradeLink}>
                      <Text style={styles.upgradeLinkText}>Upgrade to Pro</Text>
                      <ArrowUpRight size={12} color={colors.error[700]} strokeWidth={2} />
                    </TouchableOpacity>
                    <Text style={styles.warningBody}> to connect more accounts.</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Footer actions */}
          <View style={styles.footer}>
            <Button
              title={cancelling ? 'Cancelling...' : 'Cancel'}
              onPress={handleCancel}
              variant="ghost"
              size="md"
              loading={cancelling}
              disabled={submitting || cancelling}
            />
            <Button
              title={submitting ? 'Saving...' : `Add Accounts (${checkedCount})`}
              onPress={handleSubmit}
              variant="primary"
              size="md"
              loading={submitting}
              disabled={overLimit || checkedCount === 0 || submitting || cancelling}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
  },
  container: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    ...(Platform.OS === 'web' ? {
      borderBottomLeftRadius: borderRadius['2xl'],
      borderBottomRightRadius: borderRadius['2xl'],
      maxWidth: 540,
      width: '95%',
    } : {}),
    maxHeight: '90%',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[200],
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    marginTop: 4,
    lineHeight: 20,
  },
  headerBold: {
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[700],
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.slate[50],
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[200],
  },
  progressLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.slate[200],
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  scrollArea: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[400],
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  institutionGroup: {
    marginBottom: spacing.md,
  },
  institutionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  institutionName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
  },
  accountsList: {
    gap: spacing.xs,
    paddingLeft: spacing.lg,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.slate[200],
  },
  accountRowChecked: {
    borderColor: colors.primary[300],
    backgroundColor: colors.primary[50],
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.slate[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  accountInfo: {
    flex: 1,
    minWidth: 0,
  },
  accountNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  accountName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[900],
    flexShrink: 1,
  },
  accountMask: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
  },
  accountType: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    textTransform: 'capitalize',
    marginTop: 2,
  },
  accountBalance: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  negativeBalance: {
    color: colors.error[600],
  },
  warningBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.error[50],
    borderTopWidth: 1,
    borderTopColor: colors.error[200],
  },
  warningTextWrap: {
    flex: 1,
  },
  warningTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.error[800],
  },
  warningBodyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 2,
  },
  warningBody: {
    fontSize: typography.fontSize.sm,
    color: colors.error[600],
    marginTop: 2,
  },
  upgradeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  upgradeLinkText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.error[700],
    textDecorationLine: 'underline',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate[200],
  },
});
