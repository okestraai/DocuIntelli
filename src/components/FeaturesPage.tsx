import { ArrowLeft, ArrowRight, FileText, MessageSquare, Bell, Lock, Smartphone, CheckCircle, Tags, RefreshCw, BarChart3, Compass, ClipboardCheck, Zap, Upload, Search, Shield } from 'lucide-react';

interface FeaturesPageProps {
  onBack: () => void;
  onGetStarted?: () => void;
  onViewPricing?: () => void;
}

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
  details: string[];
  gradient: string;
  borderHover: string;
}

const CORE_FEATURES: Feature[] = [
  {
    icon: <FileText className="h-7 w-7 text-emerald-600" strokeWidth={2} />,
    title: 'Secure Document Vault',
    description: 'Upload, organize, and access all your legal and financial documents in one encrypted space.',
    details: [
      'Support for PDFs, Word documents, text files, and images',
      'Organize by category: warranty, insurance, lease, employment, contract',
      'Set expiration dates to track renewals and deadlines',
      'Download original files anytime in their original format',
      'Document renewal workflow to replace expired documents seamlessly',
    ],
    gradient: 'from-emerald-50 to-teal-50',
    borderHover: 'hover:border-emerald-200',
  },
  {
    icon: <MessageSquare className="h-7 w-7 text-teal-600" strokeWidth={2} />,
    title: 'AI-Powered Document Chat',
    description: 'Ask questions about any document in plain English and get instant, accurate answers grounded in your document content.',
    details: [
      '"What\'s my deductible?" — get precise answers from your insurance policy',
      '"When does my warranty expire?" — instant date extraction',
      '"What are my rights as a tenant?" — understand complex lease terms',
      'Responses cite specific sections and clauses from your documents',
      'Powered by advanced vector search for accurate retrieval',
    ],
    gradient: 'from-teal-50 to-cyan-50',
    borderHover: 'hover:border-teal-200',
  },
  {
    icon: <Bell className="h-7 w-7 text-amber-600" strokeWidth={2} />,
    title: 'Smart Expiration Reminders',
    description: 'Never miss another deadline. Get notified before warranties expire, insurance renewals are due, or leases end.',
    details: [
      'Automated daily checks for upcoming expirations',
      'Email notifications for documents expiring within 30 days',
      'Dashboard alerts with color-coded urgency indicators',
      'Configurable notification preferences in Account Settings',
      'Weekly audit summaries highlighting documents needing attention',
    ],
    gradient: 'from-amber-50 to-orange-50',
    borderHover: 'hover:border-amber-200',
  },
  {
    icon: <Lock className="h-7 w-7 text-violet-600" strokeWidth={2} />,
    title: 'Bank-Level Security',
    description: 'Your documents are protected with enterprise-grade encryption and access controls.',
    details: [
      'AES-256 encryption at rest for all stored data',
      'TLS 1.2+ encryption for all data in transit',
      'Row-Level Security (RLS) ensures only you can access your documents',
      'Your documents are never used for AI training',
      'Secure AI processing — content is not stored beyond request duration',
    ],
    gradient: 'from-violet-50 to-purple-50',
    borderHover: 'hover:border-violet-200',
  },
  {
    icon: <Smartphone className="h-7 w-7 text-blue-600" strokeWidth={2} />,
    title: 'Cross-Device Access',
    description: 'Access your documents from any device, anywhere. Your vault is always synced and ready.',
    details: [
      'Responsive design works on desktop, tablet, and mobile',
      'Real-time sync across all your devices',
      'Upload documents from your phone camera',
      'Quick search and AI chat on the go',
      'Secure sign-in with email or Google OAuth',
    ],
    gradient: 'from-blue-50 to-cyan-50',
    borderHover: 'hover:border-blue-200',
  },
  {
    icon: <CheckCircle className="h-7 w-7 text-emerald-600" strokeWidth={2} />,
    title: 'Actionable Insights',
    description: 'Get clear, actionable summaries for every document. Know your coverage, understand your rights, and learn the steps for claims.',
    details: [
      'AI-generated document summaries highlighting key information',
      'Coverage and benefit breakdowns for insurance policies',
      'Important dates and deadlines extracted automatically',
      'Plain-language explanations of complex legal terms',
      'Action items and next steps for each document type',
    ],
    gradient: 'from-emerald-50 to-green-50',
    borderHover: 'hover:border-emerald-200',
  },
];

