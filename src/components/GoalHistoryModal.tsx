import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  Target,
  PiggyBank,
  CreditCard,
  TrendingDown,
  TrendingUp,
  Trash2,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react';
import {
  getGoalHistory,
  deleteGoal,
  FinancialGoal,
  GoalType,
} from '../lib/financialGoalsApi';

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

export function GoalHistoryModal({
  isOpen,
  onClose,
  onGoalDeleted,
}: {
  isOpen: boolean;
  onClose: () => void;
  onGoalDeleted: () => void;
}) {
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      getGoalHistory()
        .then(setGoals)
        .catch(err => console.error('Failed to load goal history:', err))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const handleDelete = async (id: string) => {
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-slate-900">Goal History</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            </div>
          ) : goals.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No completed or expired goals yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
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
                  <div key={goal.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <h4 className="font-semibold text-slate-900 text-sm truncate">{goal.name}</h4>
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium uppercase ${config.bgColor} ${config.color}`}>
                          {config.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-medium uppercase rounded">
                            <CheckCircle2 className="h-3 w-3" />
                            Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium uppercase rounded">
                            <Clock className="h-3 w-3" />
                            Expired
                          </span>
                        )}
                        <button
                          onClick={() => handleDelete(goal.id)}
                          disabled={deletingId === goal.id}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          {deletingId === goal.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-500">
                          {formatCurrency(goal.current_amount)} of {formatCurrency(goal.target_amount)}
                        </span>
                        <span className="text-xs font-medium text-slate-700">{progressPct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-amber-400'}`}
                          style={{ width: `${Math.min(progressPct, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Date + activity count */}
                    <p className="text-xs text-slate-400">
                      {isCompleted ? 'Completed' : 'Expired'} {dateStr}
                      {' · '}Target: {new Date(goal.target_date + 'T00:00:00').toLocaleDateString()}
                      {(goal.manual_activity_count ?? 0) > 0 && (
                        <> · <span className="text-emerald-600 font-medium">{goal.manual_activity_count} entries logged</span></>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
