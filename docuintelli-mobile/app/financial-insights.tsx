import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Landmark, TrendingDown, AlertTriangle } from 'lucide-react-native';
import InAppBrowser from '../src/components/ui/InAppBrowser';
import { useAuth } from '../src/hooks/useAuth';
import { useSubscription } from '../src/hooks/useSubscription';
import { usePlaidLinkFlow } from '../src/hooks/usePlaidLinkFlow';
import { useToast } from '../src/contexts/ToastContext';
import ProFeatureGate from '../src/components/ProFeatureGate';
import LoadingSpinner from '../src/components/ui/LoadingSpinner';
import GradientIcon from '../src/components/ui/GradientIcon';
import Badge from '../src/components/ui/Badge';
import ConnectBankCard from '../src/components/financial/ConnectBankCard';
import FinancialSummaryCards from '../src/components/financial/FinancialSummaryCards';
import ConnectedAccountsList from '../src/components/financial/ConnectedAccountsList';
import SpendingBreakdown from '../src/components/financial/SpendingBreakdown';
import RecurringBillsList from '../src/components/financial/RecurringBillsList';
import IncomeStreamsList from '../src/components/financial/IncomeStreamsList';
import MonthlyTrendsChart from '../src/components/financial/MonthlyTrendsChart';
import AIInsightsSection from '../src/components/financial/AIInsightsSection';
import ActionPlanSection from '../src/components/financial/ActionPlanSection';
import SmartDocumentPrompts from '../src/components/financial/SmartDocumentPrompts';
import CollapsibleSection from '../src/components/financial/CollapsibleSection';
import LoanAnalysisPanel from '../src/components/financial/LoanAnalysisPanel';
import {
  getFinancialSummary,
  getConnectedAccounts,
  getAnalyzedLoans,
  syncTransactions,
  disconnectBankAccount,
  type FinancialSummary,
  type AnalyzedLoan,
} from '../src/lib/financialApi';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { spacing, borderRadius } from '../src/theme/spacing';
import { router } from 'expo-router';

