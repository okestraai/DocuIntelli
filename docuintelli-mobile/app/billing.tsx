import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import {
  Shield,
  Zap,
  Crown,
  AlertTriangle,
  CreditCard,
  FileText,
  MessageSquare,
  Upload,
  Receipt,
  Calendar,
  ExternalLink,
  Info,
  X,
} from 'lucide-react-native';
import InAppBrowser from '../src/components/ui/InAppBrowser';
import { useSubscription } from '../src/hooks/useSubscription';
import Card from '../src/components/ui/Card';
import Button from '../src/components/ui/Button';
import Badge from '../src/components/ui/Badge';
import LoadingSpinner from '../src/components/ui/LoadingSpinner';
import GradientIcon from '../src/components/ui/GradientIcon';
import PlanCard from '../src/components/subscription/PlanCard';
import UsageBar from '../src/components/subscription/UsageBar';
import ConfirmModal from '../src/components/subscription/ConfirmModal';
import {
  cancelSubscription,
  reactivateSubscription,
  upgradeSubscription,
  previewUpgrade,
  downgradeSubscription,
  createCheckoutSession,
  getCustomerPortalUrl,
  getBillingData,
} from '../src/lib/subscriptionApi';
import { useToast } from '../src/contexts/ToastContext';
import { API_BASE } from '../src/lib/config';
import { fetchPlanPrices } from '../src/lib/api';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { spacing, borderRadius } from '../src/theme/spacing';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TabId = 'subscription' | 'payment' | 'transactions' | 'usage';
type TransactionSubTab = 'invoices' | 'payments';

const TABS: { id: TabId; label: string }[] = [
  { id: 'subscription', label: 'Subscription' },
  { id: 'payment', label: 'Payment' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'usage', label: 'Usage' },
];

function buildPlans(starterPrice: number, proPrice: number) {
  return [
    {
      id: 'free' as const,
      name: 'Free',
      price: '$0',
      period: '/month',
      features: ['3 documents', '5 AI questions/month', '3 uploads/month'],
    },
    {
      id: 'starter' as const,
      name: 'Starter',
      price: `$${starterPrice % 1 === 0 ? starterPrice : starterPrice.toFixed(2)}`,
      period: '/month',
      features: [
        '25 documents',
        'Unlimited AI questions',
        '25 uploads/month',
        'Weekly audit reports',
      ],
    },
    {
      id: 'pro' as const,
      name: 'Pro',
      price: `$${proPrice % 1 === 0 ? proPrice : proPrice.toFixed(2)}`,
      period: '/month',
      features: [
        '100 documents',
        'Unlimited AI questions',
        '100 uploads/month',
        'Life events planner',
        'Priority support',
      ],
    },
  ];
}

const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2 };

const PLAN_ICON: Record<string, React.ReactNode> = {
  free: <Shield size={24} color={colors.white} strokeWidth={2} />,
  starter: <Zap size={24} color={colors.white} strokeWidth={2} />,
  pro: <Crown size={24} color={colors.white} strokeWidth={2} />,
};

