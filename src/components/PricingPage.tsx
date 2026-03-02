import React, { useState } from 'react';
import { Check, X, ArrowLeft, ChevronDown } from 'lucide-react';
import { usePricing } from '../hooks/usePricing';
import type { PlanData } from '../lib/planLimits';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSection {
  title: string;
  items: FAQItem[];
}

function getFAQSections(plans: PlanData[]): FAQSection[] {
  const starter = plans.find(p => p.id === 'starter')!;
  const pro = plans.find(p => p.id === 'pro')!;
  return [
  {
    title: 'Plans & Billing',
    items: [
      {
        question: 'Can I upgrade or downgrade at any time?',
        answer: "Yes! You can change your plan anytime from the Billing page. Upgrades take effect immediately and you'll be charged a prorated amount for the remainder of your billing cycle. Downgrades take effect at the end of your current billing period so you keep access until then.",
      },
      {
        question: 'Can I cancel my subscription?',
        answer: "Yes, you can cancel anytime from the Billing page. You'll continue to have access to all paid features until the end of your current billing period. After that, your account automatically moves to the Free plan. Your documents remain stored, but if you exceed the Free tier's 3-document limit, you'll need to remove some before uploading new ones.",
      },
      {
        question: 'Is my payment information secure?',
        answer: 'Absolutely. We use Stripe for all payment processing. Stripe is PCI-DSS Level 1 compliant and trusted by millions of businesses worldwide. We never store your full card number on our servers.',
      },
      {
        question: "What's the difference between monthly and yearly billing?",
        answer: `Yearly billing saves you approximately 17% compared to paying monthly. For example, the Starter plan is $${starter.price.monthly}/month or $${starter.price.yearly}/year (saving $${starter.price.monthly * 12 - starter.price.yearly}/year), and the Pro plan is $${pro.price.monthly}/month or $${pro.price.yearly}/year (saving $${pro.price.monthly * 12 - pro.price.yearly}/year). You get the same features either way.`,
      },
    ],
  },
  {
    title: 'Limits & Usage',
    items: [
      {
        question: "What's the difference between document storage and monthly uploads?",
        answer: 'Document storage is the total number of documents you can have at any time (Free: 3, Starter: 25, Pro: 100). Monthly uploads is how many new documents you can upload each month (Free: 3, Starter: 30, Pro: 150). Both limits must have room for you to upload a new document. Your monthly upload counter resets automatically at the start of each billing month.',
      },
      {
        question: 'What happens if I reach my document or upload limit?',
        answer: "You'll see a warning when you're approaching either limit (at 80% usage) and a clear message when you've reached it. You can either delete existing documents to free up storage space, wait for your monthly upload counter to reset, or upgrade to a higher plan for more capacity. You'll be prompted to upgrade directly from the upload screen.",
      },
      {
        question: 'Does deleting a document give back a monthly upload?',
        answer: "No. Deleting a document frees up document storage space, but it does not reduce your monthly upload count. For example, if you've uploaded 3 documents this month on the Free plan, you've used all 3 monthly uploads even if you delete some of those documents. The monthly upload counter resets at the start of your next billing month.",
      },
      {
        question: 'How do AI questions work?',
        answer: 'Free plan users get 5 AI questions per month. Each time you ask the AI about your documents in the chat, it counts as one question. The counter resets automatically at the start of each month. Starter and Pro plans include unlimited AI questions, so you can chat with your documents as much as you like.',
      },
      {
        question: 'When do my monthly counters reset?',
        answer: 'Both your AI question counter and monthly upload counter reset automatically at the beginning of each billing month. You can check your current usage and reset date on the Dashboard or the Billing page.',
      },
    ],
  },
  {
    title: 'Features',
    items: [
      {
        question: 'What file types are supported?',
        answer: 'You can upload PDFs, Word documents (.doc, .docx), plain text files (.txt), and images (JPEG, PNG, GIF, WebP). Starter and Pro plans also support URL ingestion, which lets you import web pages directly. OCR for extracting text from images is available on Starter and Pro plans.',
      },
      {
        question: 'What is the priority LLM queue?',
        answer: 'Our AI processes questions using a priority queue. Free users are on the standard queue (lowest priority), Starter users get medium priority, and Pro users get the highest priority with the fastest response times. During high-traffic periods, Pro users will always get the quickest answers.',
      },
      {
        question: 'What are Life Events and Document Health?',
        answer: 'Life Events is a Pro-exclusive feature that helps you plan for major life milestones (buying a home, getting married, starting a business, etc.) by identifying which documents you need and tracking your readiness. Document Health is also Pro-exclusive and monitors your document portfolio for expiring documents, missing coverage, and actionable recommendations.',
      },
      {
        question: 'What is the Weekly Audit?',
        answer: 'Available on Starter and Pro plans, the Weekly Audit provides a summary of your document portfolio delivered to your inbox every week. It covers recently uploaded documents, upcoming expirations, and recommended actions to keep your documents organized and up to date.',
      },
      {
        question: 'What are auto tags and how do they work?',
        answer: 'Auto tags are available on Starter and Pro plans. When you upload a document, our AI automatically analyzes its content and generates relevant tags to help you organize and find documents later. Pro users get advanced tagging with relationship mapping between related documents.',
      },
      {
        question: 'Do you send email notifications?',
        answer: 'Starter and Pro plan users receive email notifications for important events like document expirations, processing status updates, weekly audit summaries, and usage limit warnings. You can customize your notification preferences in Account Settings. Free plan users do not receive email notifications.',
      },
    ],
  },
  {
    title: 'Security & Data',
    items: [
      {
        question: 'Is my data secure?',
        answer: 'Yes. All documents are encrypted at rest and in transit. We use Supabase for database storage with Row-Level Security (RLS) so your documents are only accessible to you. Our AI processing infrastructure runs on secure, dedicated servers. We never share your document contents with third parties.',
      },
      {
        question: 'What happens to my documents if I downgrade or cancel?',
        answer: "Your documents remain stored even after downgrading. However, if you exceed the lower plan's storage limit, you'll need to choose which documents to keep before the downgrade takes effect. When canceling, you retain access until the end of your billing period, then move to the Free plan. Documents above the Free tier limit will still be stored but you won't be able to upload new ones until you're within the limit.",
      },
      {
        question: 'Can I export or download my documents?',
        answer: 'Yes, you can download any of your uploaded documents at any time from the Document Vault. Your original files are preserved exactly as uploaded. This works on all plans, including the Free tier.',
      },
    ],
  },
  ];
}