export default function FinancialInsightsScreen() {
  const { isAuthenticated } = useAuth();
  const { isStarterOrAbove, loading: subLoading } = useSubscription();
  const { showToast } = useToast();

  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);
  const [analyzedLoans, setAnalyzedLoans] = useState<AnalyzedLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const [summaryData, accountsData] = await Promise.allSettled([
        getFinancialSummary(),
        getConnectedAccounts(),
      ]);

      if (summaryData.status === 'fulfilled') {
        setSummary(summaryData.value);
      }
      if (accountsData.status === 'fulfilled') {
        // Only show items that have their sub-accounts fully loaded.
        // This prevents briefly flashing an institution name with no accounts
        // if the webhook exchange is still writing plaid_accounts rows.
        const fullyLoaded = accountsData.value.filter(
          (item: any) => item.accounts && item.accounts.length > 0,
        );
        setConnectedAccounts(fullyLoaded);

        if (fullyLoaded.length > 0) {
          // Refresh analyzed loans
          getAnalyzedLoans()
            .then((loans) => setAnalyzedLoans(loans))
            .catch(() => setAnalyzedLoans([]));
        } else {
          // All accounts disconnected — clear stale data
          setSummary(null);
          setAnalyzedLoans([]);
        }
      }

      // If both failed, show error
      if (summaryData.status === 'rejected' && accountsData.status === 'rejected') {
        const msg = summaryData.reason?.message || 'Failed to load financial data';
        // "No connected accounts" is expected for new users
        if (!msg.includes('No connected accounts')) {
          setError(msg);
        }
      }
    } catch (err: any) {
      if (!err?.message?.includes('No connected accounts')) {
        setError(err?.message || 'Failed to load data');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ── Plaid Link (hook must be called before any conditional returns) ──
  const plaid = usePlaidLinkFlow(
    () => {
      showToast('Bank connected successfully!', 'success');
      loadData();
    },
    () => {
      // User cancelled or closed the Plaid flow without completing
      showToast('Bank connection was not completed', 'info');
    },
  );

  useEffect(() => {
    if (isAuthenticated && isStarterOrAbove) loadData();
  }, [isAuthenticated, isStarterOrAbove]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  // Wait for subscription data before showing gate
  if (subLoading) {
    return <LoadingSpinner fullScreen />;
  }

  // Gate: Starter+ feature — must be AFTER all hooks
  if (!isStarterOrAbove) {
    return (
      <ProFeatureGate
        featureName="Financial Insights"
        featureDescription="Connect your bank accounts to get AI-powered spending analysis, bill tracking, loan detection, and personalized financial recommendations."
        onUpgrade={() => router.push('/billing')}
        requiredPlan="starter"
      />
    );
  }

  const handleConnectBank = () => {
    if (plaid.error) {
      showToast(plaid.error, 'error');
      return;
    }
    plaid.open();
  };

  // ── Account Management ────────────────────────────────────────
  const handleSync = async (itemId: string) => {
    setSyncing(true);
    try {
      const result = await syncTransactions(itemId);
      showToast(`Synced ${result.added} transactions`, 'success');
      await loadData();
    } catch (err: any) {
      showToast(err?.message || 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async (itemId: string) => {
    try {
      await disconnectBankAccount(itemId);
      showToast('Account disconnected', 'info');
      await loadData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to disconnect', 'error');
    }
  };

  // ── Render ────────────────────────────────────────────────────
  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  const hasAccounts = connectedAccounts.length > 0;

  return (
    <View style={styles.screen}>
      {/* Loading overlay while webhook polling is in progress */}
      {plaid.loading && (
        <View style={styles.pollingOverlay}>
          <View style={styles.pollingCard}>
            <LoadingSpinner />
            <Text style={styles.pollingText}>Connecting your bank account...</Text>
            <Text style={styles.pollingSubtext}>This may take a few seconds</Text>
          </View>
        </View>
      )}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary[600]}
            colors={[colors.primary[600]]}
          />
        }
      >
        {/* Header */}
        <LinearGradient
          colors={[...colors.gradient.primaryLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerRow}>
            <GradientIcon size={40}>
              <Landmark size={20} color={colors.white} strokeWidth={2} />
            </GradientIcon>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Financial Insights</Text>
              <Text style={styles.headerSubtitle}>
                {hasAccounts
                  ? 'AI-powered analysis of your finances'
                  : 'Connect a bank account to get started'}
              </Text>
            </View>
          </View>

          {/* Add another bank button (if already connected) */}
          {hasAccounts && (
            <ConnectBankCard onConnect={handleConnectBank} loading={plaid.loading} compact />
          )}
        </LinearGradient>

        {/* Error state */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* No accounts: show connect CTA */}
        {!hasAccounts && (
          <ConnectBankCard onConnect={handleConnectBank} loading={plaid.loading} />
        )}

        {/* Financial Dashboard Content */}
        {hasAccounts && summary && (
          <View style={styles.sections}>
            {/* KPI Cards */}
            <FinancialSummaryCards
              totalBalance={summary.total_balance}
              monthlyIncome={summary.monthly_income}
              monthlyExpenses={summary.monthly_expenses}
              savingsRate={summary.savings_rate}
            />

            {/* Connected Accounts */}
            <ConnectedAccountsList
              accounts={connectedAccounts}
              syncing={syncing}
              onSync={handleSync}
              onDisconnect={handleDisconnect}
            />

            {/* Smart Document Prompts — "Optimize Your Debts" */}
            <SmartDocumentPrompts onUploadComplete={loadData} />

            {/* Debt Optimization — analyzed loans with payoff analysis */}
            {analyzedLoans.length > 0 && (
              <CollapsibleSection
                icon={<TrendingDown size={18} color={colors.primary[600]} strokeWidth={2} />}
                title="Debt Optimization"
                trailing={
                  <Badge
                    label={`${analyzedLoans.length} loan${analyzedLoans.length > 1 ? 's' : ''}`}
                    variant="primary"
                  />
                }
              >
                <View style={styles.loansList}>
                  {analyzedLoans.map((loan) => (
                    <LoanAnalysisPanel
                      key={loan.id}
                      detectedLoanId={loan.id}
                      displayName={loan.display_name}
                    />
                  ))}
                </View>
              </CollapsibleSection>
            )}

            {/* Spending Breakdown */}
            <SpendingBreakdown categories={summary.spending_by_category} />

            {/* Recurring Bills */}
            <RecurringBillsList bills={summary.recurring_bills} />

            {/* Income Streams */}
            <IncomeStreamsList streams={summary.income_streams} />

            {/* Monthly Trends */}
            <MonthlyTrendsChart data={summary.monthly_averages} />

            {/* AI Insights */}
            <AIInsightsSection
              insights={summary.insights}
              accountAnalysis={summary.account_analysis}
              recommendations={summary.ai_recommendations}
            />

            {/* Action Plan */}
            <ActionPlanSection items={summary.action_plan} />
          </View>
        )}

        {/* Financial Disclaimer */}
        <View style={styles.disclaimer}>
          <AlertTriangle size={14} color="#92400e" strokeWidth={2} />
          <Text style={styles.disclaimerText}>
            <Text style={styles.disclaimerBold}>Disclaimer: </Text>
            DocuIntelli AI provides financial insights for informational purposes only and does not replace the role of a certified financial advisor, planner, or any licensed financial professional. Users are solely responsible for any financial decisions made based on the information provided. Please consult a qualified financial professional before making significant financial decisions.
          </Text>
        </View>

        {/* Bottom spacer for tab bar */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Plaid Hosted Link — InAppBrowser
          Three detection layers for completion:
          1. interceptSchemes: catches HTTPS redirect to /plaid-callback (onNavigationStateChange)
          2. successTextPatterns: injected JS detects "Bank Connected" text on page (auto-closes)
          3. handleClose: user taps X after seeing success page → starts webhook polling */}
      {Platform.OS !== 'web' && (
        <InAppBrowser
          url={plaid.browserUrl}
          onClose={plaid.handleClose}
          title="Connect Your Bank"
          onRedirect={(url) => plaid.handleBrowserRedirect(url)}
          interceptSchemes={['https://app.docuintelli.com/plaid-callback']}
          successTextPatterns={['Bank Connected', 'bank connected']}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.slate[50],
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing['3xl'],
  },
  headerGradient: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    marginTop: 2,
  },
  errorBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.error[50],
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.error[200],
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.error[700],
  },
  sections: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  loansList: {
    gap: spacing.md,
  },
  disclaimer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: borderRadius.lg,
  },
  disclaimerText: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    color: '#92400e',
    lineHeight: 18,
  },
  disclaimerBold: {
    fontWeight: typography.fontWeight.bold,
  },
  bottomSpacer: {
    height: 80, // space for tab bar
  },
  pollingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  pollingCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  pollingText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
    marginTop: spacing.sm,
  },
  pollingSubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
  },
});
