import { useState } from 'react';
import { ArrowLeft, ChevronDown, Upload, MessageSquare, CreditCard, Shield, FileText, Settings } from 'lucide-react';

interface HelpCenterPageProps {
  onBack: () => void;
  onViewPricing?: () => void;
}

interface HelpTopic {
  icon: React.ReactNode;
  title: string;
  items: { question: string; answer: string }[];
}

const HELP_TOPICS: HelpTopic[] = [
  {
    icon: <Upload className="h-5 w-5" />,
    title: 'Uploading Documents',
    items: [
      {
        question: 'How do I upload a document?',
        answer: 'Click the "Add Document" button on your Dashboard or Document Vault. You can drag and drop files or click to browse. For each document, provide a name, select a category (warranty, insurance, lease, employment, contract, or other), and optionally set an expiration date.',
      },
      {
        question: 'What file types can I upload?',
        answer: 'DocuIntelli AI supports PDFs, Word documents (.doc, .docx), plain text files (.txt), and images (JPEG, PNG, GIF, WebP). Starter and Pro plans also support URL ingestion to import web pages directly.',
      },
      {
        question: 'What is the maximum file size?',
        answer: 'Each file can be up to 50 MB. If your file is larger, try compressing it or splitting it into multiple parts.',
      },
      {
        question: 'What happens after I upload a document?',
        answer: 'After uploading, DocuIntelli AI automatically extracts text from your document, splits it into chunks, and generates vector embeddings for AI-powered search and chat. On Starter and Pro plans, tags are also generated automatically. You\'ll see a "processed" indicator once this is complete.',
      },
      {
        question: 'Why can\'t I upload more documents?',
        answer: 'You may have hit either your document storage limit (total documents stored) or your monthly upload limit (new uploads this month). Check your Dashboard for current usage. You can delete existing documents to free storage, or wait for your monthly upload counter to reset at the start of your next billing month.',
      },
    ],
  },
  {
    icon: <MessageSquare className="h-5 w-5" />,
    title: 'AI Chat & Questions',
    items: [
      {
        question: 'How do I chat with my documents?',
        answer: 'Navigate to the Document Vault, find your document, and click "Chat". The AI will use the document\'s content to answer your questions. You can ask about specific clauses, dates, terms, coverage details, or request summaries.',
      },
      {
        question: 'How accurate are the AI responses?',
        answer: 'The AI analyzes the actual content of your documents using vector similarity search and provides responses grounded in your document text. However, AI responses are for informational purposes only and should not be treated as legal, financial, or professional advice.',
      },
      {
        question: 'What counts as an AI question?',
        answer: 'Each message you send in the document chat counts as one AI question. Free plan users get 5 questions per month. Starter and Pro plans have unlimited questions.',
      },
      {
        question: 'When does my AI question counter reset?',
        answer: 'The counter resets automatically at the start of each billing month. You can see your current usage on the Dashboard or Billing page.',
      },
    ],
  },
  {
    icon: <FileText className="h-5 w-5" />,
    title: 'Document Management',
    items: [
      {
        question: 'How do I organize my documents?',
        answer: 'Documents are organized by category (warranty, insurance, lease, employment, contract, other). On Starter and Pro plans, the AI automatically generates tags to further categorize your documents. You can also set expiration dates to track when documents expire.',
      },
      {
        question: 'Can I download my original documents?',
        answer: 'Yes. Go to the Document Vault, find your document, and use the download option. Your original file is preserved exactly as uploaded.',
      },
      {
        question: 'How do I delete a document?',
        answer: 'In the Document Vault, find the document and click the delete option. This permanently removes the document file, all extracted text chunks, embeddings, and associated data. This action cannot be undone.',
      },
      {
        question: 'What is document renewal?',
        answer: 'When viewing a document, you can upload a replacement (e.g., a renewed insurance policy). The new document inherits the name and category of the original, making it easy to keep your vault up to date.',
      },
    ],
  },
  {
    icon: <CreditCard className="h-5 w-5" />,
    title: 'Billing & Subscriptions',
    items: [
      {
        question: 'How do I upgrade my plan?',
        answer: 'Go to the Billing page from the navigation menu and select the plan you want. You can also upgrade when prompted by a limit (document storage, monthly uploads, or AI questions). Upgrades take effect immediately with prorated billing.',
      },
      {
        question: 'How do I cancel my subscription?',
        answer: 'Go to the Billing page and click "Manage Subscription" to open the Stripe customer portal. From there, you can cancel your subscription. You\'ll keep access to paid features until the end of your billing period.',
      },
      {
        question: 'What happens to my documents when I downgrade?',
        answer: 'Your documents remain stored. However, if you have more documents than the lower plan allows, you\'ll be asked to select which documents to keep. The downgrade takes effect at the end of your current billing period.',
      },
      {
        question: 'Do you offer refunds?',
        answer: 'Since downgrades and cancellations take effect at the end of your billing period (you keep access until then), we generally do not offer refunds. If you believe you were charged in error, contact support@docuintelli.com.',
      },
    ],
  },
  {
    icon: <Shield className="h-5 w-5" />,
    title: 'Security & Privacy',
    items: [
      {
        question: 'Is my data encrypted?',
        answer: 'Yes. All documents are encrypted at rest using AES-256 encryption and transmitted over TLS 1.2+. Our database uses Row-Level Security (RLS) so your documents are accessible only to you.',
      },
      {
        question: 'Who can see my documents?',
        answer: 'Only you. Our database enforces Row-Level Security, meaning every query is scoped to your user ID. Our support team does not have access to your document contents.',
      },
      {
        question: 'Are my documents used to train AI?',
        answer: 'No. Your documents are processed solely to provide the Service\'s features (chat, search, tagging). They are never used for training AI models or shared with third parties.',
      },
      {
        question: 'How do I delete my account?',
        answer: 'Contact support@docuintelli.com with your account email to request account deletion. All data, including documents, subscription records, and usage logs, will be permanently deleted within 30 days.',
      },
    ],
  },
  {
    icon: <Settings className="h-5 w-5" />,
    title: 'Account & Settings',
    items: [
      {
        question: 'How do I change my email or display name?',
        answer: 'Go to Account Settings from the navigation menu. You can update your display name from the Profile tab.',
      },
      {
        question: 'How do I manage email notifications?',
        answer: 'In Account Settings, go to the Notifications tab. You can toggle email notifications, document reminders, and security alerts on or off individually.',
      },
      {
        question: 'I forgot my password. How do I reset it?',
        answer: 'On the sign-in screen, click "Forgot password?" and enter your email. You\'ll receive a password reset link. If you signed up with Google, use the "Sign in with Google" option instead.',
      },
    ],
  },
];

