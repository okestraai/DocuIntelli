import React, { useState, useEffect } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity,
  StyleSheet, Platform, ActivityIndicator, Alert,
} from 'react-native';
import {
  History, Target, PiggyBank, CreditCard, TrendingDown, TrendingUp,
  Trash2, CheckCircle2, Clock, X,
} from 'lucide-react-native';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import {
  getGoalHistory,
  deleteGoal,
  FinancialGoal,
  GoalType,
} from '../../lib/financialGoalsApi';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

// ── Config ──────────────────────────────────────────────────

const GOAL_TYPE_CONFIG: Record<GoalType, {
  label: string;
  badgeVariant: 'primary' | 'warning' | 'error' | 'info' | 'default';
}> = {
  savings: { label: 'Savings', badgeVariant: 'primary' },
  spending_limit: { label: 'Spending Limit', badgeVariant: 'warning' },
  debt_paydown: { label: 'Debt Paydown', badgeVariant: 'error' },
  income_target: { label: 'Income Target', badgeVariant: 'info' },
  ad_hoc: { label: 'Custom', badgeVariant: 'default' },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ── Main Modal ──────────────────────────────────────────────

interface GoalHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  onGoalDeleted: () => void;
}

export default function GoalHistoryModal({
  visible,
  onClose,
  onGoalDeleted,
}: GoalHistoryModalProps) {
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      getGoalHistory()
        .then(setGoals)
        .catch(err => console.error('Failed to load goal history:', err))
        .finally(() => setLoading(false));
    }
  }, [visible]);

  const handleDelete = (goal: FinancialGoal) => {
    if (Platform.OS === 'web') {
      if (confirm(`Delete "${goal.name}"? This cannot be undone.`)) {
        confirmDelete(goal.id);
      }
    } else {
      Alert.alert(
        'Delete Goal',
        `Delete "${goal.name}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(goal.id) },
        ],
      );
    }
  };

  const confirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteGoal(id);
      setGoals(prev => prev.filter(g => g.id !== id));
      onGoalDeleted();
    } catch (err) {
      console.error('Failed to delete goal:', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <History size={20} color={colors.primary[600]} strokeWidth={2} />
              <Text style={styles.headerTitle}>Goal History</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <X size={20} color={colors.slate[400]} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={styles.centered}>
                <ActivityIndicator size="small" color={colors.primary[500]} />
              </View>
            ) : goals.length === 0 ? (
              <View style={styles.emptyState}>
                <History size={40} color={colors.slate[300]} strokeWidth={1.5} />
                <Text style={styles.emptyText}>No completed or expired goals yet.</Text>
              </View>
            ) : (
              <View style={styles.goalsList}>
                {goals.map(goal => {
                  const config = GOAL_TYPE_CONFIG[goal.goal_type] || GOAL_TYPE_CONFIG.ad_hoc;
                  const progressPct = goal.target_amount > 0
                    ? Math.min(Math.round((goal.current_amount / goal.target_amount) * 100), 100)
                    : 0;
                  const isCompleted = goal.status === 'completed';
                  const dateStr = isCompleted && goal.completed_at
                    ? new Date(goal.completed_at).toLocaleDateString()
                    : goal.expired_at
                    ? new Date(goal.expired_at).toLocaleDateString()
                    : '';

                  return (
                    <View key={goal.id} style={styles.goalCard}>
                      <View style={styles.goalTopRow}>
                        <View style={styles.goalNameRow}>
                          <Text style={styles.goalName} numberOfLines={1}>{goal.name}</Text>
                          <Badge label={config.label} variant={config.badgeVariant} />
                        </View>
                        <View style={styles.goalActions}>
                          {isCompleted ? (
                            <Badge
                              label="Completed"
                              variant="success"
                            />
                          ) : (
                            <Badge
                              label="Expired"
                              variant="warning"
                            />
                          )}
                          <TouchableOpacity
                            onPress={() => handleDelete(goal)}
                            disabled={deletingId === goal.id}
                            hitSlop={8}
                            style={styles.deleteBtn}
                          >
                            {deletingId === goal.id ? (
                              <ActivityIndicator size="small" color={colors.slate[400]} />
                            ) : (
                              <Trash2 size={14} color={colors.slate[400]} strokeWidth={2} />
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Progress bar */}
                      <View style={styles.progressSection}>
                        <View style={styles.progressLabelRow}>
                          <Text style={styles.progressLabel}>
                            {formatCurrency(goal.current_amount)} of {formatCurrency(goal.target_amount)}
                          </Text>
                          <Text style={styles.progressPct}>{progressPct}%</Text>
                        </View>
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${Math.min(progressPct, 100)}%`,
                                backgroundColor: isCompleted
                                  ? colors.primary[500]
                                  : colors.warning[500],
                              },
                            ]}
                          />
                        </View>
                      </View>

                      {/* Date + activity count */}
                      <Text style={styles.dateText}>
                        {isCompleted ? 'Completed' : 'Expired'} {dateStr}
                        {' \u00B7 '}Target: {new Date(goal.target_date + 'T00:00:00').toLocaleDateString()}
                        {(goal.manual_activity_count ?? 0) > 0 && (
                          <Text style={styles.activityCountText}>
                            {' \u00B7 '}{goal.manual_activity_count} entries logged
                          </Text>
                        )}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Button
              title="Close"
              onPress={onClose}
              variant="ghost"
              size="md"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ──────────────────────────────────────────────────

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
    maxHeight: '80%',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[200],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  closeBtn: {
    padding: spacing.sm,
  },
  scrollArea: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    gap: spacing.md,
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
  },
  goalsList: {
    gap: spacing.md,
  },
  goalCard: {
    backgroundColor: colors.slate[50],
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.slate[100],
    gap: spacing.sm,
  },
  goalTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  goalNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  goalName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    flexShrink: 1,
  },
  goalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deleteBtn: {
    padding: spacing.xs,
  },
  progressSection: {
    gap: 4,
  },
  progressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
  },
  progressPct: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: colors.slate[200],
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  dateText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
  },
  activityCountText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[600],
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate[200],
  },
});
