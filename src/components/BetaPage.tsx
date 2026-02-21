import { useState } from 'react';
import {
  ShieldCheck,
  FileText,
  MessageSquare,
  Bell,
  UserPlus,
  Upload,
  CreditCard,
  Bug,
  Lightbulb,
  Heart,
  Copy,
  Check,
  ArrowRight,
  AlertTriangle,
  Lock,
  ExternalLink,
  MessageCircle,
  Mail,
  Camera,
  ArrowLeft,
} from 'lucide-react';

interface BetaPageProps {
  onGetStarted: () => void;
  onBack: () => void;
}

const TEST_CARDS = [
  { scenario: 'Successful payment', number: '4242 4242 4242 4242', result: 'Payment succeeds' },
  { scenario: 'Card declined', number: '4000 0000 0000 0002', result: 'Payment is declined' },
  { scenario: 'Requires authentication', number: '4000 0025 0000 3155', result: '3D Secure popup appears' },
];

const CORE_TESTS = [
  'Sign up — Create an account with email or Google',
  'Upload a document — Try a PDF, Word doc, or image',
  'Chat with a document — Ask it a question after processing',
  'Set an expiration date — Edit a document and add one',
  'Search & filter — Try searching by name, category, or tags',
  'View on mobile — Open the app on your phone and try navigating',
];

const PAID_TESTS = [
  'Upgrade to Starter or Pro — Use the test card below',
  'Upload a URL — Paste a web page URL to ingest (Starter+)',
  'Check auto-generated tags — Upload a doc and see if tags appear (Starter+)',
  'Weekly Audit page — View your document audit summary (Starter+)',
  'Life Events planner — Plan a life event and see readiness (Pro)',
  'Document Health panel — Check your dashboard health panel (Pro)',
  'Downgrade / Cancel — Try downgrading or canceling from Billing page',
];

const ACCOUNT_TESTS = [
  'View Billing page — Check subscription details',
  'Update profile — Change display name or notification preferences',
  'Account Settings — Explore notification and email preferences',
];

