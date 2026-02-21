import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  FileText,
  TrendingUp,
  TrendingDown,
  Settings,
  AlertCircle,
  CheckCircle,
  XCircle,
  Download,
  ExternalLink,
  Crown,
  Zap,
  Receipt,
  BarChart3,
  Calendar,
  Upload
} from 'lucide-react';
import { supabase, getDocuments } from '../lib/supabase';
import { useFeedback } from '../hooks/useFeedback';
import { useSubscription } from '../hooks/useSubscription';
import {
  openCustomerPortal,
  cancelSubscription,
  reactivateSubscription,
  downgradeSubscription,
  createCheckoutSession,
  upgradeSubscription,
  previewUpgrade
} from '../lib/api';
import { formatUTCDate } from '../lib/dateUtils';
import { ConfirmDialog } from './ConfirmDialog';
import { DowngradeComplianceModal } from './DowngradeComplianceModal';
import { ToastContainer } from './Toast';
import { requiresCompliance, PLAN_LIMITS, type PlanId } from '../lib/planLimits';
import { usePricing } from '../hooks/usePricing';

interface BillingPageProps {
  onClose?: () => void;
  onSubscriptionChange?: () => void;
}

type BillingTab = 'subscription' | 'payment-method' | 'transactions' | 'usage';

interface PaymentMethod {
  id: string;
  payment_method_id: string;
  brand: string;
  name_on_card: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
}

interface Invoice {
  id: string;
  invoice_id: string;
  invoice_number: string;
  status: string;
  total: number;
  currency: string;
  invoice_pdf: string;
  hosted_invoice_url: string;
  created_at: string;
  paid_at: string | null;
}

interface Transaction {
  id: string;
  transaction_id: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  receipt_url: string;
  payment_method_brand: string;
  payment_method_last4: string;
  created_at: string;
}