interface PricingPageProps {
  onBack: () => void;
  onSelectPlan: (plan: 'free' | 'starter' | 'pro') => void;
  currentPlan?: 'free' | 'starter' | 'pro';
}

export function PricingPage({ onBack, onSelectPlan, currentPlan = 'free' }: PricingPageProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [openFAQs, setOpenFAQs] = useState<Set<string>>(new Set());
  const { plans: PLANS } = usePricing();
  const faqSections = getFAQSections(PLANS);

  const toggleFAQ = (key: string) => {
    setOpenFAQs(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getPrice = (plan: typeof PLANS[0]) => {
    return billingCycle === 'monthly' ? plan.price.monthly : plan.price.yearly;
  };

  const getSavings = (plan: typeof PLANS[0]) => {
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
            Pricing based on documents stored. Paid tiers get unlimited AI chats with priority processing.
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 sm:px-6 py-2 rounded-lg font-medium text-sm sm:text-base transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 sm:px-6 py-2 rounded-lg font-medium text-sm sm:text-base transition-all relative ${
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
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8">
          {PLANS.map((plan) => {
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
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-lg">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="p-5 sm:p-8">
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
                    onClick={() => onSelectPlan(plan.id)}
                    disabled={isCurrentPlan}
                    className={`w-full py-3 px-6 rounded-xl font-semibold transition-all duration-200 ${
                      isCurrentPlan
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
          <div className="space-y-8">
            {faqSections.map((section, sectionIdx) => (
              <div key={sectionIdx}>
                <h3 className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-3">
                  {section.title}
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200">
                  {section.items.map((item, itemIdx) => {
                    const key = `${sectionIdx}-${itemIdx}`;
                    const isOpen = openFAQs.has(key);
                    return (
                      <div key={key} className="bg-white">
                        <button
                          onClick={() => toggleFAQ(key)}
                          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors"
                        >
                          <span className="text-base font-semibold text-slate-900 pr-4">
                            {item.question}
                          </span>
                          <ChevronDown
                            className={`h-5 w-5 text-slate-400 flex-shrink-0 transition-transform duration-200 ${
                              isOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        <div
                          className={`overflow-hidden transition-all duration-200 ${
                            isOpen ? 'max-h-96' : 'max-h-0'
                          }`}
                        >
                          <p className="px-6 pb-4 text-slate-600 leading-relaxed">
                            {item.answer}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