const STATUS_BADGE_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  active: 'success',
  canceling: 'warning',
  canceled: 'error',
  expired: 'error',
  trialing: 'info',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '\u2014';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(amountInCents: number): string {
  return `$${(amountInCents / 100).toFixed(2)}`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function BillingScreen() {
  const { subscription, loading, documentCount, refreshSubscription } = useSubscription();
  const { showToast } = useToast();
  const scrollRef = useRef<ScrollView>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('subscription');
  const [transactionSubTab, setTransactionSubTab] = useState<TransactionSubTab>('invoices');

  // Billing data from Supabase (payment methods, invoices, transactions)
  const [billingData, setBillingData] = useState<{
    paymentMethods: any[];
    invoices: any[];
    transactions: any[];
  }>({ paymentMethods: [], invoices: [], transactions: [] });
  const [billingLoading, setBillingLoading] = useState(false);

  // Action loading states
  const [actionLoading, setActionLoading] = useState(false);

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'primary' | 'danger';
    onConfirm: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    variant: 'primary',
    onConfirm: () => {},
  });

  // Dynamic plan prices from Stripe API
  const [plans, setPlans] = useState(() => buildPlans(7, 19));

  useEffect(() => {
    fetchPlanPrices().then((prices) => {
      setPlans(buildPlans(prices.starter.monthly, prices.pro.monthly));
    });
  }, []);

  // Refreshing flag for pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);

  // In-app browser state for external URLs (invoices, checkout, portal)
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [browserTitle, setBrowserTitle] = useState('Invoice');

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------

  const loadBillingData = useCallback(async () => {
    setBillingLoading(true);
    try {
      const data = await getBillingData();
      setBillingData(data);
    } catch {
      // Tables may not exist yet -- degrade gracefully
      setBillingData({ paymentMethods: [], invoices: [], transactions: [] });
    } finally {
      setBillingLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBillingData();
  }, [loadBillingData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshSubscription(), loadBillingData()]);
    setRefreshing(false);
  }, [refreshSubscription, loadBillingData]);

  // Web popup overlay state (Stripe SPA pages can't be iframed on web)
  const [popupOverlay, setPopupOverlay] = useState<{ visible: boolean; title: string }>({
    visible: false,
    title: '',
  });
  const popupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (popupPollRef.current) clearInterval(popupPollRef.current); };
  }, []);

  const closePopupOverlay = useCallback(async () => {
    if (popupPollRef.current) { clearInterval(popupPollRef.current); popupPollRef.current = null; }
    setPopupOverlay({ visible: false, title: '' });
    await refreshSubscription();
    await loadBillingData();
  }, [refreshSubscription, loadBillingData]);

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  // Opens a Stripe SPA (portal/checkout) in a popup on web, or InAppBrowser on native.
  const openStripePopup = (url: string, title: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const w = 520, h = 700;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      const popup = window.open(
        url, 'stripe_popup',
        `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`,
      );
      setPopupOverlay({ visible: true, title });
      if (popupPollRef.current) clearInterval(popupPollRef.current);
      popupPollRef.current = setInterval(() => {
        if (!popup || popup.closed) closePopupOverlay();
      }, 500);
    } else {
      setBrowserUrl(url);
      setBrowserTitle(title);
    }
  };

  // Opens an invoice — uses PDF URL which embeds natively in iframe/WebView.
  const openInvoice = (invoiceUrl: string, pdfUrl?: string) => {
    // Prefer PDF URL — renders natively in iframe (no X-Frame-Options issue)
    const url = pdfUrl || invoiceUrl;
    if (Platform.OS === 'web' && !pdfUrl) {
      // HTML invoice page can't be iframed on web — fallback to proxy
      setBrowserUrl(`${API_BASE}/api/stripe-proxy?url=${encodeURIComponent(invoiceUrl)}`);
    } else {
      setBrowserUrl(url);
    }
    setBrowserTitle('Invoice');
  };

  const handleCancelSubscription = () => {
    setConfirmModal({
      visible: true,
      title: 'Cancel Subscription',
      message:
        'Your subscription will remain active until the end of the current billing period. After that, you will be downgraded to the Free plan. Are you sure?',
      confirmLabel: 'Cancel Subscription',
      variant: 'danger',
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await cancelSubscription();
          await refreshSubscription();
          await loadBillingData();
          setConfirmModal((prev) => ({ ...prev, visible: false }));
          showToast('Subscription canceled', 'success');
        } catch (err: any) {
          showToast(err.message || 'Failed to cancel subscription', 'error');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleReactivate = async () => {
    setActionLoading(true);
    try {
      await reactivateSubscription();
      await refreshSubscription();
      await loadBillingData();
      showToast('Subscription reactivated', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to reactivate subscription', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelDowngrade = async () => {
    // Reactivating also clears a pending downgrade
    setActionLoading(true);
    try {
      await reactivateSubscription();
      await refreshSubscription();
      showToast('Downgrade canceled', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel downgrade', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectPlan = async (planId: string) => {
    if (!subscription) return;
    const currentRank = PLAN_RANK[subscription.plan] ?? 0;
    const targetRank = PLAN_RANK[planId] ?? 0;

    if (planId === subscription.plan) return;

    // Free user selecting a paid plan -> checkout in InAppBrowser
    if (subscription.plan === 'free') {
      setActionLoading(true);
      try {
        const checkoutUrl = await createCheckoutSession(planId as 'starter' | 'pro');
        openStripePopup(checkoutUrl, 'Checkout');
      } catch (err: any) {
        showToast(err.message || 'Failed to start checkout', 'error');
      } finally {
        setActionLoading(false);
      }
      return;
    }

    // Upgrade
    if (targetRank > currentRank) {
      setActionLoading(true);
      try {
        const preview = await previewUpgrade(planId);
        const proratedText = preview.prorated_amount
          ? `You will be charged a prorated amount of ${formatCurrency(preview.prorated_amount)} (${preview.currency.toUpperCase()}) immediately.`
          : 'Your plan will be upgraded immediately.';

        setActionLoading(false);
        setConfirmModal({
          visible: true,
          title: `Upgrade to ${capitalize(planId)}`,
          message: `${proratedText}\n\nYour new plan features will be available right away.`,
          confirmLabel: 'Upgrade Now',
          variant: 'primary',
          onConfirm: async () => {
            setActionLoading(true);
            try {
              await upgradeSubscription(planId);
              await refreshSubscription();
              await loadBillingData();
              setConfirmModal((prev) => ({ ...prev, visible: false }));
              showToast(`Upgraded to ${capitalize(planId)}!`, 'success');
            } catch (err: any) {
              showToast(err.message || 'Failed to upgrade', 'error');
            } finally {
              setActionLoading(false);
            }
          },
        });
      } catch (err: any) {
        setActionLoading(false);
        showToast(err.message || 'Failed to preview upgrade', 'error');
      }
      return;
    }

    // Downgrade
    setConfirmModal({
      visible: true,
      title: `Downgrade to ${capitalize(planId)}`,
      message:
        'Your downgrade will take effect at the end of your current billing period. You will retain access to your current plan features until then. Documents exceeding the new limit may need to be removed.',
      confirmLabel: 'Downgrade',
      variant: 'danger',
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await downgradeSubscription(planId);
          await refreshSubscription();
          await loadBillingData();
          setConfirmModal((prev) => ({ ...prev, visible: false }));
          showToast('Downgrade scheduled', 'success');
        } catch (err: any) {
          showToast(err.message || 'Failed to downgrade', 'error');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleOpenPortal = async () => {
    setActionLoading(true);
    try {
      const portalUrl = await getCustomerPortalUrl();
      openStripePopup(portalUrl, 'Manage Billing');
    } catch (err: any) {
      showToast(err.message || 'Failed to open billing portal', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenInvoiceUrl = (invoiceUrl: string, pdfUrl?: string) => {
    openInvoice(invoiceUrl, pdfUrl);
  };

  const handleBrowserRedirect = async () => {
    setBrowserUrl(null);
    // Refresh subscription & billing data after returning from Stripe
    await refreshSubscription();
    await loadBillingData();
  };

  // ------------------------------------------------------------------
  // Loading state
  // ------------------------------------------------------------------

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Billing', headerShown: true }} />
        <LoadingSpinner fullScreen branded />
      </>
    );
  }

  // ------------------------------------------------------------------
  // Derived values
  // ------------------------------------------------------------------

  const currentPlan = subscription?.plan ?? 'free';
  const defaultPaymentMethod = billingData.paymentMethods.find((pm: any) => pm.is_default) ??
    billingData.paymentMethods[0] ?? null;

  const isUnlimitedAI = currentPlan === 'starter' || currentPlan === 'pro';

  const docUsagePercent = subscription
    ? subscription.document_limit > 0
      ? (documentCount / subscription.document_limit) * 100
      : 0
    : 0;
  const aiUsagePercent =
    !isUnlimitedAI && subscription
      ? subscription.ai_questions_limit > 0
        ? (subscription.ai_questions_used / subscription.ai_questions_limit) * 100
        : 0
      : 0;
  const uploadUsagePercent = subscription
    ? subscription.monthly_upload_limit > 0
      ? (subscription.monthly_uploads_used / subscription.monthly_upload_limit) * 100
      : 0
    : 0;

  const anyUsageHigh = docUsagePercent >= 80 || (!isUnlimitedAI && aiUsagePercent >= 80) || uploadUsagePercent >= 80;

  // ------------------------------------------------------------------
  // Render helpers
  // ------------------------------------------------------------------

  const renderTabSelector = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabRow}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            onPress={() => setActiveTab(tab.id)}
            activeOpacity={0.7}
            style={[styles.tabPill, isActive && styles.tabPillActive]}
          >
            <Text style={[styles.tabPillText, isActive && styles.tabPillTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  // ---- Tab 1: Subscription ----
  const renderSubscriptionTab = () => {
    if (!subscription) return null;

    return (
      <View style={styles.tabContent}>
        {/* Current Plan Card */}
        <Card style={styles.noPaddingCard}>
          {/* Gradient header */}
          <LinearGradient
            colors={[...colors.gradient.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.currentPlanHeader}
          >
            <View style={styles.currentPlanIconWrap}>
              {PLAN_ICON[currentPlan] ?? PLAN_ICON.free}
            </View>
            <View style={styles.currentPlanInfo}>
              <Text style={styles.currentPlanName}>{capitalize(currentPlan)} Plan</Text>
              <Text style={styles.currentPlanPrice}>
                {plans.find((p) => p.id === currentPlan)?.price ?? '$0'}
                <Text style={styles.currentPlanPeriod}>/month</Text>
              </Text>
            </View>
          </LinearGradient>

          {/* Status badge */}
          <View style={styles.statusRow}>
            <Badge
              label={capitalize(subscription.status)}
              variant={STATUS_BADGE_VARIANT[subscription.status] ?? 'default'}
            />
            {subscription.cancel_at_period_end && subscription.status === 'active' && (
              <Badge label="Canceling" variant="warning" />
            )}
          </View>

          {/* Info grid */}
          <View style={styles.infoGrid}>
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>Renewal</Text>
              <Text style={styles.infoCellValue}>
                {formatDate(subscription.current_period_end)}
              </Text>
            </View>
            <View style={[styles.infoCell, styles.infoCellBorder]}>
              <Text style={styles.infoCellLabel}>Payment</Text>
              <Text style={styles.infoCellValue}>
                {defaultPaymentMethod
                  ? `****${defaultPaymentMethod.last4 ?? '----'}`
                  : 'None'}
              </Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>Doc Limit</Text>
              <Text style={styles.infoCellValue}>{subscription.document_limit}</Text>
            </View>
          </View>
        </Card>

        {/* Status alerts */}
        {subscription.status === 'canceling' ||
        (subscription.status === 'active' && subscription.cancel_at_period_end) ? (
          <Card style={styles.alertCardWarning}>
            <View style={styles.alertRow}>
              <AlertTriangle size={20} color={colors.warning[600]} strokeWidth={2} />
              <View style={styles.alertTextCol}>
                <Text style={styles.alertTitle}>Subscription will cancel at period end</Text>
                <Text style={styles.alertSubtext}>
                  Access continues until {formatDate(subscription.current_period_end)}.
                </Text>
              </View>
            </View>
            <Button
              title="Reactivate Subscription"
              onPress={handleReactivate}
              variant="primary"
              size="sm"
              loading={actionLoading}
              fullWidth
            />
          </Card>
        ) : null}

        {subscription.pending_plan ? (
          <Card style={styles.alertCardWarning}>
            <View style={styles.alertRow}>
              <Info size={20} color={colors.warning[600]} strokeWidth={2} />
              <View style={styles.alertTextCol}>
                <Text style={styles.alertTitle}>Pending Downgrade</Text>
                <Text style={styles.alertSubtext}>
                  Your plan will change to {capitalize(subscription.pending_plan)} at the end of
                  the current billing period ({formatDate(subscription.current_period_end)}).
                </Text>
              </View>
            </View>
            <Button
              title="Cancel Downgrade"
              onPress={handleCancelDowngrade}
              variant="outline"
              size="sm"
              loading={actionLoading}
              fullWidth
            />
          </Card>
        ) : null}

        {subscription.status === 'canceled' ? (
          <Card style={styles.alertCardError}>
            <View style={styles.alertRow}>
              <AlertTriangle size={20} color={colors.error[600]} strokeWidth={2} />
              <View style={styles.alertTextCol}>
                <Text style={[styles.alertTitle, { color: colors.error[800] }]}>
                  Subscription Canceled
                </Text>
                <Text style={[styles.alertSubtext, { color: colors.error[600] }]}>
                  Your subscription has been canceled. Reactivate or choose a new plan below.
                </Text>
              </View>
            </View>
            <Button
              title="Reactivate Subscription"
              onPress={handleReactivate}
              variant="primary"
              size="sm"
              loading={actionLoading}
              fullWidth
            />
          </Card>
        ) : null}

        {/* Action buttons */}
        {subscription.status === 'active' && !subscription.cancel_at_period_end && currentPlan !== 'free' && (
          <View style={styles.actionRow}>
            <Button
              title="Cancel Subscription"
              onPress={handleCancelSubscription}
              variant="outline"
              size="md"
              disabled={actionLoading}
              style={styles.actionBtn}
            />
            <Button
              title="Update Payment Method"
              onPress={handleOpenPortal}
              variant="ghost"
              size="md"
              disabled={actionLoading}
              style={styles.actionBtn}
            />
          </View>
        )}

        {/* Available Plans */}
        <Text style={styles.sectionHeading}>Available Plans</Text>
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isUpgrade = (PLAN_RANK[plan.id] ?? 0) > (PLAN_RANK[currentPlan] ?? 0);
          const disabled =
            actionLoading ||
            (subscription.status === 'canceled' && plan.id !== 'free') ||
            false;

          return (
            <PlanCard
              key={plan.id}
              name={plan.name}
              price={plan.price}
              period={plan.period}
              features={plan.features}
              isCurrent={isCurrent}
              isUpgrade={isUpgrade}
              disabled={disabled}
              onSelect={() => handleSelectPlan(plan.id)}
            />
          );
        })}
      </View>
    );
  };

  // ---- Tab 2: Payment ----
  const renderPaymentTab = () => {
    if (billingLoading) {
      return (
        <View style={styles.centeredEmpty}>
          <LoadingSpinner />
        </View>
      );
    }

    if (!defaultPaymentMethod) {
      return (
        <View style={styles.tabContent}>
          <Card>
            <View style={styles.emptyState}>
              <GradientIcon size={56} light>
                <CreditCard size={24} color={colors.primary[600]} strokeWidth={1.5} />
              </GradientIcon>
              <Text style={styles.emptyTitle}>No payment methods on file</Text>
              <Text style={styles.emptyText}>
                Add a payment method to subscribe to a paid plan.
              </Text>
              <Button
                title="Add Payment Method"
                onPress={handleOpenPortal}
                variant="primary"
                size="md"
                loading={actionLoading}
              />
            </View>
          </Card>
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        <Card>
          <View style={styles.paymentCard}>
            <View style={styles.paymentIconWrap}>
              <CreditCard size={28} color={colors.primary[600]} strokeWidth={1.5} />
            </View>
            <View style={styles.paymentInfo}>
              <View style={styles.paymentTopRow}>
                <Text style={styles.paymentBrand}>
                  {capitalize(defaultPaymentMethod.brand ?? 'Card')}
                </Text>
                <Badge label="Default" variant="primary" />
              </View>
              <Text style={styles.paymentLast4}>
                **** **** **** {defaultPaymentMethod.last4 ?? '----'}
              </Text>
              <Text style={styles.paymentExpiry}>
                Expires {defaultPaymentMethod.exp_month ?? '--'}/
                {defaultPaymentMethod.exp_year ?? '----'}
              </Text>
            </View>
          </View>
        </Card>

        <Button
          title="Manage Payment Methods"
          onPress={handleOpenPortal}
          variant="outline"
          size="md"
          loading={actionLoading}
          fullWidth
          icon={<ExternalLink size={16} color={colors.slate[700]} strokeWidth={2} />}
        />
      </View>
    );
  };

  // ---- Tab 3: Transactions ----
  const renderTransactionsTab = () => {
    const invoices = billingData.invoices;
    const payments = billingData.transactions;

    const invoiceStatusVariant = (status: string): 'success' | 'warning' | 'default' => {
      if (status === 'paid') return 'success';
      if (status === 'open') return 'warning';
      return 'default';
    };

    const paymentStatusVariant = (status: string): 'success' | 'warning' | 'error' => {
      if (status === 'succeeded') return 'success';
      if (status === 'pending') return 'warning';
      return 'error';
    };

    return (
      <View style={styles.tabContent}>
        {/* Sub-toggle */}
        <View style={styles.subTabRow}>
          <TouchableOpacity
            onPress={() => setTransactionSubTab('invoices')}
            activeOpacity={0.7}
            style={[
              styles.subTabPill,
              transactionSubTab === 'invoices' && styles.subTabPillActive,
            ]}
          >
            <Text
              style={[
                styles.subTabText,
                transactionSubTab === 'invoices' && styles.subTabTextActive,
              ]}
            >
              Invoices
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTransactionSubTab('payments')}
            activeOpacity={0.7}
            style={[
              styles.subTabPill,
              transactionSubTab === 'payments' && styles.subTabPillActive,
            ]}
          >
            <Text
              style={[
                styles.subTabText,
                transactionSubTab === 'payments' && styles.subTabTextActive,
              ]}
            >
              Payments
            </Text>
          </TouchableOpacity>
        </View>

        {billingLoading ? (
          <View style={styles.centeredEmpty}>
            <LoadingSpinner />
          </View>
        ) : transactionSubTab === 'invoices' ? (
          invoices.length === 0 ? (
            <Card>
              <View style={styles.emptyState}>
                <GradientIcon size={48} light>
                  <Receipt size={22} color={colors.primary[600]} strokeWidth={1.5} />
                </GradientIcon>
                <Text style={styles.emptyTitle}>No invoices yet</Text>
                <Text style={styles.emptyText}>
                  Invoices will appear here once you have an active paid subscription.
                </Text>
              </View>
            </Card>
          ) : (
            <Card style={styles.noPaddingCard}>
              {invoices.map((inv: any, index: number) => (
                <View
                  key={inv.id ?? index}
                  style={[
                    styles.txRow,
                    index < invoices.length - 1 && styles.txRowBorder,
                  ]}
                >
                  <View style={styles.txLeft}>
                    <Text style={styles.txDate}>{formatDate(inv.created_at ?? inv.date)}</Text>
                    <Text style={styles.txAmount}>
                      {inv.amount_due != null ? formatCurrency(inv.amount_due) : inv.total != null ? formatCurrency(inv.total) : '--'}
                    </Text>
                    {inv.number && (
                      <Text style={styles.txMeta}>{inv.number}</Text>
                    )}
                  </View>
                  <View style={styles.txRight}>
                    <Badge
                      label={capitalize(inv.status ?? 'draft')}
                      variant={invoiceStatusVariant(inv.status ?? 'draft')}
                    />
                    {inv.hosted_invoice_url && (
                      <TouchableOpacity
                        onPress={() => handleOpenInvoiceUrl(inv.hosted_invoice_url, inv.invoice_pdf)}
                        activeOpacity={0.7}
                        style={styles.viewBtn}
                      >
                        <Text style={styles.viewBtnText}>View</Text>
                        <Receipt size={12} color={colors.primary[600]} strokeWidth={2} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </Card>
          )
        ) : payments.length === 0 ? (
          <Card>
            <View style={styles.emptyState}>
              <GradientIcon size={48} light>
                <CreditCard size={22} color={colors.primary[600]} strokeWidth={1.5} />
              </GradientIcon>
              <Text style={styles.emptyTitle}>No payments yet</Text>
              <Text style={styles.emptyText}>
                Payment history will appear here once transactions are processed.
              </Text>
            </View>
          </Card>
        ) : (
          <Card style={styles.noPaddingCard}>
            {payments.map((tx: any, index: number) => (
              <View
                key={tx.id ?? index}
                style={[
                  styles.txRow,
                  index < payments.length - 1 && styles.txRowBorder,
                ]}
              >
                <View style={styles.txLeft}>
                  <Text style={styles.txDate}>{formatDate(tx.created_at ?? tx.date)}</Text>
                  <Text style={styles.txAmount}>
                    {tx.amount != null ? formatCurrency(tx.amount) : '--'}
                  </Text>
                  {tx.card_brand && tx.card_last4 && (
                    <Text style={styles.txMeta}>
                      {capitalize(tx.card_brand)} ****{tx.card_last4}
                    </Text>
                  )}
                </View>
                <View style={styles.txRight}>
                  <Badge
                    label={capitalize(tx.status ?? 'pending')}
                    variant={paymentStatusVariant(tx.status ?? 'pending')}
                  />
                </View>
              </View>
            ))}
          </Card>
        )}
      </View>
    );
  };

  // ---- Tab 4: Usage ----
  const renderUsageTab = () => {
    if (!subscription) return null;

    return (
      <View style={styles.tabContent}>
        {/* Document Storage */}
        <Card>
          <UsageBar
            label="Document Storage"
            icon={<FileText size={18} color={colors.primary[600]} strokeWidth={2} />}
            used={documentCount}
            limit={subscription.document_limit}
          />
        </Card>

        {/* AI Questions */}
        <Card>
          <UsageBar
            label="AI Questions"
            icon={<MessageSquare size={18} color={colors.primary[600]} strokeWidth={2} />}
            used={subscription.ai_questions_used}
            limit={subscription.ai_questions_limit}
            isUnlimited={isUnlimitedAI}
          />
          {subscription.ai_questions_reset_date && (
            <Text style={styles.resetNote}>
              Resets {formatDate(subscription.ai_questions_reset_date)}
            </Text>
          )}
        </Card>

        {/* Monthly Uploads */}
        <Card>
          <UsageBar
            label="Monthly Uploads"
            icon={<Upload size={18} color={colors.primary[600]} strokeWidth={2} />}
            used={subscription.monthly_uploads_used}
            limit={subscription.monthly_upload_limit}
          />
          {subscription.monthly_upload_reset_date && (
            <Text style={styles.resetNote}>
              Resets {formatDate(subscription.monthly_upload_reset_date)}
            </Text>
          )}
        </Card>

        {/* Upgrade banner */}
        {anyUsageHigh && currentPlan !== 'pro' && (
          <LinearGradient
            colors={[...colors.gradient.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.upgradeBanner}
          >
            <View style={styles.upgradeBannerContent}>
              <View style={styles.upgradeBannerLeft}>
                <GradientIcon size={40}>
                  <Crown size={20} color={colors.white} strokeWidth={2} />
                </GradientIcon>
                <View style={styles.upgradeBannerText}>
                  <Text style={styles.upgradeBannerTitle}>Ready to Upgrade?</Text>
                  <Text style={styles.upgradeBannerSubtext}>
                    You're approaching your plan limits. Upgrade for more capacity.
                  </Text>
                </View>
              </View>
              <Button
                title="View Plans"
                onPress={() => {
                  setActiveTab('subscription');
                  scrollRef.current?.scrollTo({ y: 0, animated: true });
                }}
                variant="primary"
                size="sm"
              />
            </View>
          </LinearGradient>
        )}
      </View>
    );
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'subscription':
        return renderSubscriptionTab();
      case 'payment':
        return renderPaymentTab();
      case 'transactions':
        return renderTransactionsTab();
      case 'usage':
        return renderUsageTab();
      default:
        return null;
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Billing', headerShown: true }} />

      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary[600]}
            />
          }
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <GradientIcon size={44}>
                <CreditCard size={22} color={colors.white} strokeWidth={2} />
              </GradientIcon>
              <View style={styles.headerTextCol}>
                <Text style={styles.pageTitle}>Billing & Plans</Text>
                <Text style={styles.pageSubtitle}>Manage your subscription and payments</Text>
              </View>
            </View>
          </View>

          {/* Tab selector */}
          {renderTabSelector()}

          {/* Active tab content */}
          {renderActiveTab()}
        </ScrollView>
      </SafeAreaView>

      {/* Confirm modal */}
      <ConfirmModal
        visible={confirmModal.visible}
        onClose={() => setConfirmModal((prev) => ({ ...prev, visible: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        confirmVariant={confirmModal.variant}
        loading={actionLoading}
      />

      {/* In-app browser for invoices (PDF) and native Stripe pages */}
      <InAppBrowser
        url={browserUrl}
        onClose={handleBrowserRedirect}
        title={browserTitle}
        isPdf={browserTitle === 'Invoice'}
        onRedirect={handleBrowserRedirect}
      />

      {/* Popup waiting overlay (web) — for Stripe portal/checkout */}
      <Modal
        visible={popupOverlay.visible}
        animationType="fade"
        transparent
        onRequestClose={closePopupOverlay}
      >
        <View style={styles.popupBackdrop}>
          <View style={styles.popupCard}>
            <TouchableOpacity onPress={closePopupOverlay} style={styles.popupClose} activeOpacity={0.7}>
              <X size={20} color={colors.slate[500]} strokeWidth={2} />
            </TouchableOpacity>
            <GradientIcon size={56}>
              <ExternalLink size={26} color={colors.white} strokeWidth={2} />
            </GradientIcon>
            <Text style={styles.popupTitle}>{popupOverlay.title}</Text>
            <Text style={styles.popupText}>
              Complete this action in the window that just opened.{'\n'}It will close automatically when done.
            </Text>
            <ActivityIndicator size="small" color={colors.primary[500]} style={{ marginVertical: spacing.sm }} />
            <Button title="I'm Done" onPress={closePopupOverlay} variant="primary" size="md" fullWidth />
          </View>
        </View>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate[50] },
  scroll: { padding: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: 0 },

  // Header
  header: { marginBottom: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerTextCol: { flex: 1 },
  pageTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  pageSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    marginTop: 2,
  },

  // Tab selector
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  tabPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate[100],
  },
  tabPillActive: {
    backgroundColor: colors.primary[600],
  },
  tabPillText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[600],
  },
  tabPillTextActive: {
    color: colors.white,
  },

  // Generic tab content wrapper
  tabContent: {
    gap: spacing.lg,
  },

  // Current plan card
  noPaddingCard: {
    padding: 0,
    overflow: 'hidden',
  },
  currentPlanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  currentPlanIconWrap: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.xl,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentPlanInfo: { flex: 1 },
  currentPlanName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  currentPlanPrice: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
    marginTop: spacing.xs,
  },
  currentPlanPeriod: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.normal,
    color: 'rgba(255,255,255,0.8)',
  },

  // Status row
  statusRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },

  // Info grid (3 columns)
  infoGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
    marginTop: spacing.sm,
  },
  infoCell: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  infoCellBorder: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.slate[100],
  },
  infoCellLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoCellValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },

  // Status alert cards
  alertCardWarning: {
    backgroundColor: colors.warning[50],
    borderWidth: 1,
    borderColor: colors.warning[200],
    gap: spacing.md,
  },
  alertCardError: {
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[200],
    gap: spacing.md,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  alertTextCol: { flex: 1 },
  alertTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.warning[800],
  },
  alertSubtext: {
    fontSize: typography.fontSize.xs,
    color: colors.warning[700],
    marginTop: spacing.xs,
    lineHeight: 18,
  },

  // Action buttons row
  actionRow: {
    gap: spacing.sm,
  },
  actionBtn: {
    width: '100%',
  },

  // Section heading
  sectionHeading: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    marginTop: spacing.sm,
  },

  // Payment card
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  paymentIconWrap: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentInfo: { flex: 1 },
  paymentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  paymentBrand: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  paymentLast4: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
    letterSpacing: 2,
  },
  paymentExpiry: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    marginTop: spacing.xs,
  },

  // Transaction sub-tabs
  subTabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  subTabPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate[100],
  },
  subTabPillActive: {
    backgroundColor: colors.primary[600],
  },
  subTabText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[600],
  },
  subTabTextActive: {
    color: colors.white,
  },

  // Transaction rows
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  txRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
  },
  txLeft: { flex: 1, gap: 2 },
  txRight: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  txDate: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    fontWeight: typography.fontWeight.medium,
  },
  txAmount: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  txMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  viewBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
  },
  centeredEmpty: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },

  // Usage tab extras
  resetNote: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    marginTop: spacing.sm,
  },

  // Upgrade banner
  upgradeBanner: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  upgradeBannerContent: {
    gap: spacing.md,
  },
  upgradeBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  upgradeBannerText: { flex: 1 },
  upgradeBannerTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[800],
  },
  upgradeBannerSubtext: {
    fontSize: typography.fontSize.xs,
    color: colors.primary[700],
    lineHeight: 18,
    marginTop: 2,
  },

  // Popup waiting overlay (web)
  popupBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  popupCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing['2xl'],
    alignItems: 'center',
    maxWidth: 380,
    width: '100%',
    gap: spacing.md,
  },
  popupClose: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    textAlign: 'center',
  },
  popupText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
    lineHeight: 22,
  },
});