export function HelpCenterPage({ onBack, onViewPricing }: HelpCenterPageProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggleItem = (key: string) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-700 hover:text-emerald-600 font-medium transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back</span>
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">Help Center</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Find answers to common questions about using DocuIntelli AI. Can't find what you need?
            Reach out to{' '}
            <a href="mailto:support@docuintelli.com" className="text-emerald-600 hover:text-emerald-700 underline">
              support@docuintelli.com
            </a>.
          </p>
        </div>

        <div className="space-y-8">
          {HELP_TOPICS.map((topic, topicIdx) => (
            <div key={topicIdx}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-emerald-600">{topic.icon}</span>
                <h2 className="text-lg font-semibold text-slate-900">{topic.title}</h2>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200">
                {topic.items.map((item, itemIdx) => {
                  const key = `${topicIdx}-${itemIdx}`;
                  const isOpen = openItems.has(key);
                  return (
                    <div key={key} className="bg-white">
                      <button
                        onClick={() => toggleItem(key)}
                        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors"
                      >
                        <span className="text-base font-medium text-slate-900 pr-4">{item.question}</span>
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
                        <p className="px-6 pb-4 text-slate-600 leading-relaxed">{item.answer}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center bg-white border border-slate-200 rounded-2xl p-8">
          <h3 className="text-xl font-semibold text-slate-900 mb-2">Still have questions?</h3>
          <p className="text-slate-600 mb-6">
            Our support team is here to help. You can also check out our pricing page for plan details.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="mailto:support@docuintelli.com"
              className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md"
            >
              Email Support
            </a>
            {onViewPricing && (
              <button
                onClick={onViewPricing}
                className="px-6 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-all"
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
