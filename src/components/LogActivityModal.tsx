import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Loader2,
  Calendar,
} from 'lucide-react';
import {
  getGoalActivities,
  createGoalActivity,
  deleteGoalActivity,
  FinancialGoal,
  GoalActivity,
  GoalType,
} from '../lib/financialGoalsApi';

const AMOUNT_HELP: Record<GoalType, string> = {
  savings: 'Amount saved toward this goal',
  spending_limit: 'Additional spending not captured by bank',
  debt_paydown: 'Extra payment toward this debt',
  income_target: 'Additional income earned',
  ad_hoc: 'Progress amount to log',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function LogActivityModal({
  isOpen,
  goal,
  onClose,
  onActivityChanged,
}: {
  isOpen: boolean;
  goal: FinancialGoal;
  onClose: () => void;
  onActivityChanged: () => void;
}) {
  const [activities, setActivities] = useState<GoalActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [activityDate, setActivityDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setDescription('');
      setActivityDate(new Date().toISOString().split('T')[0]);
      setError(null);
      setLoadingActivities(true);
      getGoalActivities(goal.id)
        .then(data => setActivities(data.activities))
        .catch(err => console.error('Failed to load activities:', err))
        .finally(() => setLoadingActivities(false));
    }
  }, [isOpen, goal.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setError('Amount must be a positive number');
      return;
    }
    if (!activityDate) {
      setError('Date is required');
      return;
    }

    setSubmitting(true);
    try {
      const newActivity = await createGoalActivity(goal.id, {
        amount: parsed,
        description: description.trim() || undefined,
        activity_date: activityDate,
      });
      setActivities(prev => [newActivity, ...prev]);
      setAmount('');
      setDescription('');
      setActivityDate(new Date().toISOString().split('T')[0]);
      onActivityChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to log activity');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (activityId: string) => {
    setDeletingId(activityId);
    try {
      await deleteGoalActivity(goal.id, activityId);
      setActivities(prev => prev.filter(a => a.id !== activityId));
      onActivityChanged();
    } catch (err) {
      console.error('Failed to delete activity:', err);
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Log Activity</h2>
            <p className="text-sm text-slate-500 mt-0.5">{goal.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Log form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="log-amount" className="block text-sm font-medium text-slate-700 mb-1">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  id="log-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">{AMOUNT_HELP[goal.goal_type]}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="log-date" className="block text-sm font-medium text-slate-700 mb-1">
                  Date
                </label>
                <input
                  id="log-date"
                  type="date"
                  value={activityDate}
                  min={goal.start_date}
                  max={todayStr}
                  onChange={e => setActivityDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="log-desc" className="block text-sm font-medium text-slate-700 mb-1">
                  Note <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  id="log-desc"
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g., Cash deposit"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg font-semibold text-sm hover:from-emerald-700 hover:to-teal-700 transition-all shadow-sm disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Logging...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Log Activity
                </>
              )}
            </button>
          </form>

          {/* Activity history */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">Activity History</h3>
            {loadingActivities ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
              </div>
            ) : activities.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No activities logged yet.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {activities.map(a => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center gap-1 text-xs text-slate-400 flex-shrink-0">
                        <Calendar className="h-3 w-3" />
                        {new Date(a.activity_date + 'T00:00:00').toLocaleDateString()}
                      </div>
                      <span className="text-sm text-slate-600 truncate">
                        {a.description || 'No description'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-sm font-medium text-emerald-700">
                        +{formatCurrency(a.amount)}
                      </span>
                      <button
                        onClick={() => handleDelete(a.id)}
                        disabled={deletingId === a.id}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        {deletingId === a.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
