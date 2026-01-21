import React, { useState } from 'react';
import { Check, X, Zap, Crown, Building2, ArrowLeft } from 'lucide-react';

interface PricingPageProps {
  onBack: () => void;
  onSelectPlan: (plan: 'free' | 'starter' | 'pro' | 'business') => void;
  currentPlan?: 'free' | 'starter' | 'pro' | 'business';
}

export function PricingPage({ onBack, onSelectPlan, currentPlan = 'free' }: PricingPageProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const plans = [
    {
      id: 'free' as const,
      name: 'Free',
      icon: Zap,
      price: { monthly: 0, yearly: 0 },
      description: 'Perfect for trying out DocuIntelli AI',
      features: [
        { text: '2 documents', included: true },
        { text: '5 AI questions per month', included: true },
        { text: 'Basic expiration tracking', included: true },
        { text: 'Single device access', included: true },
        { text: 'Email notifications', included: false },
        { text: 'Priority processing', included: false },
        { text: 'OCR for images', included: false },
        { text: 'Priority support', included: false },
      ],
      cta: 'Current Plan',
      popular: false,
      comingSoon: false,
    },
    {
      id: 'starter' as const,
      name: 'Starter',
      icon: Zap,
      price: { monthly: 5, yearly: 50 },
      description: 'For light personal use',
      features: [
        { text: '25 documents', included: true },
        { text: '50 AI questions per month', included: true },
        { text: 'Smart expiration reminders', included: true },
        { text: 'All devices sync', included: true },
        { text: 'Email notifications', included: true },
        { text: 'OCR for images', included: true },
        { text: 'Priority processing', included: false },
        { text: 'Priority support', included: false },
      ],
      cta: 'Upgrade to Starter',
      popular: false,
      comingSoon: false,
    },
    {
      id: 'pro' as const,
      name: 'Pro',
      icon: Crown,
      price: { monthly: 15, yearly: 150 },
      description: 'For individuals and families',
      features: [
        { text: '100 documents', included: true },
        { text: '200 AI questions per month', included: true },
        { text: 'Smart expiration reminders', included: true },
        { text: 'All devices sync', included: true },
        { text: 'Email notifications', included: true },
        { text: 'Priority processing', included: true },
        { text: 'OCR for images', included: true },
        { text: 'Priority support', included: true },
      ],
      cta: 'Upgrade to Pro',
      popular: true,
      comingSoon: false,
    },
    {
      id: 'business' as const,
      name: 'Business',
      icon: Building2,
      price: { monthly: 29, yearly: 290 },
      description: 'For teams and businesses',
      features: [
        { text: 'Everything in Pro', included: true },
        { text: '500 AI questions per month', included: true },
        { text: 'Team sharing (5 members)', included: true },
        { text: 'Bulk document upload', included: true },
        { text: 'Advanced analytics', included: true },
        { text: 'Custom integrations', included: true },
        { text: 'Dedicated support', included: true },
        { text: 'SLA guarantee', included: true },
      ],
      cta: 'Coming Soon',
      popular: false,
      comingSoon: true,
    },
  ];

  const getPrice = (plan: typeof plans[0]) => {
    const price = billingCycle === 'monthly' ? plan.price.monthly : plan.price.yearly;
    return price;
  };

  const getSavings = (plan: typeof plans[0]) => {
    if (billingCycle === 'yearly' && plan.price.monthly > 0) {
      const yearlySavings = (plan.price.monthly * 12) - plan.price.yearly;
      return Math.round((yearlySavings / (plan.price.monthly * 12)) * 100);
    }
    return 0;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-700 hover:text-emerald-600 font-medium transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back to Dashboard</span>
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <div className="relative overflow-hidden py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.05),transparent_50%)]"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 mb-4 tracking-tight">
            Choose Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600">Plan</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
            Start free and upgrade anytime. All plans include our core document management features.
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2 rounded-lg font-medium transition-all relative ${
                billingCycle === 'yearly'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Yearly
              <span className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                Save 17%
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const price = getPrice(plan);
            const savings = getSavings(plan);
            const isCurrentPlan = currentPlan === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl shadow-lg border-2 transition-all duration-300 hover:shadow-2xl ${
                  plan.popular
                    ? 'border-emerald-500 scale-105'
                    : 'border-slate-200 hover:border-emerald-300'
                } ${plan.comingSoon ? 'opacity-75' : ''}`}
              >
                {plan.popular && !plan.comingSoon && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-lg">
                      Most Popular
                    </span>
                  </div>
                )}
                {plan.comingSoon && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-lg">
                      Coming Soon
                    </span>
                  </div>
                )}

                <div className="p-8">
                  {/* Icon and Name */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-3 rounded-xl ${
                      plan.popular
                        ? 'bg-gradient-to-br from-emerald-100 to-teal-100'
                        : 'bg-slate-100'
                    }`}>
                      <Icon className={`h-6 w-6 ${
                        plan.popular ? 'text-emerald-600' : 'text-slate-600'
                      }`} />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900">{plan.name}</h3>
                  </div>

                  {/* Price */}
                  <div className="mb-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-bold text-slate-900">${price}</span>
                      {plan.price.monthly > 0 && (
                        <span className="text-slate-500">
                          /{billingCycle === 'monthly' ? 'mo' : 'yr'}
                        </span>
                      )}
                    </div>
                    {savings > 0 && (
                      <p className="text-sm text-emerald-600 font-medium mt-1">
                        Save {savings}% with yearly billing
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-slate-600 mb-6">{plan.description}</p>

                  {/* CTA Button */}
                  <button
                    onClick={() => !plan.comingSoon && onSelectPlan(plan.id)}
                    disabled={isCurrentPlan || plan.comingSoon}
                    className={`w-full py-3 px-6 rounded-xl font-semibold transition-all duration-200 ${
                      isCurrentPlan || plan.comingSoon
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : plan.popular
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 shadow-md hover:shadow-xl transform hover:-translate-y-0.5'
                        : 'bg-slate-900 text-white hover:bg-slate-800 shadow-md hover:shadow-xl'
                    }`}
                  >
                    {isCurrentPlan ? 'Current Plan' : plan.cta}
                  </button>

                  {/* Features */}
                  <div className="mt-8 space-y-3">
                    {plan.features.map((feature, index) => (
                      <div key={index} className="flex items-start gap-3">
                        {feature.included ? (
                          <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <X className="h-5 w-5 text-slate-300 flex-shrink-0 mt-0.5" />
                        )}
                        <span className={`text-sm ${
                          feature.included ? 'text-slate-700' : 'text-slate-400'
                        }`}>
                          {feature.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="mt-20 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-8 text-center">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Can I upgrade or downgrade at any time?
              </h3>
              <p className="text-slate-600">
                Yes! You can change your plan anytime. If you upgrade, you'll be charged the prorated amount.
                If you downgrade, the change takes effect at the end of your current billing period.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                What happens if I exceed my limits?
              </h3>
              <p className="text-slate-600">
                On the Free plan, you'll be prompted to upgrade. On Pro, you can purchase additional AI question packs.
                Business plan has unlimited AI questions.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Is my payment information secure?
              </h3>
              <p className="text-slate-600">
                Absolutely. We use Stripe for payment processing, which is PCI-DSS compliant and trusted by millions of businesses worldwide.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Can I cancel my subscription?
              </h3>
              <p className="text-slate-600">
                Yes, you can cancel anytime. You'll continue to have access to paid features until the end of your billing period,
                then automatically move to the Free plan.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
