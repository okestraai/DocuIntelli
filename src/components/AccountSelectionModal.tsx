import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  Building2,
  Loader2,
  ArrowUpRight,
} from 'lucide-react';

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
  isOpen: boolean;
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

// ── Format helpers ───────────────────────────────────────────────

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

// ── AccountRow sub-component ────────────────────────────────────

function AccountRow({
  accountId,
  name,
  mask,
  type,
  subtype,
  balance,
  checked,
  disabled,
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
  disabled: boolean;
  onToggle: (id: string) => void;
  isNew?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
        checked
          ? 'border-emerald-300 bg-emerald-50/70'
          : disabled
          ? 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => !disabled && onToggle(accountId)}
        className="h-4 w-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900 truncate">{name}</span>
          {mask && <span className="text-xs text-slate-400">••{mask}</span>}
          {isNew && (
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold uppercase rounded">
              New
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500 capitalize">
          {type}{subtype ? ` · ${subtype}` : ''}
        </span>
      </div>
      {balance != null && (
        <span className={`text-sm font-semibold whitespace-nowrap ${balance < 0 ? 'text-red-600' : 'text-slate-900'}`}>
          {formatCurrency(balance)}
        </span>
      )}
    </label>
  );
}

// ── Main Modal ──────────────────────────────────────────────────

export function AccountSelectionModal({
  isOpen,
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

  // Initialize checked state when modal opens:
  // existing = checked, new = unchecked
  useEffect(() => {
    if (isOpen) {
      const initialChecked = new Set(existingAccounts.map(a => a.account_id));
      setCheckedIds(initialChecked);
    }
  }, [isOpen, existingAccounts]);

  // Block Escape key while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isOpen]);

  const checkedCount = checkedIds.size;
  const overLimit = checkedCount > bankAccountLimit;

  const toggleAccount = (accountId: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

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

  if (!isOpen) return null;

  const progressPct = Math.min((checkedCount / bankAccountLimit) * 100, 100);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900">Select Bank Accounts</h2>
          <p className="text-slate-500 text-sm mt-1">
            Choose which accounts to include. Your {planDisplayName(currentPlan)} plan allows up to{' '}
            <strong>{bankAccountLimit}</strong> account{bankAccountLimit !== 1 ? 's' : ''}.
          </p>
        </div>

        {/* Progress indicator */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-4">
          <span className="text-sm font-medium text-slate-700 whitespace-nowrap">
            {checkedCount} / {bankAccountLimit} selected
          </span>
          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                overLimit
                  ? 'bg-red-500'
                  : checkedCount === bankAccountLimit
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Scrollable account list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Existing accounts by institution */}
          {existingByInstitution.size > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Currently Connected
              </h3>
              {Array.from(existingByInstitution.entries()).map(([instName, accts]) => (
                <div key={instName} className="mb-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">{instName}</span>
                  </div>
                  <div className="space-y-1.5 pl-6">
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
                        disabled={false}
                        onToggle={toggleAccount}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New accounts from this Plaid session */}
          {newAccounts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                New from {newInstitutionName}
              </h3>
              <div className="space-y-1.5 pl-6">
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
                    disabled={false}
                    onToggle={toggleAccount}
                    isNew
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Over-limit warning */}
        {overLimit && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-red-800">
                  You've selected more accounts than your {planDisplayName(currentPlan)} plan allows.
                </p>
                <p className="text-red-600 mt-0.5">
                  {currentPlan === 'pro' ? (
                    <>Deselect {checkedCount - bankAccountLimit} account{checkedCount - bankAccountLimit > 1 ? 's' : ''} to continue.</>
                  ) : (
                    <>
                      Deselect {checkedCount - bankAccountLimit} account{checkedCount - bankAccountLimit > 1 ? 's' : ''} or{' '}
                      <button
                        onClick={onUpgrade}
                        className="inline-flex items-center gap-0.5 underline font-medium hover:text-red-800"
                      >
                        upgrade your plan <ArrowUpRight className="h-3 w-3" />
                      </button>{' '}
                      to connect more accounts.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={handleCancel}
            disabled={submitting || cancelling}
            className="px-5 py-2.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            {cancelling ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cancelling...
              </span>
            ) : (
              'Cancel'
            )}
          </button>
          <button
            onClick={handleSubmit}
            disabled={overLimit || checkedCount === 0 || submitting || cancelling}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl shadow-md hover:shadow-lg hover:from-emerald-700 hover:to-teal-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </span>
            ) : (
              `Add Accounts (${checkedCount})`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