const ADVANCED_FEATURES: { icon: React.ReactNode; title: string; description: string; plan: string }[] = [
  {
    icon: <Tags className="h-6 w-6 text-emerald-600" />,
    title: 'Auto-Generated Tags',
    description: 'AI automatically analyzes your documents and generates relevant tags for easy filtering and discovery. No manual tagging required.',
    plan: 'Starter & Pro',
  },
  {
    icon: <Upload className="h-6 w-6 text-teal-600" />,
    title: 'URL Ingestion',
    description: 'Import web pages directly into your vault by pasting a URL. Perfect for online terms of service, digital receipts, and web-based documents.',
    plan: 'Starter & Pro',
  },
  {
    icon: <ClipboardCheck className="h-6 w-6 text-blue-600" />,
    title: 'Weekly Vault Audit',
    description: 'Automated weekly review of your entire document vault. Spots gaps in coverage, flags upcoming expirations, and surfaces action items you may have missed.',
    plan: 'Starter & Pro',
  },
  {
    icon: <RefreshCw className="h-6 w-6 text-amber-600" />,
    title: 'Document Renewal Workflow',
    description: 'When a document expires, upload a replacement that automatically links to the original. Maintain a clean history of renewals without clutter.',
    plan: 'All plans',
  },
  {
    icon: <Search className="h-6 w-6 text-violet-600" />,
    title: 'Vector-Powered Search',
    description: 'Search across all your documents using natural language. Our embedding-based search finds relevant passages even when exact keywords don\'t match.',
    plan: 'All plans',
  },
  {
    icon: <Compass className="h-6 w-6 text-rose-600" />,
    title: 'Life Event Planner',
    description: 'Planning a move, buying a home, or getting married? Smart checklists auto-match your existing documents and show what\'s missing for major life events.',
    plan: 'Pro',
  },
  {
    icon: <BarChart3 className="h-6 w-6 text-cyan-600" />,
    title: 'Document Health Dashboard',
    description: 'At-a-glance view of your document vault health. See expiration timelines, category distribution, and processing status in one unified dashboard.',
    plan: 'All plans',
  },
  {
    icon: <Zap className="h-6 w-6 text-yellow-600" />,
    title: 'Automated Processing Pipeline',
    description: 'Every uploaded document is automatically processed: text extraction, chunking, vector embedding generation, and tag assignment — all hands-free.',
    plan: 'All plans',
  },
];

const USE_CASES = [
  {
    title: 'Warranties & Extended Protection',
    description: 'Upload electronics and appliance warranties. Ask "What repairs are covered?" or "Is accidental damage included?" Get notified 30 days before they expire so you can make claims or renew coverage.',
    example: '"My laptop screen cracked — am I covered?"',
  },
  {
    title: 'Insurance Policies',
    description: 'Manage auto, health, home, and life insurance policies in one place. Understand your deductibles, coverage limits, and exclusions without reading pages of fine print. Get renewal reminders so you never lapse.',
    example: '"What\'s my collision deductible for my 2024 Honda?"',
  },
  {
    title: 'Rental & Lease Agreements',
    description: 'Know your tenant rights, understand maintenance responsibilities, and track lease renewal dates. Ask about pet policies, subletting rules, or security deposit terms instantly.',
    example: '"Can my landlord raise rent mid-lease?"',
  },
  {
    title: 'Employment & Service Contracts',
    description: 'Understand your employment terms, non-compete clauses, benefits, and termination conditions. Manage freelance agreements and service contracts with AI-powered clarity.',
    example: '"What\'s my notice period if I resign?"',
  },
];

