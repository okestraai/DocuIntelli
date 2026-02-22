import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Landmark,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PiggyBank,
  CreditCard,
  RefreshCw,
  Unplug,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lightbulb,
  BarChart3,
  Wallet,
  Banknote,
  Building2,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { usePlaidLink } from 'react-plaid-link';
import {
  createLinkToken,
  exchangePublicToken,
  getFinancialSummary,
  getConnectedAccounts,
  syncTransactions,
  disconnectBankAccount,
  commitAccountSelection,
  cancelConnection,
  FinancialSummary,
  CategoryBreakdown,
  RecurringBill,
  IncomeStream,
  ActionItem,
  MonthlyAverage,
} from '../lib/financialApi';
import { SmartDocumentPrompts } from './SmartDocumentPrompts';
import { LoanAnalysisPanel } from './LoanAnalysisPanel';
import { getAnalyzedLoans, AnalyzedLoan } from '../lib/financialApi';
import { useSubscription } from '../hooks/useSubscription';
import { AccountSelectionModal, ExistingAccount, NewAccount } from './AccountSelectionModal';

// ── Plaid Link Button ─────────────────────────────────────────

function PlaidLinkButton({ onExchangeComplete, onLoading, bankCount, bankLimit }: {
  onExchangeComplete: (result: { item_id: string; accounts: any[]; institution_name: string }) => void;
  onLoading: (loading: boolean) => void;
  bankCount: number;
  bankLimit: number;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Free plan (limit === 0): hard block. Paid plans always allow — modal enforces.
  const blocked = bankLimit === 0;

  useEffect(() => {
    if (blocked) return;
    createLinkToken()
      .then(token => setLinkToken(token))
      .catch(err => setError(err.message));
  }, [blocked]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      onLoading(true);
      try {
        const result = await exchangePublicToken(
          publicToken,
          metadata.institution?.name || 'Unknown Bank'
        );
        onExchangeComplete({
          item_id: result.item_id,
          accounts: result.accounts,
          institution_name: metadata.institution?.name || 'Unknown Bank',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect');
      } finally {
        onLoading(false);
      }
    },
    onExit: (err) => {
      if (err) console.log('[PlaidLink] onExit error:', err);
    },
  });

  if (error) {
    return (
      <div className="text-red-600 text-sm flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        {error}
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-amber-600 font-medium">
          Upgrade to connect banks
        </span>
        <button
          disabled
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-200 text-slate-500 font-semibold rounded-xl cursor-not-allowed"
        >
          <Landmark className="h-5 w-5" />
          Upgrade Required
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {bankLimit > 0 && (
        <span className="text-xs text-slate-400">{bankCount}/{bankLimit}</span>
      )}
      <button
        onClick={() => open()}
        disabled={!ready || !linkToken}
        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl shadow-md hover:shadow-lg hover:from-emerald-700 hover:to-teal-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Landmark className="h-5 w-5" />
        Connect Bank Account
      </button>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export function FinancialInsightsPage({ onUpgrade }: { onUpgrade?: () => void } = {}) {
  const { bankAccountLimit, subscription } = useSubscription();
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzedLoans, setAnalyzedLoans] = useState<AnalyzedLoan[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    accounts: true,
    debtOptimization: true,
    spending: true,
    bills: true,
    income: true,
    trends: true,
    insights: true,
    accountAnalysis: true,
    actionPlan: true,
  });

  // Account selection modal state
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [newItemId, setNewItemId] = useState<string | null>(null);
  const [newInstitutionName, setNewInstitutionName] = useState('');
  const [newAccounts, setNewAccounts] = useState<NewAccount[]>([]);
  const [cancelBanner, setCancelBanner] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fire all three requests in parallel for faster load
      const [accounts, summaryResult, loansResult] = await Promise.all([
        getConnectedAccounts(),
        getFinancialSummary().catch(() => null),
        getAnalyzedLoans().catch(() => [] as AnalyzedLoan[]),
      ]);

      setConnectedAccounts(accounts);
      setAnalyzedLoans(loansResult);

      if (accounts.length > 0 && summaryResult) {
        setSummary(summaryResult);
      } else {
        setSummary(null);
        if (accounts.length === 0) setAnalyzedLoans([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      if (!message.includes('No connected accounts')) {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Flatten connected accounts for the modal (existing accounts with institution_name)
  const flatExistingAccounts: ExistingAccount[] = useMemo(() => {
    return connectedAccounts.flatMap((item: any) =>
      (item.accounts || [])
        .filter((acct: any) => !newItemId || acct.item_id !== newItemId)
        .map((acct: any) => ({
          ...acct,
          institution_name: item.institution_name,
        }))
    );
  }, [connectedAccounts, newItemId]);

  // Total individual account count (for display in PlaidLinkButton)
  const totalAccountCount = useMemo(() => {
    return connectedAccounts.reduce(
      (sum: number, item: any) => sum + (item.accounts?.length || 0), 0
    );
  }, [connectedAccounts]);

  // After Plaid Link exchange completes → show modal immediately
  const handleExchangeComplete = useCallback(async (result: {
    item_id: string;
    accounts: any[];
    institution_name: string;
  }) => {
    setNewItemId(result.item_id);
    setNewInstitutionName(result.institution_name);
    setNewAccounts(result.accounts.map(a => ({
      account_id: a.account_id,
      name: a.name,
      official_name: a.official_name || null,
      mask: a.mask || null,
      type: a.type,
      subtype: a.subtype || null,
      current_balance: a.current_balance ?? null,
      available_balance: a.available_balance ?? null,
    })));
    setCancelBanner(null);
    setShowAccountModal(true);

    // Refresh connected accounts in background so existing list is fresh
    getConnectedAccounts()
      .then(fresh => setConnectedAccounts(fresh))
      .catch(() => {});
  }, []);

  // Modal: user confirmed their account selection
  const handleAccountSelectionSubmit = useCallback(async (selectedAccountIds: string[]) => {
    await commitAccountSelection(selectedAccountIds);
    setShowAccountModal(false);
    setNewItemId(null);
    setNewAccounts([]);
    await loadData();
  }, [loadData]);

  // Modal: user cancelled → remove the new item, show banner
  const handleAccountSelectionCancel = useCallback(async (itemId: string) => {
    await cancelConnection(itemId);
    setShowAccountModal(false);
    const instName = newInstitutionName;
    setNewItemId(null);
    setNewAccounts([]);
    setCancelBanner('No accounts were added. You can connect a new bank account later.');
    await loadData();
  }, [loadData, newInstitutionName]);

  const handleSync = async (itemId: string) => {
    setSyncing(true);
    try {
      await syncTransactions(itemId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async (itemId: string) => {
    if (!confirm('Are you sure you want to disconnect this bank account? All transaction data will be removed.')) return;
    try {
      await disconnectBankAccount(itemId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <div className="h-7 sm:h-8 bg-slate-200 rounded w-64 mb-2 animate-pulse" />
          <div className="h-4 bg-slate-200 rounded w-96 animate-pulse" />
        </div>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-white rounded-xl border border-slate-200 animate-pulse" />
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="h-48 bg-white rounded-xl border border-slate-200 animate-pulse" />
            <div className="h-48 bg-white rounded-xl border border-slate-200 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // Full-screen loading overlay while exchanging Plaid token
  const exchangeLoadingOverlay = linkLoading && !showAccountModal && (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="mx-auto w-14 h-14 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center mb-4">
          <RefreshCw className="h-7 w-7 text-emerald-600 animate-spin" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-1">Setting up your accounts</h3>
        <p className="text-sm text-slate-500">Securely connecting to your bank...</p>
      </div>
    </div>
  );

  // Shared modal + banner (rendered in both onboarding and dashboard views)
  const accountModalElement = (
    <>
      {exchangeLoadingOverlay}
      {showAccountModal && newItemId && (
        <AccountSelectionModal
          isOpen={showAccountModal}
          existingAccounts={flatExistingAccounts}
          newAccounts={newAccounts}
          newItemId={newItemId}
          newInstitutionName={newInstitutionName}
          bankAccountLimit={bankAccountLimit}
          currentPlan={subscription?.plan || 'free'}
          onSubmit={handleAccountSelectionSubmit}
          onCancel={handleAccountSelectionCancel}
          onUpgrade={onUpgrade || (() => {})}
        />
      )}
    </>
  );

  const cancelBannerElement = cancelBanner && (
    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
        <span className="text-sm text-amber-800">{cancelBanner}</span>
      </div>
      <button
        onClick={() => setCancelBanner(null)}
        className="p-1 text-amber-400 hover:text-amber-600 rounded-lg hover:bg-amber-100 transition-colors"
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  // No accounts connected — show onboarding
  if (connectedAccounts.length === 0 && !showAccountModal) {
    return (
      <>
        {accountModalElement}
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8">
          {cancelBannerElement}

          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Financial Insights</h1>
            <p className="text-slate-500 mt-1">AI-powered analysis of your financial health</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-12 text-center max-w-2xl mx-auto">
            <div className="mx-auto w-20 h-20 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center mb-6">
              <Landmark className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Connect Your Bank Account</h2>
            <p className="text-slate-600 mb-8 max-w-md mx-auto">
              Securely link your bank account to get AI-powered insights into your spending, savings, and financial health. We use Plaid for bank-level security.
            </p>

            <div className="mb-8">
              <PlaidLinkButton onExchangeComplete={handleExchangeComplete} onLoading={setLinkLoading} bankCount={totalAccountCount} bankLimit={bankAccountLimit} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
              {[
                { icon: BarChart3, title: 'Spending Analysis', desc: 'See where your money goes with auto-categorized spending breakdowns' },
                { icon: CreditCard, title: 'Recurring Bills', desc: 'Detect subscriptions and recurring charges automatically' },
                { icon: Lightbulb, title: 'AI Recommendations', desc: 'Get personalized tips to save more and spend wisely' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex gap-3 p-4 rounded-xl bg-slate-50">
                  <Icon className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{title}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>256-bit encryption &bull; Read-only access &bull; Powered by Plaid</span>
            </div>
          </div>

          {/* Financial Disclaimer */}
          <div className="mt-8 max-w-2xl mx-auto p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong>Disclaimer:</strong> DocuIntelli AI provides financial insights for informational purposes only and does not replace the role of a certified financial advisor, planner, or any licensed financial professional. Users are solely responsible for any financial decisions made based on the information provided. We do not guarantee the accuracy of AI-generated analysis. Please consult a qualified financial professional before making significant financial decisions.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Dashboard with data ──────────────────────────────────

  return (
    <>
    {accountModalElement}
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8">
      {cancelBannerElement}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Financial Insights</h1>
          <p className="text-slate-500 mt-1">AI-powered analysis of your financial health</p>
        </div>
        <div className="flex items-center gap-2">
          <PlaidLinkButton onExchangeComplete={handleExchangeComplete} onLoading={setLinkLoading} bankCount={totalAccountCount} bankLimit={bankAccountLimit} />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Error</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        </div>
      )}

      {summary && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <KPICard
              icon={Wallet}
              label="Net Worth"
              value={formatCurrency(summary.total_balance)}
              color={summary.total_balance >= 0 ? 'emerald' : 'red'}
            />
            <KPICard
              icon={Banknote}
              label="Monthly Income"
              value={formatCurrency(summary.monthly_income)}
              color="blue"
            />
            <KPICard
              icon={CreditCard}
              label="Monthly Expenses"
              value={formatCurrency(summary.monthly_expenses)}
              color="orange"
            />
            <KPICard
              icon={PiggyBank}
              label="Savings Rate"
              value={`${summary.savings_rate}%`}
              color={summary.savings_rate >= 20 ? 'emerald' : summary.savings_rate >= 10 ? 'yellow' : 'red'}
              subtitle={summary.savings_rate >= 20 ? 'On track' : 'Below 20% target'}
            />
          </div>

          {/* Connected Accounts */}
          <CollapsibleSection
            title="Connected Accounts"
            icon={Landmark}
            expanded={expandedSections.accounts}
            onToggle={() => toggleSection('accounts')}
          >
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {connectedAccounts.map((item: any) => (
                <div key={item.item_id} className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-slate-900">{item.institution_name}</h4>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleSync(item.item_id)}
                        disabled={syncing}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Sync transactions"
                      >
                        <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleDisconnect(item.item_id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Disconnect"
                      >
                        <Unplug className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {item.accounts?.map((acct: any) => {
                    const isLiability = acct.type === 'credit' || acct.type === 'loan';
                    const displayBalance = isLiability
                      ? -(Math.abs(acct.initial_balance || 0))
                      : (acct.initial_balance || 0);
                    return (
                      <div key={acct.account_id} className="flex items-center justify-between py-1.5 text-sm">
                        <span className="text-slate-600">
                          {acct.name} {acct.mask && `••${acct.mask}`}
                        </span>
                        <span className={`font-medium ${isLiability ? 'text-red-600' : 'text-slate-900'}`}>
                          {formatCurrency(displayBalance)}
                        </span>
                      </div>
                    );
                  })}
                  {item.last_synced_at && (
                    <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Last synced: {new Date(item.last_synced_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* Smart Document Prompts */}
          <SmartDocumentPrompts onUploadComplete={loadData} />

          {/* Debt Optimization — analyzed loans */}
          {analyzedLoans.length > 0 && (
            <CollapsibleSection
              title="Debt Optimization"
              icon={TrendingDown}
              expanded={expandedSections.debtOptimization}
              onToggle={() => toggleSection('debtOptimization')}
              badge={`${analyzedLoans.length} loan${analyzedLoans.length > 1 ? 's' : ''}`}
            >
              <div className="space-y-4">
                {analyzedLoans.map(loan => (
                  <LoanAnalysisPanel
                    key={loan.id}
                    detectedLoanId={loan.id}
                    displayName={loan.display_name}
                    loanType={loan.loan_type}
                  />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Spending Breakdown */}
          <CollapsibleSection
            title="Spending Breakdown"
            icon={BarChart3}
            expanded={expandedSections.spending}
            onToggle={() => toggleSection('spending')}
          >
            <SpendingBreakdown categories={summary.spending_by_category} />
          </CollapsibleSection>

          {/* Recurring Bills */}
          <CollapsibleSection
            title="Recurring Bills"
            icon={CreditCard}
            expanded={expandedSections.bills}
            onToggle={() => toggleSection('bills')}
            badge={summary.recurring_bills.length > 0 ? `${summary.recurring_bills.length} detected` : undefined}
          >
            <RecurringBillsList bills={summary.recurring_bills} />
          </CollapsibleSection>

          {/* Income Streams */}
          <CollapsibleSection
            title="Income Streams"
            icon={Banknote}
            expanded={expandedSections.income}
            onToggle={() => toggleSection('income')}
          >
            <IncomeStreamsList streams={summary.income_streams} />
          </CollapsibleSection>

          {/* Monthly Trends */}
          <CollapsibleSection
            title="Monthly Trends"
            icon={TrendingUp}
            expanded={expandedSections.trends}
            onToggle={() => toggleSection('trends')}
          >
            <MonthlyTrends averages={summary.monthly_averages} />
          </CollapsibleSection>

          {/* AI Insights */}
          <CollapsibleSection
            title="AI Insights"
            icon={Lightbulb}
            expanded={expandedSections.insights}
            onToggle={() => toggleSection('insights')}
          >
            <div className="space-y-3">
              {summary.insights.map((insight, i) => (
                <div key={i} className="flex gap-3 p-3 bg-emerald-50 rounded-xl">
                  <Lightbulb className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-slate-700 text-sm">{insight}</p>
                </div>
              ))}
              {summary.ai_recommendations && (
                <div className="mt-4 p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="h-4 w-4 text-emerald-600" />
                    <h4 className="font-semibold text-emerald-800 text-sm">AI Financial Advisor</h4>
                  </div>
                  <p className="text-slate-700 text-sm leading-relaxed">{summary.ai_recommendations}</p>
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Account-Level Analysis */}
          {summary.account_analysis && Object.keys(summary.account_analysis).length > 0 && (
            <CollapsibleSection
              title="Account Analysis"
              icon={Building2}
              expanded={expandedSections.accountAnalysis}
              onToggle={() => toggleSection('accountAnalysis')}
            >
              <div className="space-y-4">
                {Object.entries(summary.account_analysis).map(([accountName, observations]) => (
                  <div key={accountName} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <h4 className="font-semibold text-slate-800 text-sm mb-2 flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-500" />
                      {accountName}
                    </h4>
                    <ul className="space-y-1.5">
                      {observations.map((obs, i) => (
                        <li key={i} className="text-slate-600 text-sm flex gap-2">
                          <span className="text-emerald-500 mt-1">•</span>
                          <span>{obs}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* 30-Day Action Plan */}
          <CollapsibleSection
            title="30-Day Action Plan"
            icon={CheckCircle2}
            expanded={expandedSections.actionPlan}
            onToggle={() => toggleSection('actionPlan')}
          >
            <ActionPlanList items={summary.action_plan} />
          </CollapsibleSection>
        </>
      )}

      {/* Financial Disclaimer */}
      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <div className="flex gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            <strong>Disclaimer:</strong> DocuIntelli AI provides financial insights for informational purposes only and does not replace the role of a certified financial advisor, planner, or any licensed financial professional. Users are solely responsible for any financial decisions made based on the information provided. We do not guarantee the accuracy of AI-generated analysis. Please consult a qualified financial professional before making significant financial decisions.
          </p>
        </div>
      </div>
    </div>
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function KPICard({ icon: Icon, label, value, color, subtitle }: {
  icon: any;
  label: string;
  value: string;
  color: string;
  subtitle?: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
    yellow: 'bg-yellow-50 text-yellow-600',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${colorMap[color] || colorMap.emerald}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-slate-900">{value}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, expanded, onToggle, badge, children }: {
  title: string;
  icon: any;
  expanded: boolean;
  onToggle: () => void;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-slate-50 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-emerald-600" />
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {badge && (
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
              {badge}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
      </button>
      {expanded && <div className="px-4 sm:px-5 pb-4 sm:pb-5">{children}</div>}
    </div>
  );
}

function SpendingBreakdown({ categories }: { categories: CategoryBreakdown[] }) {
  if (categories.length === 0) {
    return <p className="text-slate-500 text-sm">No spending data available yet.</p>;
  }

  const maxTotal = Math.max(...categories.map(c => c.total));

  return (
    <div className="space-y-3">
      {categories.slice(0, 10).map((cat) => (
        <div key={cat.category}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-slate-700">{cat.category}</span>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-500">{cat.percentage}%</span>
              <span className="font-semibold text-slate-900">{formatCurrency(cat.total)}</span>
            </div>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
              style={{ width: `${(cat.total / maxTotal) * 100}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {cat.transaction_count} transactions &bull; {formatCurrency(cat.monthly_average)}/mo avg
          </p>
        </div>
      ))}
    </div>
  );
}

function RecurringBillsList({ bills }: { bills: RecurringBill[] }) {
  if (bills.length === 0) {
    return <p className="text-slate-500 text-sm">No recurring bills detected yet.</p>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {bills.map((bill, i) => (
        <div key={i} className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-50 rounded-lg">
              <CreditCard className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900 text-sm">{bill.name}</p>
              <p className="text-xs text-slate-500">
                {bill.frequency} &bull; {bill.category}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-slate-900 text-sm">{formatCurrency(bill.monthly_amount ?? bill.amount)}/mo</p>
            <p className="text-xs text-slate-400">
              {formatCurrency(bill.amount)} × {bill.frequency}
            </p>
          </div>
        </div>
      ))}
      <div className="pt-3">
        <div className="flex justify-between text-sm font-medium">
          <span className="text-slate-600">Total Monthly Bills</span>
          <span className="text-slate-900">
            {formatCurrency(
              bills.reduce((sum, b) => sum + (b.monthly_amount ?? b.amount), 0)
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function IncomeStreamsList({ streams }: { streams: IncomeStream[] }) {
  if (streams.length === 0) {
    return <p className="text-slate-500 text-sm">No recurring income streams detected yet.</p>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {streams.map((stream, i) => (
        <div key={i} className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stream.is_salary ? 'bg-blue-50' : 'bg-slate-50'}`}>
              {stream.is_salary ? (
                <Banknote className="h-4 w-4 text-blue-600" />
              ) : (
                <DollarSign className="h-4 w-4 text-slate-600" />
              )}
            </div>
            <div>
              <p className="font-medium text-slate-900 text-sm">{stream.source}</p>
              <p className="text-xs text-slate-500">
                {stream.frequency}
                {stream.is_salary && (
                  <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-semibold uppercase">
                    Salary
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-emerald-600 text-sm">{formatCurrency(stream.monthly_amount ?? stream.average_amount)}/mo</p>
            <p className="text-xs text-slate-400">{formatCurrency(stream.average_amount)} × {stream.frequency}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthlyTrends({ averages }: { averages: MonthlyAverage[] }) {
  if (averages.length === 0) {
    return <p className="text-slate-500 text-sm">No trend data available yet.</p>;
  }

  const maxValue = Math.max(...averages.flatMap(m => [m.income, m.expenses]));

  return (
    <div className="space-y-4">
      {averages.map((month) => {
        const monthName = new Date(month.month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        return (
          <div key={month.month}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-slate-700">{monthName}</span>
              <span className={`text-sm font-semibold ${month.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {month.net >= 0 ? '+' : ''}{formatCurrency(month.net)}
              </span>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                  <span className="text-xs text-slate-500">Income</span>
                  <span className="text-xs font-medium text-slate-700 ml-auto">{formatCurrency(month.income)}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full"
                    style={{ width: `${maxValue > 0 ? (month.income / maxValue) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <TrendingDown className="h-3 w-3 text-orange-500" />
                  <span className="text-xs text-slate-500">Expenses</span>
                  <span className="text-xs font-medium text-slate-700 ml-auto">{formatCurrency(month.expenses)}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-400 rounded-full"
                    style={{ width: `${maxValue > 0 ? (month.expenses / maxValue) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionPlanList({ items }: { items: ActionItem[] }) {
  if (items.length === 0) {
    return <p className="text-slate-500 text-sm">No action items at this time.</p>;
  }

  const priorityConfig = {
    high: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-600', badge: 'bg-red-100 text-red-700' },
    medium: { bg: 'bg-yellow-50', border: 'border-yellow-200', icon: 'text-yellow-600', badge: 'bg-yellow-100 text-yellow-700' },
    low: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600', badge: 'bg-blue-100 text-blue-700' },
  };

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const config = priorityConfig[item.priority];
        return (
          <div key={i} className={`p-4 rounded-xl border ${config.bg} ${config.border}`}>
            <div className="flex items-start gap-3">
              <ArrowRight className={`h-5 w-5 ${config.icon} flex-shrink-0 mt-0.5`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-slate-900 text-sm">{item.title}</h4>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${config.badge}`}>
                    {item.priority}
                  </span>
                </div>
                <p className="text-slate-600 text-sm">{item.description}</p>
                {item.potential_savings && (
                  <p className="text-emerald-600 text-xs font-medium mt-1.5 flex items-center gap-1">
                    <PiggyBank className="h-3 w-3" />
                    Potential savings: {formatCurrency(item.potential_savings)}/month
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Utility ─────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