export function BetaPage({ onGetStarted, onBack }: BetaPageProps) {
  const [copiedCard, setCopiedCard] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text.replace(/\s/g, ''));
    setCopiedCard(text);
    setTimeout(() => setCopiedCard(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Top Navigation */}
      <nav className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button onClick={onBack} className="flex items-center gap-2 text-slate-600 hover:text-emerald-600 transition-colors">
              <ArrowLeft className="h-5 w-5" />
              <span className="hidden sm:inline font-medium">Back</span>
            </button>
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-emerald-600 to-teal-600 p-2 rounded-lg">
                <ShieldCheck className="h-6 w-6 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-xl font-bold text-slate-900">
                DocuIntelli <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600">AI</span>
              </span>
            </div>
            <button
              onClick={onGetStarted}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-all"
            >
              Sign Up
            </button>
          </div>
        </div>
      </nav>

      {/* Beta Banner */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-center gap-3">
          <Lock className="h-4 w-4 text-white/90" />
          <span className="text-white font-semibold text-sm tracking-wide uppercase">Closed Beta</span>
          <span className="text-white/80 text-sm hidden sm:inline">— You've been invited!</span>
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.05),transparent_50%)]" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 pb-10 sm:pb-14 text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-600 p-4 rounded-2xl shadow-lg">
              <ShieldCheck className="h-10 w-10 sm:h-12 sm:w-12 text-white" strokeWidth={2.5} />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
            Welcome to the DocuIntelli{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600">AI</span>{' '}
            Closed Beta
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            You're one of a small group of people getting early access before we launch publicly.
            We built this for people like you — and we need your honest feedback to make it great.
          </p>
        </div>
      </section>

      {/* What is DocuIntelli AI? */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">What is DocuIntelli AI?</h2>
            <p className="text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Your intelligent document companion. Store, understand, and manage all your important
              legal and financial documents — warranties, insurance policies, leases, employment contracts,
              and more — in one secure, AI-powered vault.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                icon: <FileText className="h-7 w-7 text-emerald-600" />,
                title: 'Secure Document Vault',
                description: 'Upload PDFs, Word docs, images, and URLs. Everything encrypted and organized by category.',
                gradient: 'from-emerald-50 to-teal-50',
              },
              {
                icon: <MessageSquare className="h-7 w-7 text-teal-600" />,
                title: 'AI-Powered Chat',
                description: 'Ask questions about your documents in plain English. "What\'s my deductible?" — instant answers.',
                gradient: 'from-teal-50 to-cyan-50',
              },
              {
                icon: <Bell className="h-7 w-7 text-amber-600" />,
                title: 'Smart Reminders',
                description: 'Never miss an expiration date. Get alerts before warranties and policies lapse.',
                gradient: 'from-amber-50 to-orange-50',
              },
            ].map((feature) => (
              <div key={feature.title} className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg transition-all">
                <div className={`bg-gradient-to-br ${feature.gradient} w-12 h-12 rounded-xl flex items-center justify-center mb-4`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How to Get Started */}
      <section className="py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">Getting Started in 3 Minutes</h2>
            <p className="text-slate-600">Follow these steps to explore DocuIntelli AI.</p>
          </div>
          <div className="space-y-4">
            {[
              {
                step: 1,
                icon: <UserPlus className="h-5 w-5 text-white" />,
                title: 'Create Your Account',
                description: 'Click "Get Started" below to create a free account. You can sign up with your email or Google account.',
              },
              {
                step: 2,
                icon: <Upload className="h-5 w-5 text-white" />,
                title: 'Upload a Document',
                description: 'Try uploading a real document — a warranty, insurance card, lease, or any PDF/image you have handy. The AI will process it automatically.',
              },
              {
                step: 3,
                icon: <MessageSquare className="h-5 w-5 text-white" />,
                title: 'Chat With Your Document',
                description: 'Once processed, open the document and ask a question. Try: "Summarize this document" or "When does this expire?"',
              },
              {
                step: 4,
                icon: <CreditCard className="h-5 w-5 text-white" />,
                title: 'Test a Paid Plan (Optional)',
                description: 'Want to test Starter ($7/mo) or Pro ($19/mo) features? Use the test credit card info below — you will NOT be charged real money.',
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-4 bg-white border border-slate-200 rounded-xl p-5 border-l-4 border-l-emerald-500">
                <div className="flex-shrink-0 bg-gradient-to-br from-emerald-600 to-teal-600 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {item.step}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-1">{item.title}</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <button
              onClick={onGetStarted}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold py-3 px-8 rounded-xl text-lg transition-all hover:shadow-xl inline-flex items-center gap-2"
            >
              Get Started — Create Your Beta Account
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Test Payment Info */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">Test Credit Card — No Real Charges</h2>
          </div>

          {/* Warning callout */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6 flex gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-900 font-semibold mb-1">This is a test environment</p>
              <p className="text-amber-800 text-sm leading-relaxed">
                No real money will be charged. Use the card details below to test paid plan features.
                All transactions are in Stripe test mode.
              </p>
            </div>
          </div>

          {/* Primary test card */}
          <div className="bg-slate-900 rounded-2xl p-6 sm:p-8 mb-6 text-white">
            <div className="flex items-center justify-between mb-6">
              <span className="text-slate-400 text-sm font-medium uppercase tracking-wide">Test Card Details</span>
              <CreditCard className="h-8 w-8 text-slate-500" />
            </div>
            <div className="space-y-4">
              <div>
                <span className="text-slate-400 text-xs uppercase tracking-wide">Card Number</span>
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-mono text-xl sm:text-2xl tracking-widest">4242 4242 4242 4242</span>
                  <button
                    onClick={() => copyToClipboard('4242 4242 4242 4242')}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
                    title="Copy card number"
                  >
                    {copiedCard === '4242 4242 4242 4242' ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4 text-slate-400" />
                    )}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <span className="text-slate-400 text-xs uppercase tracking-wide">Expiration</span>
                  <p className="font-mono text-lg mt-1">12/34</p>
                </div>
                <div>
                  <span className="text-slate-400 text-xs uppercase tracking-wide">CVC</span>
                  <p className="font-mono text-lg mt-1">123</p>
                </div>
                <div>
                  <span className="text-slate-400 text-xs uppercase tracking-wide">ZIP</span>
                  <p className="font-mono text-lg mt-1">12345</p>
                </div>
              </div>
            </div>
          </div>

          {/* Additional test cards */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
              <span className="text-sm font-medium text-slate-700">Additional Test Cards</span>
            </div>
            <div className="divide-y divide-slate-100">
              {TEST_CARDS.map((card) => (
                <div key={card.number} className="flex items-center justify-between px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-900">{card.scenario}</span>
                    <span className="text-slate-400 mx-2">—</span>
                    <span className="text-xs text-slate-500">{card.result}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <code className="text-sm font-mono text-slate-700 hidden sm:inline">{card.number}</code>
                    <button
                      onClick={() => copyToClipboard(card.number)}
                      className="p-1.5 rounded-md hover:bg-slate-100 transition-colors"
                      title="Copy"
                    >
                      {copiedCard === card.number ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-slate-500 mt-4 text-center">
            After subscribing with a test card, you can test upgrading, downgrading, and canceling
            from the Billing page — all without any real charges.
          </p>
        </div>
      </section>

      {/* What to Test */}
      <section className="py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">What to Test</h2>
            <p className="text-slate-600 max-w-xl mx-auto">
              Here's what we'd love for you to try. You don't need to test everything —
              even trying 2–3 things is incredibly helpful.
            </p>
          </div>
          <div className="space-y-6">
            <ChecklistCard title="Core Features (Everyone)" items={CORE_TESTS} color="emerald" />
            <ChecklistCard title="Paid Features (Use test card)" items={PAID_TESTS} color="teal" />
            <ChecklistCard title="Billing & Account" items={ACCOUNT_TESTS} color="slate" />
          </div>
        </div>
      </section>

      {/* What We're Looking For */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">Your Feedback Matters</h2>
            <p className="text-slate-600">We're not looking for polished reviews. We want raw, honest reactions.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                icon: <Bug className="h-7 w-7 text-red-500" />,
                title: 'Bugs & Broken Things',
                description: 'Did something crash? Did a button not work? Did the AI give a weird answer? Tell us exactly what happened.',
                bg: 'from-red-50 to-orange-50',
              },
              {
                icon: <Lightbulb className="h-7 w-7 text-amber-500" />,
                title: 'Confusing Moments',
                description: 'Was anything unclear? Did you get lost? Did you expect something to work differently? These "huh?" moments are gold.',
                bg: 'from-amber-50 to-yellow-50',
              },
              {
                icon: <Heart className="h-7 w-7 text-pink-500" />,
                title: 'What You Loved',
                description: 'What felt good? What was surprisingly useful? What would make you come back? Positive feedback helps us double down.',
                bg: 'from-pink-50 to-rose-50',
              },
            ].map((card) => (
              <div key={card.title} className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg transition-all">
                <div className={`bg-gradient-to-br ${card.bg} w-12 h-12 rounded-xl flex items-center justify-center mb-4`}>
                  {card.icon}
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{card.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{card.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Known Limitations */}
      <section className="py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 sm:p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Known Limitations (Beta)</h2>
            <ul className="space-y-3">
              {[
                { label: 'Processing time', detail: 'Document processing (AI analysis) may take 30–60 seconds. This will be faster at launch.' },
                { label: 'Mobile layout', detail: 'Some screens may not be fully optimized for small screens yet. We\'re working on it.' },
                { label: 'Email notifications', detail: 'Notification emails may land in spam. Check your spam folder or whitelist noreply@docuintelli.com.' },
                { label: 'Occasional AI hiccups', detail: 'The AI may occasionally give incomplete or slightly off answers. That\'s part of what we\'re testing.' },
                { label: 'Test environment', detail: 'Data in this environment may be reset periodically. Don\'t store anything critical here.' },
              ].map((item) => (
                <li key={item.label} className="flex gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0 mt-2" />
                  <div>
                    <span className="font-medium text-slate-900">{item.label}</span>
                    <span className="text-slate-500"> — {item.detail}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How to Give Feedback */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">How to Share Your Feedback</h2>
            <p className="text-slate-500 text-sm">No feedback is too small. Even "this color looks weird" or "I don't understand what this button does" is useful.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                icon: <ExternalLink className="h-6 w-6 text-emerald-600" />,
                title: 'Feedback Form',
                description: 'Quick structured feedback — takes 2 minutes.',
                action: 'Open Form',
                href: '#', // Placeholder — replace with actual form URL
                bg: 'bg-emerald-50',
              },
              {
                icon: <MessageCircle className="h-6 w-6 text-green-600" />,
                title: 'WhatsApp',
                description: 'Text me directly — voice notes welcome too!',
                action: '+1 (737) 274-2791',
                href: 'https://wa.me/17372742791?text=Hey%20Tunde!%20Beta%20feedback%3A%20',
                bg: 'bg-green-50',
              },
              {
                icon: <Mail className="h-6 w-6 text-blue-600" />,
                title: 'Email',
                description: 'Send detailed feedback or attach screenshots.',
                action: 'tunde@docuintelli.com',
                href: 'mailto:tunde@docuintelli.com?subject=DocuIntelli%20Beta%20Feedback',
                bg: 'bg-blue-50',
              },
              {
                icon: <Camera className="h-6 w-6 text-violet-600" />,
                title: 'Screenshots & Recordings',
                description: 'A screenshot or quick screen recording tells us more than words.',
                action: 'Send via any channel',
                bg: 'bg-violet-50',
              },
            ].map((channel) => (
              <div key={channel.title} className="border border-slate-200 rounded-xl p-5 flex gap-4 hover:shadow-md transition-all">
                <div className={`${channel.bg} w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0`}>
                  {channel.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900">{channel.title}</h3>
                  <p className="text-slate-500 text-sm mb-2">{channel.description}</p>
                  {channel.href ? (
                    <a
                      href={channel.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1"
                    >
                      {channel.action}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="text-sm text-slate-400">{channel.action}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-16 sm:py-20 bg-gradient-to-r from-emerald-600 to-teal-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Ready to explore?</h2>
          <p className="text-emerald-100 mb-8 max-w-lg mx-auto">
            Create your account and start testing DocuIntelli AI today.
          </p>
          <button
            onClick={onGetStarted}
            className="bg-white text-emerald-700 hover:bg-emerald-50 font-semibold py-3 px-8 rounded-xl text-lg transition-all hover:shadow-xl inline-flex items-center gap-2"
          >
            Get Started
            <ArrowRight className="h-5 w-5" />
          </button>
          <p className="text-emerald-200 text-sm mt-6">Thank you for helping us build something great.</p>
        </div>
      </section>
    </div>
  );
}

/* ── Checklist Card sub-component ── */

function ChecklistCard({ title, items, color }: { title: string; items: string[]; color: 'emerald' | 'teal' | 'slate' }) {
  const headerBg: Record<string, string> = {
    emerald: 'bg-emerald-600',
    teal: 'bg-teal-600',
    slate: 'bg-slate-700',
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className={`${headerBg[color]} px-5 py-3`}>
        <span className="text-white font-semibold text-sm">{title}</span>
      </div>
      <div className="bg-white divide-y divide-slate-100">
        {items.map((item) => {
          const [label, ...rest] = item.split(' — ');
          const detail = rest.join(' — ');
          return (
            <div key={item} className="flex items-start gap-3 px-5 py-3">
              <div className="w-5 h-5 rounded border-2 border-slate-300 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <span className="font-medium text-slate-900">{label}</span>
                {detail && <span className="text-slate-500"> — {detail}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
