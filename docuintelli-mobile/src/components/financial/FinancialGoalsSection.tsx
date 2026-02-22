import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform,
} from 'react-native';
import {
  Target, Plus, History, PiggyBank, CreditCard, TrendingDown, TrendingUp,
  Sparkles, Bell, X, Pencil, Trash2, Calendar, ListPlus,
} from 'lucide-react-native';
import CollapsibleSection from './CollapsibleSection';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import GoalCreationModal from './GoalCreationModal';
import GoalHistoryModal from './GoalHistoryModal';
import LogActivityModal from './LogActivityModal';
import {
  getGoals,
  recalculateGoals,
  deleteGoal,
  markNotificationRead,
  markAllNotificationsRead,
  FinancialGoal,
  GoalType,
  GoalsResponse,
  InAppNotification,
} from '../../lib/financialGoalsApi';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

// ── Goal type config ────────────────────────────────────────

const GOAL_TYPE_CONFIG: Record<GoalType, {
  label: string;
  badgeVariant: 'primary' | 'warning' | 'error' | 'info' | 'default';
  iconColor: string;
  barColor: string;
  Icon: any;
}> = {
  savings: {
    label: 'Savings',
    badgeVariant: 'primary',
    iconColor: colors.primary[500],
    barColor: colors.primary[500],
    Icon: PiggyBank,
  },
  spending_limit: {
    label: 'Spending Limit',
    badgeVariant: 'warning',
    iconColor: colors.warning[500],
    barColor: colors.warning[500],
    Icon: CreditCard,
  },
  debt_paydown: {
    label: 'Debt Paydown',
    badgeVariant: 'error',
    iconColor: colors.error[500],
    barColor: colors.error[500],
    Icon: TrendingDown,
  },
  income_target: {
    label: 'Income Target',
    badgeVariant: 'info',
    iconColor: colors.info[500],
    barColor: colors.info[500],
    Icon: TrendingUp,
  },
  ad_hoc: {
    label: 'Custom',
    badgeVariant: 'default',
    iconColor: colors.slate[500],
    barColor: colors.slate[500],
    Icon: Target,
  },
};

// ── Helpers ─────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getBarColor(goal: FinancialGoal, pct: number): string {
  if (goal.goal_type === 'spending_limit') {
    if (pct >= 95) return colors.error[500];
    if (pct >= 80) return colors.warning[600];
    if (pct >= 60) return colors.warning[500];
    return colors.primary[500];
  }
  return colors.primary[500];
}

// ── GoalCard ────────────────────────────────────────────────

function GoalCard({
  goal,
  onEdit,
  onDelete,
  onLogActivity,
}: {
  goal: FinancialGoal;
  onEdit: (goal: FinancialGoal) => void;
  onDelete: (goal: FinancialGoal) => void;
  onLogActivity: (goal: FinancialGoal) => void;
}) {
  const config = GOAL_TYPE_CONFIG[goal.goal_type] || GOAL_TYPE_CONFIG.ad_hoc;
  const GoalIcon = config.Icon;
  const progressPct = goal.target_amount > 0
    ? Math.min(Math.round((goal.current_amount / goal.target_amount) * 100), 100)
    : 0;
  const remaining = Math.max(0, goal.target_amount - goal.current_amount);
  const days = daysUntil(goal.target_date);
  const barColor = getBarColor(goal, progressPct);

  const isSpendingLimit = goal.goal_type === 'spending_limit';
  const amountLabel = isSpendingLimit
    ? `${formatCurrency(goal.current_amount)} of ${formatCurrency(goal.target_amount)} spent`
    : `${formatCurrency(goal.current_amount)} of ${formatCurrency(goal.target_amount)}`;
  const remainingLabel = isSpendingLimit
    ? `${formatCurrency(remaining)} left in budget`
    : `${formatCurrency(remaining)} to go`;

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.topRow}>
        <View style={cardStyles.nameRow}>
          <GoalIcon size={16} color={colors.slate[500]} strokeWidth={2} />
          <Text style={cardStyles.name} numberOfLines={1}>{goal.name}</Text>
        </View>
        <View style={cardStyles.actions}>
          <TouchableOpacity
            onPress={() => onLogActivity(goal)}
            hitSlop={8}
            style={cardStyles.actionBtn}
          >
            <ListPlus size={14} color={colors.slate[400]} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onEdit(goal)}
            hitSlop={8}
            style={cardStyles.actionBtn}
          >
            <Pencil size={14} color={colors.slate[400]} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onDelete(goal)}
            hitSlop={8}
            style={cardStyles.actionBtn}
          >
            <Trash2 size={14} color={colors.slate[400]} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <Badge label={config.label} variant={config.badgeVariant} />

      {/* Progress bar */}
      <View style={cardStyles.progressSection}>
        <View style={cardStyles.progressLabelRow}>
          <Text style={cardStyles.progressLabel}>{amountLabel}</Text>
          <Text style={cardStyles.progressPct}>{progressPct}%</Text>
        </View>
        <View style={cardStyles.progressTrack}>
          <View
            style={[
              cardStyles.progressFill,
              { width: `${Math.min(progressPct, 100)}%`, backgroundColor: barColor },
            ]}
          />
        </View>
      </View>

      {/* Footer */}
      <View style={cardStyles.footer}>
        <View style={cardStyles.footerLeft}>
          <Text style={cardStyles.remainingText}>{remainingLabel}</Text>
          {(goal.manual_activity_count ?? 0) > 0 && (
            <Text style={cardStyles.activityCountText}>
              {goal.manual_activity_count} logged
            </Text>
          )}
        </View>
        <View style={cardStyles.dateRow}>
          <Calendar size={12} color={colors.slate[400]} strokeWidth={2} />
          <Text style={cardStyles.dateText}>
            {days > 0 ? `${days}d left` : days === 0 ? 'Due today' : 'Overdue'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.slate[50],
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.slate[100],
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: spacing.sm,
  },
  actionBtn: {
    padding: spacing.xs,
    borderRadius: borderRadius.md,
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
    height: 8,
    backgroundColor: colors.slate[200],
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  remainingText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
  },
  activityCountText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[600],
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
  },
});