export function FeaturesPage({ onBack, onGetStarted, onViewPricing }: FeaturesPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Sticky header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-700 hover:text-emerald-600 font-medium transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back</span>
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
          Everything you need to manage{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600">
            legal documents
          </span>
        </h1>
        <p className="text-lg sm:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
          From warranties to insurance policies, DocuIntelli AI makes complex legal documents simple, searchable, and actionable.
        </p>
      </div>

      {/* Core Features */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="space-y-8">
          {CORE_FEATURES.map((feature, idx) => (
            <div
              key={idx}
              className={`bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 ${feature.borderHover} transition-all duration-300 hover:shadow-lg`}
            >
              <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                <div className="flex-shrink-0">
                  <div className={`bg-gradient-to-br ${feature.gradient} w-14 h-14 rounded-xl flex items-center justify-center`}>
                    {feature.icon}
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl sm:text-2xl font-semibold text-slate-900 mb-2">{feature.title}</h3>
                  <p className="text-slate-600 leading-relaxed mb-4">{feature.description}</p>
                  <ul className="space-y-2">
                    {feature.details.map((detail, dIdx) => (
                      <li key={dIdx} className="flex items-start gap-2.5">
                        <CheckCircle className="h-4.5 w-4.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span className="text-slate-600 text-sm sm:text-base">{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Advanced Features Grid */}
      <div className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">More powerful features</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Beyond the essentials, DocuIntelli AI includes advanced tools to keep your document vault organized and actionable.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {ADVANCED_FEATURES.map((feature, idx) => (
              <div
                key={idx}
                className="bg-slate-50 border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-emerald-200 transition-all duration-300"
              >
                <div className="mb-3">{feature.icon}</div>
                <h4 className="font-semibold text-slate-900 mb-2">{feature.title}</h4>
                <p className="text-sm text-slate-600 leading-relaxed mb-3">{feature.description}</p>
                <span className="inline-block text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {feature.plan}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Use Cases */}
      <div className="py-16 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
              Perfect for all your important documents
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Whether it's warranties, insurance, leases, or contracts — DocuIntelli AI helps you stay organized and informed.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {USE_CASES.map((useCase, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white rounded-lg p-2 flex-shrink-0">
                    <span className="text-sm font-bold">{idx + 1}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{useCase.title}</h3>
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">{useCase.description}</p>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                  <p className="text-sm text-emerald-800 font-medium">Example question:</p>
                  <p className="text-sm text-slate-700 italic">{useCase.example}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Security Summary */}
      <div className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 sm:p-12 text-center">
            <Shield className="h-10 w-10 text-emerald-400 mx-auto mb-4" />
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Your privacy is our priority</h2>
            <p className="text-slate-300 max-w-2xl mx-auto leading-relaxed mb-6">
              DocuIntelli AI is built with security-first principles. Your documents are encrypted, access-controlled, and never used for AI training. We use no tracking cookies or third-party analytics.
            </p>
            <div className="grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
              <div className="bg-white/10 rounded-xl p-4">
                <p className="text-emerald-400 font-semibold mb-1">AES-256</p>
                <p className="text-slate-400 text-sm">Encryption at rest</p>
              </div>
              <div className="bg-white/10 rounded-xl p-4">
                <p className="text-emerald-400 font-semibold mb-1">TLS 1.2+</p>
                <p className="text-slate-400 text-sm">Encryption in transit</p>
              </div>
              <div className="bg-white/10 rounded-xl p-4">
                <p className="text-emerald-400 font-semibold mb-1">Row-Level Security</p>
                <p className="text-slate-400 text-sm">Data isolation per user</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="py-16 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-700">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 tracking-tight">
            Ready to simplify your legal documents?
          </h2>
          <p className="text-lg text-emerald-50 mb-8">
            Start for free with 3 documents and 5 AI questions per month. No credit card required.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {onGetStarted && (
              <button
                onClick={onGetStarted}
                className="bg-white hover:bg-slate-50 text-emerald-700 font-semibold py-3 px-8 rounded-xl text-lg transition-all duration-200 hover:shadow-2xl transform hover:-translate-y-0.5 inline-flex items-center gap-2 shadow-xl"
              >
                <span>Get Started Free</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            )}
            {onViewPricing && (
              <button
                onClick={onViewPricing}
                className="text-white/90 hover:text-white font-medium py-3 px-8 rounded-xl text-lg transition-all border border-white/30 hover:border-white/60 hover:bg-white/10"
              >
                View Pricing
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
