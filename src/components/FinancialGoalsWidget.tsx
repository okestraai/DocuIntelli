import React, { useState, useEffect, useCallback } from 'react';
import {
  Target,
  Plus,
  History,
  PiggyBank,
  CreditCard,
  TrendingDown,
  TrendingUp,
  Sparkles,
  Bell,
  X,
  Pencil,
  Trash2,
  Calendar,
  ListPlus,
} from 'lucide-react';
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
} from '../lib/financialGoalsApi';
import { GoalCreationModal } from './GoalCreationModal';
import { GoalHistoryModal } from './GoalHistoryModal';
import { LogActivityModal } from './LogActivityModal';

const GOAL_TYPE_CONFIG: Record<GoalType, { label: string; color: string; bgColor: string; icon: any }> = {
  savings: { label: 'Savings', color: 'text-emerald-700', bgColor: 'bg-emerald-100', icon: PiggyBank },
  spending_limit: { label: 'Spending Limit', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: CreditCard },
  debt_paydown: { label: 'Debt Paydown', color: 'text-red-700', bgColor: 'bg-red-100', icon: TrendingDown },
  income_target: { label: 'Income Target', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: TrendingUp },
  ad_hoc: { label: 'Custom', color: 'text-slate-700', bgColor: 'bg-slate-100', icon: Target },
};

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