// ── NotificationBanner ──────────────────────────────────────

function NotificationBanner({
  notifications,
  onDismiss,
  onDismissAll,
}: {
  notifications: InAppNotification[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}) {
  if (notifications.length === 0) return null;

  return (
    <View style={notifStyles.container}>
      {notifications.map(n => {
        const isCompletion = n.type === 'goal_completed';
        const isExpired = n.type === 'goal_expired';
        const bgColor = isCompletion
          ? colors.primary[50]
          : isExpired
          ? colors.warning[50]
          : colors.info[50];
        const borderColor = isCompletion
          ? colors.primary[200]
          : isExpired
          ? colors.warning[200]
          : colors.info[200];
        const textColor = isCompletion
          ? colors.primary[800]
          : isExpired
          ? colors.warning[800]
          : colors.info[800];
        const iconColor = isCompletion
          ? colors.primary[500]
          : isExpired
          ? colors.warning[500]
          : colors.info[500];

        return (
          <View
            key={n.id}
            style={[notifStyles.item, { backgroundColor: bgColor, borderColor }]}
          >
            {isCompletion ? (
              <Sparkles size={16} color={iconColor} strokeWidth={2} />
            ) : (
              <Bell size={16} color={iconColor} strokeWidth={2} />
            )}
            <View style={notifStyles.textWrap}>
              <Text style={[notifStyles.title, { color: textColor }]}>{n.title}</Text>
              <Text style={[notifStyles.message, { color: textColor }]} numberOfLines={2}>
                {n.message}
              </Text>
            </View>
            <TouchableOpacity onPress={() => onDismiss(n.id)} hitSlop={8}>
              <X size={14} color={textColor} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        );
      })}
      {notifications.length > 1 && (
        <TouchableOpacity onPress={onDismissAll}>
          <Text style={notifStyles.dismissAll}>Dismiss all</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const notifStyles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  message: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
    opacity: 0.8,
  },
  dismissAll: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    textDecorationLine: 'underline',
  },
});

// ── Main Component ──────────────────────────────────────────

interface FinancialGoalsSectionProps {
  connectedAccounts: any[];
}

export default function FinancialGoalsSection({ connectedAccounts }: FinancialGoalsSectionProps) {
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [deletingGoal, setDeletingGoal] = useState<FinancialGoal | null>(null);
  const [loggingGoal, setLoggingGoal] = useState<FinancialGoal | null>(null);

  /** Apply a GoalsResponse to state */
  const applyResponse = useCallback((data: GoalsResponse) => {
    setGoals(data.goals);
    setArchivedCount(data.archived_count);
    setNotifications(data.notifications || []);
  }, []);

  /** Load goals data (single API call — returns goals + notifications + counts) */
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getGoals();
      applyResponse(data);
    } catch (err) {
      console.error('Failed to load goals:', err);
    } finally {
      setLoading(false);
    }
  }, [applyResponse]);

  useEffect(() => {
    // 1. Show cached data instantly
    loadData().then(() => {
      // 2. Recalculate in background — returns fresh data, no extra fetches needed
      recalculateGoals()
        .then(applyResponse)
        .catch(err => console.error('Failed to recalculate goals:', err));
    });
  }, [loadData, applyResponse]);

  const handleDismissNotification = async (id: string) => {
    await markNotificationRead(id).catch(() => {});
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleDismissAllNotifications = async () => {
    await markAllNotificationsRead().catch(() => {});
    setNotifications([]);
  };

  const handleDelete = (goal: FinancialGoal) => {
    if (Platform.OS === 'web') {
      if (confirm(`Delete "${goal.name}"? This cannot be undone.`)) {
        confirmDelete(goal);
      }
    } else {
      Alert.alert(
        'Delete Goal',
        `Are you sure you want to delete "${goal.name}"? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(goal) },
        ],
      );
    }
  };

  const confirmDelete = async (goal: FinancialGoal) => {
    try {
      await deleteGoal(goal.id);
      setGoals(prev => prev.filter(g => g.id !== goal.id));
    } catch (err) {
      console.error('Failed to delete goal:', err);
    }
  };

  const handleGoalCreated = () => {
    setShowCreateModal(false);
    setEditingGoal(null);
    loadData();
  };

  const trailing = goals.length > 0 ? (
    <Badge label={`${goals.length} active`} variant="primary" />
  ) : undefined;

  return (
    <>
      <CollapsibleSection
        icon={<Target size={18} color={colors.primary[600]} strokeWidth={2} />}
        title="Financial Goals"
        trailing={trailing}
        defaultExpanded
      >
        {/* Notifications */}
        <NotificationBanner
          notifications={notifications}
          onDismiss={handleDismissNotification}
          onDismissAll={handleDismissAllNotifications}
        />

        {/* Loading */}
        {loading && goals.length === 0 && (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={colors.primary[500]} />
          </View>
        )}

        {/* Empty state */}
        {!loading && goals.length === 0 && (
          <View style={styles.emptyState}>
            <Target size={40} color={colors.slate[300]} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>Set Your First Financial Goal</Text>
            <Text style={styles.emptySubtitle}>
              Track savings targets, spending limits, debt paydown, and more. Our AI will suggest goals based on your financial data.
            </Text>
            <Button
              title="Add Goal"
              onPress={() => setShowCreateModal(true)}
              variant="primary"
              size="md"
              icon={<Plus size={16} color={colors.white} strokeWidth={2} />}
            />
          </View>
        )}

        {/* Goal cards */}
        {goals.length > 0 && (
          <View style={styles.goalsList}>
            {goals.map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onEdit={(g) => { setEditingGoal(g); setShowCreateModal(true); }}
                onDelete={handleDelete}
                onLogActivity={setLoggingGoal}
              />
            ))}
          </View>
        )}

        {/* Footer actions */}
        {goals.length > 0 && (
          <View style={styles.footerRow}>
            <Button
              title="Add Goal"
              onPress={() => setShowCreateModal(true)}
              variant="primary"
              size="sm"
              icon={<Plus size={14} color={colors.white} strokeWidth={2} />}
            />
            {archivedCount > 0 && (
              <TouchableOpacity
                onPress={() => setShowHistoryModal(true)}
                style={styles.historyBtn}
              >
                <History size={16} color={colors.slate[500]} strokeWidth={2} />
                <Text style={styles.historyText}>View History ({archivedCount})</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </CollapsibleSection>

      {/* Create/Edit Modal */}
      <GoalCreationModal
        visible={showCreateModal}
        onClose={() => { setShowCreateModal(false); setEditingGoal(null); }}
        onGoalCreated={handleGoalCreated}
        connectedAccounts={connectedAccounts}
        editingGoal={editingGoal}
      />

      {/* History Modal */}
      <GoalHistoryModal
        visible={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        onGoalDeleted={loadData}
      />

      {/* Log Activity Modal */}
      {loggingGoal && (
        <LogActivityModal
          visible={!!loggingGoal}
          goal={loggingGoal}
          onClose={() => setLoggingGoal(null)}
          onActivityChanged={loadData}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[700],
    marginTop: spacing.sm,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  goalsList: {
    gap: spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  historyText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
  },
});