export function BillingPage({ onClose, onSubscriptionChange }: BillingPageProps) {
  const [activeTab, setActiveTab] = useState<BillingTab>('subscription');
  const [isLoading, setIsLoading] = useState(true);
  const { plans } = usePricing();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const feedback = useFeedback();
  const { subscription, documentCount, loading: subscriptionLoading, refreshSubscription } = useSubscription();

  const tabs = [
    { id: 'subscription' as BillingTab, label: 'Subscription', icon: Crown },
    { id: 'payment-method' as BillingTab, label: 'Payment Method', icon: CreditCard },
    { id: 'transactions' as BillingTab, label: 'Transactions', icon: Receipt },
    { id: 'usage' as BillingTab, label: 'Usage', icon: BarChart3 }
  ];

  const loadBillingData = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load payment methods
      const { data: pmData } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('is_default', { ascending: false });

      if (pmData) setPaymentMethods(pmData);

      // Load invoices
      const { data: invData } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (invData) setInvoices(invData);

      // Load transactions
      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (txData) setTransactions(txData);
    } catch (error) {
      console.error('Failed to load billing data:', error);
      feedback.showError('Load failed', 'Unable to load billing information');
    } finally {
      setIsLoading(false);
    }
  }, [feedback]);

  useEffect(() => {
    loadBillingData();
  }, [loadBillingData]);

  const handleManageSubscription = async () => {
    try {
      const { url } = await openCustomerPortal();
      window.location.href = url;
    } catch (error) {
      feedback.showError('Failed to open portal', error instanceof Error ? error.message : 'Please try again');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
      canceling: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
      past_due: { icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
      canceled: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
      trialing: { icon: Zap, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.active;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border ${config.bg} ${config.border}`}>
        <Icon className={`h-4 w-4 ${config.color}`} />
        <span className={`text-sm font-medium ${config.color} capitalize`}>{status.replace('_', ' ')}</span>
      </span>
    );
  };

  const formatCurrency = (amount: number, currency: string = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount / 100);
  };

  const getPlanDetails = (plan: string) => {
    const planData = plans.find(p => p.id === plan);
    const details: Record<string, { name: string; color: string; icon: typeof FileText }> = {
      free: { name: 'Free', color: 'text-slate-600', icon: FileText },
      starter: { name: 'Starter', color: 'text-emerald-600', icon: Zap },
      pro: { name: 'Pro', color: 'text-purple-600', icon: Crown }
    };
    const d = details[plan] || details.free;
    return { ...d, price: planData ? `$${planData.price.monthly}` : '$0' };
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 bg-white px-3 sm:px-8 py-3 sm:py-6">
        <nav className="flex justify-center gap-1 sm:gap-2 max-w-3xl mx-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-6 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === id
                  ? 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-200'
                  : 'bg-gray-50 text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {isLoading || subscriptionLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent"></div>
          </div>
        ) : (
          <div className="p-3 sm:p-8 max-w-6xl mx-auto">
            {/* Manage Subscription Tab */}
            {activeTab === 'subscription' && <ManageSubscriptionTab
              subscription={subscription}
              paymentMethods={paymentMethods}
              onManage={handleManageSubscription}
              getPlanDetails={getPlanDetails}
              getStatusBadge={getStatusBadge}
              refreshSubscription={refreshSubscription}
              documentCount={documentCount}
              onSubscriptionChange={onSubscriptionChange}
              plans={plans}
            />}

            {/* Payment Method Tab */}
            {activeTab === 'payment-method' && <PaymentMethodTab
              paymentMethods={paymentMethods}
              onReload={loadBillingData}
            />}

            {/* Transactions Tab */}
            {activeTab === 'transactions' && <TransactionsTab
              invoices={invoices}
              transactions={transactions}
              formatCurrency={formatCurrency}
            />}

            {/* Usage Tab */}
            {activeTab === 'usage' && <UsageTab
              subscription={subscription}
              documentCount={documentCount}
            />}
          </div>
        )}
      </div>
    </div>
  );
}

// Manage Subscription Tab Component
function ManageSubscriptionTab({ subscription, paymentMethods, onManage, getPlanDetails, getStatusBadge, refreshSubscription, documentCount, onSubscriptionChange, plans }: any) {
  const currentPlan = subscription?.plan || 'free';
  const planDetails = getPlanDetails(currentPlan);
  const PlanIcon = planDetails.icon;
  const defaultPM = paymentMethods.find((pm: PaymentMethod) => pm.is_default);
  const feedback = useFeedback();

  const [isProcessing, setIsProcessing] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showReactivateConfirm, setShowReactivateConfirm] = useState(false);
  const [showPlanChangeConfirm, setShowPlanChangeConfirm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [changeType, setChangeType] = useState<'upgrade' | 'downgrade' | null>(null);
  const [showDowngradeCompliance, setShowDowngradeCompliance] = useState(false);
  const [pendingDowngradePlan, setPendingDowngradePlan] = useState<PlanId | null>(null);
  const [freshDocCount, setFreshDocCount] = useState<number>(documentCount);
  const [upgradePreview, setUpgradePreview] = useState<{ prorated_amount_display?: string; new_plan_price_display?: string } | null>(null);

  const isCanceling = subscription?.status === 'canceling';

  const handleCancelSubscription = async () => {
    setIsProcessing(true);
    setShowCancelConfirm(false);
    try {
      // Check if user has more documents than the free plan limit
      const docs = await getDocuments();
      const actualCount = docs.length;
      setFreshDocCount(actualCount);

      if (requiresCompliance(actualCount, 'free')) {
        // User has more docs than free limit — open document selection modal
        setPendingDowngradePlan('free');
        setShowDowngradeCompliance(true);
        setIsProcessing(false);
        return;
      }

      // Under the limit — proceed with regular cancel
      const result = await cancelSubscription();
      if (result.success) {
        feedback.showSuccess('Subscription Canceling', result.message || 'Your subscription will be canceled at the end of the billing period');
        await refreshSubscription();
      } else {
        feedback.showError('Cancellation Failed', result.error || 'Failed to cancel subscription');
      }
    } catch (error: any) {
      feedback.showError('Error', error.message || 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReactivateSubscription = async () => {
    setIsProcessing(true);
    try {
      const result = await reactivateSubscription();
      if (result.success) {
        feedback.showSuccess('Subscription Reactivated', result.message || 'Your subscription has been reactivated');
        setShowReactivateConfirm(false);
        await refreshSubscription();
      } else {
        feedback.showError('Reactivation Failed', result.error || 'Failed to reactivate subscription');
      }
    } catch (error: any) {
      feedback.showError('Error', error.message || 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlanChange = async () => {
    if (!selectedPlan || !changeType) return;

    setIsProcessing(true);
    try {
      if (changeType === 'upgrade') {
        // Handle upgrade
        if (currentPlan === 'free') {
          // Need to use checkout for free -> paid
          const result = await createCheckoutSession(selectedPlan as 'starter' | 'pro');
          window.location.href = result.url;
          return;
        } else {
          // Upgrade between paid plans — immediate in-place via backend API
          const result = await upgradeSubscription(selectedPlan as 'starter' | 'pro');
          setShowPlanChangeConfirm(false);

          if (result.success) {
            feedback.showSuccess(
              'Plan Upgraded!',
              result.message || `Your plan has been upgraded to ${selectedPlan}. Enjoy your expanded features!`
            );
            await refreshSubscription();
            onSubscriptionChange?.();
          } else {
            feedback.showError('Upgrade Failed', result.error || 'Failed to upgrade plan. Please try again.');
          }
          return;
        }
      } else {
        // Handle downgrade
        const result = await downgradeSubscription(selectedPlan as 'free' | 'starter' | 'pro');
        if (result.success) {
          feedback.showSuccess(
            'Plan Change Scheduled',
            result.message || `Plan will change to ${selectedPlan} at the end of your current billing period`
          );
          setShowPlanChangeConfirm(false);
          await refreshSubscription();
          onSubscriptionChange?.();
        } else {
          feedback.showError('Downgrade Failed', result.error || 'Failed to downgrade plan');
        }
      }
    } catch (error: any) {
      feedback.showError('Error', error.message || 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectPlan = async (planId: string) => {
    if (planId === currentPlan) return;

    setSelectedPlan(planId);

    // Determine if this is an upgrade or downgrade
    const planOrder = { free: 0, starter: 1, pro: 2 };
    const currentOrder = planOrder[currentPlan as keyof typeof planOrder];
    const newOrder = planOrder[planId as keyof typeof planOrder];
    const isDowngrade = newOrder < currentOrder;

    setChangeType(isDowngrade ? 'downgrade' : 'upgrade');
    setUpgradePreview(null);

    if (!isDowngrade && currentPlan !== 'free') {
      // Fetch upgrade preview to show prorated amount before confirming
      setIsProcessing(true);
      try {
        const preview = await previewUpgrade(planId as 'starter' | 'pro');
        if (preview.success && preview.prorated_amount_display && !preview.prorated_amount_display.includes('NaN')) {
          setUpgradePreview(preview);
        }
      } catch {
        // Preview failed — still allow upgrade, just without showing the amount
      } finally {
        setIsProcessing(false);
      }
    }

    if (isDowngrade) {
      // Fetch fresh document count to ensure accurate compliance check
      setIsProcessing(true);
      try {
        const docs = await getDocuments();
        const actualCount = docs.length;
        setFreshDocCount(actualCount);

        if (requiresCompliance(actualCount, planId as PlanId)) {
          setPendingDowngradePlan(planId as PlanId);
          setShowDowngradeCompliance(true);
          return;
        }
      } catch {
        // Fallback to hook count if fresh fetch fails
        if (requiresCompliance(documentCount, planId as PlanId)) {
          setPendingDowngradePlan(planId as PlanId);
          setShowDowngradeCompliance(true);
          return;
        }
      } finally {
        setIsProcessing(false);
      }
    }

    setShowPlanChangeConfirm(true);
  };

  const getPlanChangeMessage = () => {
    if (!selectedPlan || !changeType) return '';

    const plan = plans.find(p => p.id === selectedPlan);
    if (!plan) return '';

    if (changeType === 'upgrade') {
      if (currentPlan === 'free') {
        return `You'll be redirected to checkout to complete your upgrade to the ${plan.name} plan ($${plan.price.monthly}/month).`;
      }
      return `Your plan will be upgraded to ${plan.name} ($${plan.price.monthly}/month) immediately. You'll only be charged the prorated difference for the remaining billing period.`;
    } else {
      if (selectedPlan === 'free') {
        return `Your subscription will be canceled at the end of your current billing period. You'll retain access to ${planDetails.name} features until ${subscription?.current_period_end ? formatUTCDate(subscription.current_period_end) : 'the end of the period'}.`;
      }
      return `Your plan will be downgraded to ${plan.name} ($${plan.price.monthly}/month) at the end of your current billing period on ${subscription?.current_period_end ? formatUTCDate(subscription.current_period_end) : 'the period end date'}. You'll retain access to ${planDetails.name} features until then.`;
    }
  };

  return (
    <div className="space-y-8">
      {/* Current Subscription Overview */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-600 px-4 sm:px-8 py-4 sm:py-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-emerald-100 text-xs sm:text-sm font-medium mb-1 sm:mb-2">Current Plan</p>
              <div className="flex items-center gap-2 sm:gap-3">
                <PlanIcon className="h-6 w-6 sm:h-8 sm:w-8 text-white flex-shrink-0" />
                <h2 className="text-2xl sm:text-3xl font-bold text-white">{planDetails.name}</h2>
              </div>
              <p className="text-white/90 text-base sm:text-lg mt-1">{planDetails.price}/month</p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl flex-shrink-0">
              {getStatusBadge(subscription?.status || 'active')}
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-8">
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
            {subscription?.current_period_end && (
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-5 border border-blue-100">
                <div className="flex items-center gap-3 mb-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <p className="text-sm font-semibold text-blue-900">Next Renewal</p>
                </div>
                <p className="text-xl font-bold text-blue-900">{formatUTCDate(subscription.current_period_end)}</p>
              </div>
            )}

            {defaultPM && (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5 border border-purple-100">
                <div className="flex items-center gap-3 mb-2">
                  <CreditCard className="h-5 w-5 text-purple-600" />
                  <p className="text-sm font-semibold text-purple-900">Payment Method</p>
                </div>
                <p className="text-lg font-bold text-purple-900">{defaultPM.brand}</p>
                <p className="text-sm text-purple-700">•••• {defaultPM.last4}</p>
              </div>
            )}

            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-5 border border-emerald-100">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="h-5 w-5 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-900">Document Limit</p>
              </div>
              <p className="text-xl font-bold text-emerald-900">
                {currentPlan === 'free' ? '5' : currentPlan === 'starter' ? '25' : '100'} documents
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            {currentPlan !== 'free' && !isCanceling && !subscription?.pending_plan && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                disabled={isProcessing}
                className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 px-6 py-3 rounded-lg font-medium transition-all border-2 border-red-300 disabled:opacity-50"
              >
                Cancel Subscription
              </button>
            )}
            {(isCanceling || subscription?.pending_plan) && (
              <button
                onClick={() => setShowReactivateConfirm(true)}
                disabled={isProcessing}
                className="flex-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-6 py-3 rounded-lg font-medium transition-all border-2 border-emerald-300 disabled:opacity-50"
              >
                {subscription?.pending_plan ? 'Cancel Downgrade' : 'Reactivate Subscription'}
              </button>
            )}
            {currentPlan !== 'free' && (
              <button
                onClick={onManage}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white px-6 py-3 rounded-lg font-medium transition-all shadow-md hover:shadow-lg"
              >
                Update Payment Method
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status Alerts */}
      {subscription?.status === 'past_due' && (
        <div className="bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-300 rounded-2xl p-6 shadow-lg">
          <div className="flex items-start gap-4">
            <div className="bg-orange-100 p-3 rounded-xl">
              <AlertCircle className="h-6 w-6 text-orange-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-xl font-bold text-orange-900 mb-2">Payment Failed</h4>
              <p className="text-orange-800 mb-4">
                We couldn't process your payment. Please update your payment method to continue your subscription.
              </p>
              <button
                onClick={onManage}
                className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2 rounded-lg font-medium transition-all shadow-md text-sm"
              >
                Update Payment Method
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scheduled Downgrade Banner */}
      {subscription?.pending_plan && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-2xl p-6 shadow-lg">
          <div className="flex items-start gap-4">
            <div className="bg-blue-100 p-3 rounded-xl">
              <TrendingDown className="h-6 w-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-xl font-bold text-blue-900 mb-2">Downgrade Scheduled</h4>
              <p className="text-blue-800 mb-2">
                Your plan will change from <strong className="capitalize">{currentPlan}</strong> to{' '}
                <strong className="capitalize">{subscription.pending_plan}</strong> on{' '}
                {subscription?.current_period_end ? formatUTCDate(subscription.current_period_end) : 'the end of your billing period'}.
              </p>
              {subscription.documents_to_keep && subscription.documents_to_keep.length > 0 && (
                <p className="text-sm text-blue-700 mb-4">
                  {subscription.documents_to_keep.length} document{subscription.documents_to_keep.length !== 1 ? 's' : ''} will be kept. Documents not selected will be removed when the downgrade takes effect.
                </p>
              )}
              {!subscription.documents_to_keep && (
                <p className="text-sm text-blue-700 mb-4">
                  You'll retain access to your current plan features until the downgrade takes effect.
                </p>
              )}
              <button
                onClick={() => setShowReactivateConfirm(true)}
                disabled={isProcessing}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium transition-all shadow-md text-sm disabled:opacity-50"
              >
                Cancel Downgrade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Banner (only when no pending_plan — pure cancel) */}
      {isCanceling && !subscription?.pending_plan && (
        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-300 rounded-2xl p-6 shadow-lg">
          <div className="flex items-start gap-4">
            <div className="bg-amber-100 p-3 rounded-xl">
              <AlertCircle className="h-6 w-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-xl font-bold text-amber-900 mb-2">Cancellation Scheduled</h4>
              <p className="text-amber-800 mb-4">
                Your subscription will end on {subscription?.current_period_end ? formatUTCDate(subscription.current_period_end) : 'the end of your billing period'}. You'll retain access to your current plan features until then.
              </p>
              <button
                onClick={() => setShowReactivateConfirm(true)}
                disabled={isProcessing}
                className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-lg font-medium transition-all shadow-md text-sm disabled:opacity-50"
              >
                Reactivate Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {subscription?.status === 'canceled' && (
        <div className="bg-gradient-to-br from-red-50 to-pink-50 border-2 border-red-300 rounded-2xl p-6 shadow-lg">
          <div className="flex items-start gap-4">
            <div className="bg-red-100 p-3 rounded-xl">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-xl font-bold text-red-900 mb-2">Subscription Canceled</h4>
              <p className="text-red-800 mb-4">
                Your subscription has been canceled. Reactivate to continue using premium features.
              </p>
              <button
                onClick={() => setShowReactivateConfirm(true)}
                disabled={isProcessing}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg font-medium transition-all shadow-md text-sm disabled:opacity-50"
              >
                Reactivate Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Available Plans */}
      <div>
        <div className="mb-6">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Available Plans</h3>
          <p className="text-gray-600">Choose the plan that fits your needs</p>
          {(isCanceling || subscription?.pending_plan) && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                {subscription?.pending_plan
                  ? <>A downgrade to <strong className="capitalize">{subscription.pending_plan}</strong> is already scheduled. To change plans, please <strong>cancel the downgrade</strong> first.</>
                  : <>Your subscription is scheduled to cancel. To change plans, please <strong>reactivate your subscription</strong> first.</>
                }
              </p>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrentPlan = currentPlan === plan.id;
            const planOrder = { free: 0, starter: 1, pro: 2 };
            const isUpgrade = planOrder[plan.id as keyof typeof planOrder] > planOrder[currentPlan as keyof typeof planOrder];
            const hasPendingChange = isCanceling || !!subscription?.pending_plan;
            const isPlanDisabled = isCurrentPlan || isProcessing || hasPendingChange;

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-2xl p-6 border-2 transition-all ${
                  isCurrentPlan
                    ? 'border-emerald-500 shadow-2xl ring-4 ring-emerald-100'
                    : hasPendingChange
                    ? 'border-gray-200 opacity-60'
                    : 'border-gray-200 hover:border-emerald-300 hover:shadow-xl'
                }`}
              >
                {isCurrentPlan && (
                  <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold px-4 py-1.5 rounded-full inline-block mb-4">
                    CURRENT PLAN
                  </div>
                )}

                <div className="mb-6">
                  <h4 className="text-2xl font-bold text-gray-900 mb-1">{plan.name}</h4>
                  <p className="text-gray-600 text-sm mb-4">{plan.description}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-gray-900">${plan.price.monthly}</span>
                    <span className="text-gray-600 text-base">/month</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.filter(f => f.included).map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700">{feature.text}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => !isPlanDisabled && handleSelectPlan(plan.id)}
                  disabled={isPlanDisabled}
                  className={`w-full py-2.5 rounded-lg font-medium transition-all text-sm ${
                    isPlanDisabled
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : isUpgrade
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md hover:shadow-lg'
                      : 'bg-gray-600 hover:bg-gray-700 text-white shadow-md hover:shadow-lg'
                  }`}
                >
                  {isCurrentPlan ? '✓ Current Plan' : isUpgrade ? 'Upgrade' : 'Downgrade'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        onCancel={() => !isProcessing && setShowCancelConfirm(false)}
        onConfirm={handleCancelSubscription}
        title="Cancel Subscription?"
        message={`Your subscription will remain active until ${subscription?.current_period_end ? formatUTCDate(subscription.current_period_end) : 'the end of your billing period'}. After that, your account will be downgraded to the free plan.`}
        confirmText="Yes, Cancel Subscription"
        cancelText="Keep Subscription"
        confirmVariant="danger"
        isLoading={isProcessing}
      />

      <ConfirmDialog
        isOpen={showReactivateConfirm}
        onCancel={() => !isProcessing && setShowReactivateConfirm(false)}
        onConfirm={handleReactivateSubscription}
        title="Reactivate Subscription?"
        message="Your subscription will continue and you'll be charged on the next billing date."
        confirmText="Yes, Reactivate"
        cancelText="No, Keep Canceled"
        confirmVariant="primary"
        isLoading={isProcessing}
      />

      <ConfirmDialog
        isOpen={showPlanChangeConfirm}
        onCancel={() => {
          if (isProcessing) return;
          setShowPlanChangeConfirm(false);
          setSelectedPlan(null);
          setChangeType(null);
        }}
        onConfirm={handlePlanChange}
        title={changeType === 'upgrade' ? 'Upgrade Plan?' : 'Downgrade Plan?'}
        message={
          changeType === 'upgrade'
            ? currentPlan === 'free'
              ? `You'll be redirected to Stripe to complete your upgrade. Your renewal date will be set after checkout.`
              : upgradePreview?.prorated_amount_display
                ? `You'll be charged ${upgradePreview.prorated_amount_display} now for the prorated difference, then ${upgradePreview.new_plan_price_display}/month starting next billing cycle.`
                : `Your plan will be upgraded immediately. The prorated difference will be charged to your card on file right away.`
            : `Your plan will be downgraded to ${selectedPlan} at the end of your current billing period (${subscription?.current_period_end ? formatUTCDate(subscription.current_period_end) : 'current date'}). You'll keep your current plan features until then.`
        }
        confirmText={changeType === 'upgrade' ? (currentPlan === 'free' ? 'Continue to Checkout' : 'Upgrade Now') : 'Schedule Downgrade'}
        cancelText="Cancel"
        confirmVariant={changeType === 'downgrade' ? 'danger' : 'primary'}
        isLoading={isProcessing}
      />

      {pendingDowngradePlan && (
        <DowngradeComplianceModal
          isOpen={showDowngradeCompliance}
          onClose={() => {
            setShowDowngradeCompliance(false);
            setPendingDowngradePlan(null);
            setSelectedPlan(null);
            setChangeType(null);
          }}
          onSuccess={() => {
            setShowDowngradeCompliance(false);
            setPendingDowngradePlan(null);
            setSelectedPlan(null);
            setChangeType(null);
            refreshSubscription();
            feedback.showSuccess('Downgrade Scheduled', `Your plan will change to ${PLAN_LIMITS[pendingDowngradePlan].name} at the end of your billing period.`);
          }}
          currentPlan={currentPlan as PlanId}
          targetPlan={pendingDowngradePlan}
          currentDocumentCount={freshDocCount}
          targetDocumentLimit={PLAN_LIMITS[pendingDowngradePlan].documents}
        />
      )}

      <ToastContainer toasts={feedback.toasts} onClose={feedback.removeToast} />
    </div>
  );
}

// Payment Method Tab Component
function PaymentMethodTab({ paymentMethods, onReload }: any) {
  const defaultPM = paymentMethods.find((pm: PaymentMethod) => pm.is_default);
  const otherMethods = paymentMethods.filter((pm: PaymentMethod) => !pm.is_default);

  const handleManagePayment = async () => {
    try {
      const { url } = await openCustomerPortal();
      window.location.href = url;
    } catch (error) {
      console.error('Failed to open portal:', error);
    }
  };

  const getCardIcon = (brand: string) => {
    const brandLower = brand.toLowerCase();
    const colors = {
      'visa': 'text-blue-600 bg-blue-50',
      'mastercard': 'text-orange-600 bg-orange-50',
      'amex': 'text-cyan-600 bg-cyan-50',
      'discover': 'text-purple-600 bg-purple-50',
      'default': 'text-gray-600 bg-gray-100'
    };
    return colors[brandLower as keyof typeof colors] || colors.default;
  };

  return (
    <div className="space-y-6">
      {paymentMethods.length > 0 ? (
        <>
          {/* Default Payment Method */}
          {defaultPM && (
            <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-8 py-4">
                <h3 className="text-lg sm:text-xl font-bold text-white">Active Payment Method</h3>
              </div>

              <div className="p-4 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6 mb-6 sm:mb-8">
                  <div className="flex items-center gap-4 sm:gap-6">
                    <div className={`${getCardIcon(defaultPM.brand)} rounded-xl sm:rounded-2xl p-3 sm:p-5 flex-shrink-0`}>
                      <CreditCard className="h-7 w-7 sm:h-10 sm:w-10" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Card Brand</p>
                      <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 capitalize">{defaultPM.brand}</p>
                      <p className="text-xl sm:text-3xl font-mono text-gray-700 tracking-wider">•••• {defaultPM.last4}</p>
                      {defaultPM.name_on_card && (
                        <p className="text-sm text-gray-600 mt-2">
                          <span className="font-semibold">Cardholder:</span> {defaultPM.name_on_card}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-4">
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl px-4 py-2 inline-block">
                      <p className="text-xs font-semibold text-green-700 uppercase">Default</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl px-4 sm:px-5 py-2 sm:py-3 border border-gray-200">
                      <p className="text-xs text-gray-600 mb-0.5">Expires</p>
                      <p className="text-lg sm:text-2xl font-bold text-gray-900">
                        {String(defaultPM.exp_month).padStart(2, '0')}/{defaultPM.exp_year}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleManagePayment}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-6 py-3 rounded-lg font-medium transition-all shadow-md hover:shadow-lg"
                >
                  Manage Payment Methods in Stripe
                </button>
              </div>
            </div>
          )}

          {/* Other Payment Methods */}
          {otherMethods.length > 0 && (
            <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Other Payment Methods</h3>
              <div className="space-y-4">
                {otherMethods.map((pm: PaymentMethod) => (
                  <div
                    key={pm.id}
                    className="flex items-center justify-between p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 hover:border-gray-300 transition-all"
                  >
                    <div className="flex items-center gap-5">
                      <div className={`${getCardIcon(pm.brand)} rounded-xl p-3`}>
                        <CreditCard className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 capitalize text-lg">{pm.brand}</p>
                        <p className="text-gray-600 font-mono">•••• {pm.last4}</p>
                        <p className="text-sm text-gray-500 mt-1">Expires {pm.exp_month}/{pm.exp_year}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleManagePayment}
                      className="text-emerald-600 hover:text-emerald-700 font-semibold px-4 py-2 rounded-lg hover:bg-emerald-50 transition-all"
                    >
                      Manage
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-16 text-center shadow-lg">
          <div className="bg-gray-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
            <CreditCard className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3">No Payment Method Added</h3>
          <p className="text-gray-600 mb-8 max-w-md mx-auto">
            Add a payment method to subscribe to a paid plan and unlock premium features
          </p>
          <button
            onClick={handleManagePayment}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-6 py-3 rounded-lg font-medium transition-all shadow-md hover:shadow-lg inline-flex items-center gap-2"
          >
            <CreditCard className="h-5 w-5" />
            Add Payment Method
          </button>
        </div>
      )}

      {/* Security Notice */}
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="bg-blue-100 p-2 rounded-lg">
            <CheckCircle className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h4 className="font-semibold text-blue-900 mb-1">Secure Payment Processing</h4>
            <p className="text-sm text-blue-800">
              All payment information is securely processed and stored by Stripe. We never store your complete card details on our servers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Transactions Tab Component
function TransactionsTab({ invoices, transactions, formatCurrency }: any) {
  const [activeSection, setActiveSection] = useState<'invoices' | 'payments'>('invoices');

  return (
    <div className="space-y-6">
      {/* Section Toggle */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 p-1.5 sm:p-2 inline-flex gap-1.5 sm:gap-2 shadow-lg">
        <button
          onClick={() => setActiveSection('invoices')}
          className={`px-3 sm:px-6 py-2 sm:py-3 rounded-xl font-semibold text-sm transition-all ${
            activeSection === 'invoices'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            <span>Invoices</span>
            {invoices.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeSection === 'invoices' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {invoices.length}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => setActiveSection('payments')}
          className={`px-3 sm:px-6 py-2 sm:py-3 rounded-xl font-semibold text-sm transition-all ${
            activeSection === 'payments'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            <span>Payments</span>
            {transactions.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeSection === 'payments' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {transactions.length}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Invoices Section */}
      {activeSection === 'invoices' && (
        <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-8 py-4 sm:py-5">
            <div className="flex items-center gap-3">
              <Receipt className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              <h3 className="text-lg sm:text-xl font-bold text-white">Invoices</h3>
            </div>
          </div>
          {invoices.length > 0 ? (
            <div className="p-3 sm:p-6 space-y-3">
              {invoices.map((invoice: Invoice) => (
                <div
                  key={invoice.id}
                  className="p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200 rounded-xl hover:border-emerald-300 hover:shadow-md transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0">
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Date</p>
                        <p className="text-sm font-semibold text-gray-900">{formatUTCDate(invoice.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Amount</p>
                        <p className="text-base sm:text-lg font-bold text-gray-900">{formatCurrency(invoice.total, invoice.currency)}</p>
                      </div>
                      <div className="hidden sm:block">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Invoice #</p>
                        <p className="text-sm font-mono text-gray-900 truncate">{invoice.invoice_number || invoice.invoice_id.substring(0, 12)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Status</p>
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                          invoice.status === 'paid'
                            ? 'bg-green-100 text-green-700 border border-green-300'
                            : invoice.status === 'open'
                            ? 'bg-blue-100 text-blue-700 border border-blue-300'
                            : 'bg-gray-100 text-gray-700 border border-gray-300'
                        }`}>
                          {invoice.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 sm:ml-6">
                      {invoice.hosted_invoice_url && (
                        <a
                          href={invoice.hosted_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 transition-all"
                        >
                          View <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </a>
                      )}
                      {invoice.invoice_pdf && (
                        <a
                          href={invoice.invoice_pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 transition-all"
                        >
                          PDF <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Receipt className="h-10 w-10 text-gray-400" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">No Invoices Yet</h4>
              <p className="text-gray-600">Your invoices will appear here once you subscribe to a plan</p>
            </div>
          )}
        </div>
      )}

      {/* Payments Section */}
      {activeSection === 'payments' && (
        <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-8 py-4 sm:py-5">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              <h3 className="text-lg sm:text-xl font-bold text-white">Payment History</h3>
            </div>
          </div>
          {transactions.length > 0 ? (
            <div className="p-3 sm:p-6 space-y-3">
              {transactions.map((tx: Transaction) => (
                <div
                  key={tx.id}
                  className="p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200 rounded-xl hover:border-emerald-300 hover:shadow-md transition-all"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Date</p>
                      <p className="text-sm font-semibold text-gray-900">{formatUTCDate(tx.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Amount</p>
                      <p className="text-base sm:text-lg font-bold text-gray-900">{formatCurrency(tx.amount, tx.currency)}</p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Method</p>
                      {tx.payment_method_brand && tx.payment_method_last4 ? (
                        <p className="text-sm text-gray-900 capitalize">{tx.payment_method_brand} •••• {tx.payment_method_last4}</p>
                      ) : (
                        <p className="text-sm text-gray-500">N/A</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Status</p>
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                        tx.status === 'succeeded'
                          ? 'bg-green-100 text-green-700 border border-green-300'
                          : tx.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                          : 'bg-red-100 text-red-700 border border-red-300'
                      }`}>
                        {tx.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CreditCard className="h-10 w-10 text-gray-400" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">No Payments Yet</h4>
              <p className="text-gray-600">Your payment history will appear here once you make payments</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Usage Tab Component
function UsageTab({ subscription, documentCount }: any) {
  const docUsagePercent = subscription
    ? Math.min((documentCount / subscription.document_limit) * 100, 100)
    : 0;

  const aiUsagePercent = subscription?.ai_questions_limit >= 999999
    ? 0
    : Math.min((subscription?.ai_questions_used / subscription?.ai_questions_limit) * 100, 100);

  const isUnlimited = subscription?.ai_questions_limit >= 999999;

  const monthlyUploadLimit = subscription?.monthly_upload_limit || 3;
  const monthlyUploadsUsed = subscription?.monthly_uploads_used || 0;
  const uploadUsagePercent = Math.min((monthlyUploadsUsed / monthlyUploadLimit) * 100, 100);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Documents Usage Card */}
        <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-600 px-4 sm:px-8 py-4 sm:py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-xs sm:text-sm font-semibold mb-1">Document Storage</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl sm:text-4xl font-bold text-white">{documentCount}</h3>
                  <span className="text-emerald-100 text-lg sm:text-2xl">/ {subscription?.document_limit || 3}</span>
                </div>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3">
                <FileText className="h-8 w-8 text-white" />
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-8">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-600">Usage</span>
                <span className="text-sm font-bold text-gray-900">{docUsagePercent.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div
                  className={`h-4 rounded-full transition-all duration-500 ${
                    docUsagePercent >= 90
                      ? 'bg-gradient-to-r from-red-500 to-orange-500'
                      : docUsagePercent >= 70
                      ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600'
                  }`}
                  style={{ width: `${docUsagePercent}%` }}
                />
              </div>
            </div>

            {docUsagePercent >= 90 ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-900 mb-1">Storage Almost Full</p>
                    <p className="text-xs text-red-800">You're running low on document storage. Consider upgrading your plan.</p>
                  </div>
                </div>
              </div>
            ) : docUsagePercent >= 70 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-900 mb-1">Approaching Limit</p>
                    <p className="text-xs text-yellow-800">You've used {docUsagePercent.toFixed(0)}% of your document storage.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-900 mb-1">Looking Good</p>
                    <p className="text-xs text-emerald-800">You have plenty of storage remaining.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Questions Usage Card */}
        <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-br from-purple-600 to-pink-600 px-4 sm:px-8 py-4 sm:py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-xs sm:text-sm font-semibold mb-1">AI Questions</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl sm:text-4xl font-bold text-white">{subscription?.ai_questions_used || 0}</h3>
                  {!isUnlimited && (
                    <span className="text-purple-100 text-2xl">/ {subscription?.ai_questions_limit || 5}</span>
                  )}
                  {isUnlimited && (
                    <span className="text-purple-100 text-2xl">/ ∞</span>
                  )}
                </div>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3">
                <Zap className="h-8 w-8 text-white" />
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-8">
            {!isUnlimited ? (
              <>
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-600">Usage This Month</span>
                    <span className="text-sm font-bold text-gray-900">{aiUsagePercent.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div
                      className={`h-4 rounded-full transition-all duration-500 ${
                        aiUsagePercent >= 90
                          ? 'bg-gradient-to-r from-red-500 to-orange-500'
                          : aiUsagePercent >= 70
                          ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                          : 'bg-gradient-to-r from-purple-600 to-pink-600'
                      }`}
                      style={{ width: `${aiUsagePercent}%` }}
                    />
                  </div>
                </div>

                {subscription?.ai_questions_reset_date && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      <p className="text-sm text-blue-900">
                        <span className="font-semibold">Resets:</span> {formatUTCDate(subscription.ai_questions_reset_date)}
                      </p>
                    </div>
                  </div>
                )}

                {aiUsagePercent >= 90 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-red-900 mb-1">Limit Almost Reached</p>
                        <p className="text-xs text-red-800">Upgrade for unlimited AI questions.</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-purple-100 p-2 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-purple-600" />
                  </div>
                  <p className="text-sm font-bold text-purple-900">Unlimited Questions</p>
                </div>
                <p className="text-xs text-purple-800">
                  You have unlimited AI questions with your {subscription?.plan || 'current'} plan. Ask away!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Monthly Uploads Usage Card */}
        <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-br from-blue-600 to-cyan-600 px-4 sm:px-8 py-4 sm:py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-xs sm:text-sm font-semibold mb-1">Monthly Uploads</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl sm:text-4xl font-bold text-white">{monthlyUploadsUsed}</h3>
                  <span className="text-blue-100 text-2xl">/ {monthlyUploadLimit}</span>
                </div>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3">
                <Upload className="h-8 w-8 text-white" />
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-8">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-600">Usage This Month</span>
                <span className="text-sm font-bold text-gray-900">{uploadUsagePercent.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div
                  className={`h-4 rounded-full transition-all duration-500 ${
                    uploadUsagePercent >= 90
                      ? 'bg-gradient-to-r from-red-500 to-orange-500'
                      : uploadUsagePercent >= 70
                      ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                      : 'bg-gradient-to-r from-blue-600 to-cyan-600'
                  }`}
                  style={{ width: `${uploadUsagePercent}%` }}
                />
              </div>
            </div>

            {subscription?.monthly_upload_reset_date && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <p className="text-sm text-blue-900">
                    <span className="font-semibold">Resets:</span> {formatUTCDate(subscription.monthly_upload_reset_date)}
                  </p>
                </div>
              </div>
            )}

            {uploadUsagePercent >= 90 ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-900 mb-1">Upload Quota Almost Reached</p>
                    <p className="text-xs text-red-800">Upgrade for more monthly uploads.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900 mb-1">Uploads Available</p>
                    <p className="text-xs text-blue-800">{monthlyUploadLimit - monthlyUploadsUsed} uploads remaining this month.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upgrade Recommendation */}
      {(docUsagePercent >= 80 || aiUsagePercent >= 80 || uploadUsagePercent >= 80) && subscription?.plan !== 'pro' && (
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-300 rounded-2xl p-4 sm:p-8 shadow-xl">
          <div className="flex items-start gap-4 sm:gap-6">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-600 p-3 sm:p-4 rounded-2xl flex-shrink-0">
              <Crown className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="text-2xl font-bold text-emerald-900 mb-3">Ready to Upgrade?</h4>
              <p className="text-emerald-800 mb-6 text-lg">
                You're getting close to your limits. Upgrade now to unlock more storage and unlimited AI questions.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={async () => {
                    const { url } = await openCustomerPortal();
                    window.location.href = url;
                  }}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-6 py-3 rounded-lg font-medium transition-all shadow-md hover:shadow-lg"
                >
                  View Plans
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Usage Summary */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-8 shadow-xl">
        <h3 className="text-xl font-bold text-gray-900 mb-6">Plan Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
          <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-gray-600 mb-2">Current Plan</p>
            <p className="text-2xl font-bold text-gray-900 capitalize">{subscription?.plan || 'Free'}</p>
          </div>
          <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-gray-600 mb-2">Documents Used</p>
            <p className="text-2xl font-bold text-gray-900">
              {documentCount} / {subscription?.document_limit || 3}
            </p>
          </div>
          <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-gray-600 mb-2">Monthly Uploads</p>
            <p className="text-2xl font-bold text-gray-900">
              {monthlyUploadsUsed} / {monthlyUploadLimit}
            </p>
          </div>
          <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-gray-600 mb-2">AI Questions</p>
            <p className="text-2xl font-bold text-gray-900">
              {isUnlimited ? 'Unlimited' : `${subscription?.ai_questions_used || 0} / ${subscription?.ai_questions_limit || 5}`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