function getProgressBarColor(goal: FinancialGoal, pct: number): string {
  if (goal.goal_type === 'spending_limit') {
    if (pct >= 95) return 'from-red-500 to-red-600';
    if (pct >= 80) return 'from-orange-500 to-orange-600';
    if (pct >= 60) return 'from-yellow-500 to-yellow-600';
    return 'from-emerald-500 to-teal-500';
  }
  if (pct >= 100) return 'from-emerald-500 to-teal-500';
  if (pct >= 75) return 'from-emerald-500 to-teal-500';
  return 'from-emerald-500 to-teal-500';
}

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
  const TypeIcon = config.icon;
  const progressPct = goal.target_amount > 0
    ? Math.min(Math.round((goal.current_amount / goal.target_amount) * 100), 100)
    : 0;
  const remaining = Math.max(0, goal.target_amount - goal.current_amount);
  const days = daysUntil(goal.target_date);
  const barColor = getProgressBarColor(goal, progressPct);

  const isSpendingLimit = goal.goal_type === 'spending_limit';
  const amountLabel = isSpendingLimit
    ? `${formatCurrency(goal.current_amount)} of ${formatCurrency(goal.target_amount)} spent`
    : `${formatCurrency(goal.current_amount)} of ${formatCurrency(goal.target_amount)}`;
  const remainingLabel = isSpendingLimit
    ? `${formatCurrency(remaining)} left in budget`
    : `${formatCurrency(remaining)} to go`;

  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-slate-200 transition-colors group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <TypeIcon className="h-4 w-4 text-slate-500 flex-shrink-0" />
          <h4 className="font-semibold text-slate-900 text-sm truncate">{goal.name}</h4>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onLogActivity(goal); }}
            className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
            title="Log activity"
          >
            <ListPlus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(goal); }}
            className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
            title="Edit goal"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(goal); }}
            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete goal"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Type badge */}
      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium uppercase ${config.bgColor} ${config.color} mb-3`}>
        {config.label}
      </span>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500">{amountLabel}</span>
          <span className="text-xs font-medium text-slate-700">{progressPct}%</span>
        </div>
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-500`}
            style={{ width: `${Math.min(progressPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Remaining + date */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-2">
          {remainingLabel}
          {(goal.manual_activity_count ?? 0) > 0 && (
            <span className="text-emerald-600 font-medium">
              {goal.manual_activity_count} logged
            </span>
          )}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {days > 0 ? `${days}d left` : days === 0 ? 'Due today' : 'Overdue'}
        </span>
      </div>
    </div>
  );
}

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
    <div className="mb-4 space-y-2">
      {notifications.map(n => {
        const isCompletion = n.type === 'goal_completed';
        const bgClass = isCompletion
          ? 'bg-emerald-50 border-emerald-200'
          : n.type === 'goal_expired'
          ? 'bg-amber-50 border-amber-200'
          : 'bg-blue-50 border-blue-200';
        const textClass = isCompletion
          ? 'text-emerald-800'
          : n.type === 'goal_expired'
          ? 'text-amber-800'
          : 'text-blue-800';
        const iconClass = isCompletion
          ? 'text-emerald-500'
          : n.type === 'goal_expired'
          ? 'text-amber-500'
          : 'text-blue-500';

        return (
          <div key={n.id} className={`flex items-start gap-3 p-3 rounded-lg border ${bgClass}`}>
            {isCompletion ? (
              <Sparkles className={`h-4 w-4 mt-0.5 flex-shrink-0 ${iconClass}`} />
            ) : (
              <Bell className={`h-4 w-4 mt-0.5 flex-shrink-0 ${iconClass}`} />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${textClass}`}>{n.title}</p>
              <p className={`text-xs ${textClass} opacity-80`}>{n.message}</p>
            </div>
            <button
              onClick={() => onDismiss(n.id)}
              className={`p-0.5 rounded hover:bg-black/5 ${textClass}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      {notifications.length > 1 && (
        <button
          onClick={onDismissAll}
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          Dismiss all
        </button>
      )}
    </div>
  );
}

export function FinancialGoalsWidget({
  connectedAccounts,
}: {
  connectedAccounts: any[];
}) {
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
    await markNotificationRead(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleDismissAllNotifications = async () => {
    await markAllNotificationsRead();
    setNotifications([]);
  };

  const handleDelete = async (goal: FinancialGoal) => {
    setDeletingGoal(goal);
  };

  const confirmDelete = async () => {
    if (!deletingGoal) return;
    try {
      await deleteGoal(deletingGoal.id);
      setGoals(prev => prev.filter(g => g.id !== deletingGoal.id));
      setDeletingGoal(null);
    } catch (err) {
      console.error('Failed to delete goal:', err);
    }
  };

  const handleGoalCreated = () => {
    setShowCreateModal(false);
    setEditingGoal(null);
    loadData();
  };

  return (
    <>
      {/* Notification banner */}
      <NotificationBanner
        notifications={notifications}
        onDismiss={handleDismissNotification}
        onDismissAll={handleDismissAllNotifications}
      />

      {/* Loading */}
      {loading && goals.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && goals.length === 0 && (
        <div className="text-center py-8">
          <Target className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h4 className="text-base font-semibold text-slate-700 mb-1">Set Your First Financial Goal</h4>
          <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
            Track savings targets, spending limits, debt paydown, and more. Our AI will suggest goals based on your financial data.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-semibold text-sm hover:from-emerald-700 hover:to-teal-700 transition-all shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Goal
          </button>
        </div>
      )}

      {/* Goal cards grid */}
      {goals.length > 0 && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {goals.map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onEdit={(g) => { setEditingGoal(g); setShowCreateModal(true); }}
                onDelete={handleDelete}
                onLogActivity={setLoggingGoal}
              />
            ))}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg font-medium text-sm hover:from-emerald-700 hover:to-teal-700 transition-all shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add Goal
            </button>
            {archivedCount > 0 && (
              <button
                onClick={() => setShowHistoryModal(true)}
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-emerald-600 transition-colors"
              >
                <History className="h-4 w-4" />
                View History ({archivedCount})
              </button>
            )}
          </div>
        </>
      )}

      {/* Delete confirmation */}
      {deletingGoal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete Goal</h3>
            <p className="text-sm text-slate-600 mb-5">
              Are you sure you want to delete "{deletingGoal.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingGoal(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <GoalCreationModal
          isOpen={showCreateModal}
          onClose={() => { setShowCreateModal(false); setEditingGoal(null); }}
          onGoalCreated={handleGoalCreated}
          connectedAccounts={connectedAccounts}
          editingGoal={editingGoal}
        />
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <GoalHistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          onGoalDeleted={loadData}
        />
      )}

      {/* Log Activity Modal */}
      {loggingGoal && (
        <LogActivityModal
          isOpen={!!loggingGoal}
          goal={loggingGoal}
          onClose={() => setLoggingGoal(null)}
          onActivityChanged={loadData}
        />
      )}
    </>
  );
}
