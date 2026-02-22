import React, { useState, useEffect } from 'react';
import {
  X,
  Target,
  PiggyBank,
  CreditCard,
  TrendingDown,
  TrendingUp,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
} from 'lucide-react';
import {
  createGoal,
  updateGoal,
  getGoalSuggestions,
  GoalType,
  GoalSuggestion,
  FinancialGoal,
  CreateGoalRequest,
} from '../lib/financialGoalsApi';

const GOAL_TYPE_OPTIONS: Array<{ value: GoalType; label: string; icon: any; description: string }> = [
  { value: 'savings', label: 'Savings Goal', icon: PiggyBank, description: 'Save toward a target amount' },
  { value: 'spending_limit', label: 'Spending Limit', icon: CreditCard, description: 'Limit spending in a period' },
  { value: 'debt_paydown', label: 'Debt Paydown', icon: TrendingDown, description: 'Pay down debt on an account' },
  { value: 'income_target', label: 'Income Target', icon: TrendingUp, description: 'Track income toward a target' },
  { value: 'ad_hoc', label: 'Custom Goal', icon: Target, description: 'Any financial goal' },
];

const ACCOUNT_TYPE_FILTER: Record<GoalType, string[] | null> = {
  savings: ['depository'],
  spending_limit: null, // all accounts
  debt_paydown: ['credit', 'loan'],
  income_target: null, // all accounts
  ad_hoc: null,
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function GoalCreationModal({
  isOpen,
  onClose,
  onGoalCreated,
  connectedAccounts,
  editingGoal,
}: {
  isOpen: boolean;
  onClose: () => void;
  onGoalCreated: () => void;
  connectedAccounts: any[];
  editingGoal: FinancialGoal | null;
}) {
  const isEditing = !!editingGoal;

  // Form state
  const [goalType, setGoalType] = useState<GoalType>(editingGoal?.goal_type || 'savings');
  const [name, setName] = useState(editingGoal?.name || '');
  const [description, setDescription] = useState(editingGoal?.description || '');
  const [targetAmount, setTargetAmount] = useState(editingGoal?.target_amount?.toString() || '');
  const [targetDate, setTargetDate] = useState(editingGoal?.target_date || '');
  const [periodType, setPeriodType] = useState(editingGoal?.period_type || 'monthly');
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(
    new Set(editingGoal?.linked_account_ids || [])
  );

  // AI suggestions
  const [suggestions, setSuggestions] = useState<GoalSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(!isEditing);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load AI suggestions when modal opens (only for new goals)
  useEffect(() => {
    if (!isEditing && isOpen) {
      setSuggestionsLoading(true);
      getGoalSuggestions()
        .then(s => setSuggestions(s))
        .catch(err => console.error('Failed to load suggestions:', err))
        .finally(() => setSuggestionsLoading(false));
    }
  }, [isEditing, isOpen]);

  // Flatten all accounts from connected items
  const allAccounts: Array<{ account_id: string; name: string; type: string; subtype: string; mask: string; initial_balance: number }> = [];
  for (const item of connectedAccounts) {
    for (const acct of item.accounts || []) {
      allAccounts.push(acct);
    }
  }

  // Filter accounts by goal type
  const typeFilter = ACCOUNT_TYPE_FILTER[goalType];
  const filteredAccounts = typeFilter
    ? allAccounts.filter(a => typeFilter.includes(a.type))
    : allAccounts;

  const toggleAccount = (accountId: string) => {
    setSelectedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const applySuggestion = (s: GoalSuggestion) => {
    setGoalType(s.goal_type);
    setName(s.name);
    setTargetAmount(s.suggested_target.toString());
    setTargetDate(s.suggested_date);
    setSelectedAccounts(new Set(s.linked_account_ids));
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amount = parseFloat(targetAmount);
    if (!name.trim()) { setError('Goal name is required'); return; }
    if (isNaN(amount) || amount <= 0) { setError('Target amount must be a positive number'); return; }
    if (!targetDate) { setError('Target date is required'); return; }

    const today = new Date().toISOString().split('T')[0];
    if (targetDate <= today) { setError('Target date must be in the future'); return; }

    setSubmitting(true);
    try {
      if (isEditing) {
        await updateGoal(editingGoal.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          target_amount: amount,
          target_date: targetDate,
          linked_account_ids: [...selectedAccounts],
        });
      } else {
        const data: CreateGoalRequest = {
          goal_type: goalType,
          name: name.trim(),
          description: description.trim() || undefined,
          target_amount: amount,
          target_date: targetDate,
          linked_account_ids: [...selectedAccounts],
        };
        if (goalType === 'spending_limit') {
          data.period_type = periodType;
        }
        await createGoal(data);
      }
      onGoalCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to save goal');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {isEditing ? 'Edit Goal' : 'Create Financial Goal'}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {isEditing ? 'Update your goal details' : 'Set a target and track your progress automatically'}
            </p>
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
          {/* AI Suggestions */}
          {!isEditing && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200 overflow-hidden">
              <button
                onClick={() => setShowSuggestions(!showSuggestions)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-800">AI-Suggested Goals</span>
                  {suggestions.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-emerald-200 text-emerald-800 text-[10px] font-medium rounded-full">
                      {suggestions.length}
                    </span>
                  )}
                </div>
                {showSuggestions ? <ChevronUp className="h-4 w-4 text-emerald-500" /> : <ChevronDown className="h-4 w-4 text-emerald-500" />}
              </button>

              {showSuggestions && (
                <div className="px-4 pb-4">
                  {suggestionsLoading ? (
                    <div className="flex items-center gap-2 py-4 justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                      <span className="text-sm text-emerald-600">Analyzing your finances...</span>
                    </div>
                  ) : suggestions.length === 0 ? (
                    <p className="text-sm text-emerald-600 py-2">No suggestions available. Create a custom goal below.</p>
                  ) : (
                    <div className="space-y-2">
                      {suggestions.map((s, i) => {
                        const config = GOAL_TYPE_OPTIONS.find(o => o.value === s.goal_type);
                        const SIcon = config?.icon || Target;
                        return (
                          <div
                            key={i}
                            className="flex items-center justify-between bg-white rounded-lg p-3 border border-emerald-100 hover:border-emerald-300 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <SIcon className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">{s.name}</p>
                                <p className="text-xs text-slate-500 truncate">
                                  {formatCurrency(s.suggested_target)} by {new Date(s.suggested_date + 'T00:00:00').toLocaleDateString()}
                                </p>
                                <p className="text-xs text-slate-400 truncate">{s.reasoning}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => applySuggestion(s)}
                              className="flex-shrink-0 ml-3 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-xs font-medium rounded-lg transition-colors"
                            >
                              Use This
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} id="goal-form" className="space-y-4">
            {/* Goal Type */}
            {!isEditing && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Goal Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {GOAL_TYPE_OPTIONS.map(opt => {
                    const OptIcon = opt.icon;
                    const selected = goalType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setGoalType(opt.value);
                          setSelectedAccounts(new Set());
                        }}
                        className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-all text-sm ${
                          selected
                            ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <OptIcon className={`h-4 w-4 flex-shrink-0 ${selected ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <div>
                          <p className={`font-medium ${selected ? 'text-emerald-800' : 'text-slate-700'}`}>{opt.label}</p>
                          <p className="text-xs text-slate-400">{opt.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Goal Name */}
            <div>
              <label htmlFor="goal-name" className="block text-sm font-medium text-slate-700 mb-1.5">Goal Name</label>
              <input
                id="goal-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Emergency Fund, Monthly Budget"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="goal-desc" className="block text-sm font-medium text-slate-700 mb-1.5">
                Description <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="goal-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What is this goal for?"
                rows={2}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
              />
            </div>

            {/* Target Amount + Date row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="goal-amount" className="block text-sm font-medium text-slate-700 mb-1.5">Target Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input
                    id="goal-amount"
                    type="number"
                    step="0.01"
                    min="1"
                    value={targetAmount}
                    onChange={e => setTargetAmount(e.target.value)}
                    placeholder="5,000"
                    className="w-full pl-7 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="goal-date" className="block text-sm font-medium text-slate-700 mb-1.5">Target Date</label>
                <input
                  id="goal-date"
                  type="date"
                  value={targetDate}
                  min={tomorrowStr}
                  onChange={e => setTargetDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            {/* Period Type (only for spending_limit) */}
            {goalType === 'spending_limit' && !isEditing && (
              <div>
                <label htmlFor="goal-period" className="block text-sm font-medium text-slate-700 mb-1.5">Budget Period</label>
                <select
                  id="goal-period"
                  value={periodType}
                  onChange={e => setPeriodType(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            )}

            {/* Linked Accounts */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Linked Accounts
                {goalType !== 'ad_hoc' && <span className="text-slate-400 font-normal"> (select accounts to track)</span>}
              </label>
              {filteredAccounts.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">
                  {allAccounts.length === 0
                    ? 'No connected accounts. Connect a bank account first.'
                    : `No ${typeFilter?.join('/')} accounts available for this goal type.`}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2">
                  {filteredAccounts.map(acct => {
                    const isLiability = acct.type === 'credit' || acct.type === 'loan';
                    const balance = isLiability ? -Math.abs(acct.initial_balance || 0) : (acct.initial_balance || 0);
                    const checked = selectedAccounts.has(acct.account_id);
                    return (
                      <label
                        key={acct.account_id}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                          checked ? 'bg-emerald-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAccount(acct.account_id)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-slate-700">{acct.name}</span>
                          {acct.mask && <span className="text-xs text-slate-400 ml-1">••{acct.mask}</span>}
                        </div>
                        <span className="text-xs text-slate-400 capitalize">{acct.type}</span>
                        <span className={`text-sm font-medium ${isLiability ? 'text-red-600' : 'text-slate-700'}`}>
                          {formatCurrency(balance)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="goal-form"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg font-semibold text-sm hover:from-emerald-700 hover:to-teal-700 transition-all shadow-sm disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {isEditing ? 'Save Changes' : 'Create Goal'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
