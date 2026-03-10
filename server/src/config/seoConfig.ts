/**
 * Server-side SEO configuration registry.
 * Single source of truth for per-route meta tags, structured data, and social sharing.
 * Never shipped to the browser bundle — used only by the SEO injection middleware.
 */

const BASE_URL = 'https://docuintelli.com';
const DEFAULT_OG_IMAGE = `${BASE_URL}/og/default.png`;

export interface RouteSeoConfig {
  title: string;
  description: string;
  canonicalPath: string;
  ogType?: string;
  ogImage?: string;
  twitterCard?: 'summary' | 'summary_large_image';
  noindex?: boolean;
  jsonLd?: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function breadcrumb(name: string, path: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name, item: `${BASE_URL}${path}` },
    ],
  };
}

function faqSchema(items: { q: string; a: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

// ---------------------------------------------------------------------------
// FAQ data (duplicated from React components — server can't import React code)
// ---------------------------------------------------------------------------

const PRICING_FAQS: { q: string; a: string }[] = [
  { q: 'Can I upgrade or downgrade at any time?', a: 'Yes! You can change your plan anytime from the Billing page. Upgrades take effect immediately and you\'ll be charged a prorated amount for the remainder of your billing cycle. Downgrades take effect at the end of your current billing period so you keep access until then.' },
  { q: 'Can I cancel my subscription?', a: 'Yes, you can cancel anytime from the Billing page. You\'ll continue to have access to all paid features until the end of your current billing period. After that, your account automatically moves to the Free plan.' },
  { q: 'Is my payment information secure?', a: 'Absolutely. We use Stripe for all payment processing. Stripe is PCI-DSS Level 1 compliant and trusted by millions of businesses worldwide. We never store your full card number on our servers.' },
  { q: 'What\'s the difference between monthly and yearly billing?', a: 'Yearly billing saves you approximately 17% compared to paying monthly. You get the same features either way.' },
  { q: 'What\'s the difference between document storage and monthly uploads?', a: 'Document storage is the total number of documents you can have at any time (Free: 3, Starter: 25, Pro: 100). Monthly uploads is how many new documents you can upload each month (Free: 3, Starter: 30, Pro: 150).' },
  { q: 'What happens if I reach my document or upload limit?', a: 'You\'ll see a warning when you\'re approaching either limit and a clear message when you\'ve reached it. You can either delete existing documents to free up space, wait for your monthly counter to reset, or upgrade to a higher plan.' },
  { q: 'How do AI questions work?', a: 'Free plan users get 5 AI questions per month. Each time you ask the AI about your documents in the chat, it counts as one question. Starter and Pro plans include unlimited AI questions.' },
  { q: 'What file types are supported?', a: 'You can upload PDFs, Word documents (.doc, .docx), plain text files (.txt), and images (JPEG, PNG, GIF, WebP). Starter and Pro plans also support URL ingestion and OCR for extracting text from images.' },
  { q: 'What is the priority LLM queue?', a: 'Our AI processes questions using a priority queue. Free users are on the standard queue, Starter users get medium priority, and Pro users get the highest priority with the fastest response times.' },
  { q: 'What are Life Events and Document Health?', a: 'Life Events is a Pro-exclusive feature that helps you plan for major life milestones by identifying which documents you need and tracking your readiness. Document Health monitors your document portfolio for expiring documents and missing coverage.' },
  { q: 'What is the Weekly Audit?', a: 'Available on Starter and Pro plans, the Weekly Audit provides a summary of your document portfolio delivered to your inbox every week covering recently uploaded documents, upcoming expirations, and recommended actions.' },
  { q: 'Is my data secure?', a: 'Yes. All documents are encrypted at rest and in transit. We use Azure Database for PostgreSQL with Row-Level Security so your documents are only accessible to you. We never share your document contents with third parties.' },
  { q: 'Can I export or download my documents?', a: 'Yes, you can download any of your uploaded documents at any time from the Document Vault. Your original files are preserved exactly as uploaded on all plans.' },
];

const HELP_FAQS: { q: string; a: string }[] = [
  { q: 'How do I upload a document?', a: 'Click the "Add Document" button on your Dashboard or Document Vault. You can drag and drop files or click to browse. For each document, provide a name, select a category, and optionally set an expiration date.' },
  { q: 'What file types can I upload?', a: 'DocuIntelli AI supports PDFs, Word documents (.doc, .docx), plain text files (.txt), and images (JPEG, PNG, GIF, WebP). Starter and Pro plans also support URL ingestion to import web pages directly.' },
  { q: 'What happens after I upload a document?', a: 'DocuIntelli AI automatically extracts text from your document, splits it into chunks, and generates vector embeddings for AI-powered search and chat. On Starter and Pro plans, tags are also generated automatically.' },
  { q: 'How do I chat with my documents?', a: 'Navigate to the Document Vault, find your document, and click "Chat". The AI will use the document\'s content to answer your questions about specific clauses, dates, terms, coverage details, or provide summaries.' },
  { q: 'How accurate are the AI responses?', a: 'The AI analyzes the actual content of your documents using vector similarity search and provides responses grounded in your document text. However, responses are for informational purposes only and should not be treated as legal, financial, or professional advice.' },
  { q: 'Is my data encrypted?', a: 'Yes. All documents are encrypted at rest using AES-256 encryption and transmitted over TLS 1.2+. Our database uses Row-Level Security so your documents are accessible only to you.' },
  { q: 'Are my documents used to train AI?', a: 'No. Your documents are processed solely to provide the Service\'s features (chat, search, tagging). They are never used for training AI models or shared with third parties.' },
  { q: 'How do I upgrade my plan?', a: 'Go to the Billing page from the navigation menu and select the plan you want. You can also upgrade when prompted by a limit. Upgrades take effect immediately with prorated billing.' },
  { q: 'How do I cancel my subscription?', a: 'Go to the Billing page and click "Manage Subscription" to open the Stripe customer portal. From there, you can cancel your subscription. You\'ll keep access to paid features until the end of your billing period.' },
];

// ---------------------------------------------------------------------------
// Route SEO Config
// ---------------------------------------------------------------------------

export const SEO_CONFIG: Record<string, RouteSeoConfig> = {
  '/': {
    title: 'DocuIntelli AI — AI-Powered Document Management for Families',
    description: 'Organize your warranties, insurance policies, leases, and contracts in one secure vault. Chat with your documents using AI, get smart expiration reminders, and gain financial insights. Free to start.',
    canonicalPath: '/',
    twitterCard: 'summary_large_image',
    ogImage: `${BASE_URL}/og/home.png`,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'DocuIntelli AI',
        url: BASE_URL,
        logo: `${BASE_URL}/og/logo.png`,
        sameAs: [
          'https://twitter.com/docuintelli',
          'https://linkedin.com/company/docuintelli',
          'https://github.com/docuintelli',
        ],
        contactPoint: {
          '@type': 'ContactPoint',
          email: 'support@docuintelli.com',
          contactType: 'customer support',
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'DocuIntelli AI',
        url: BASE_URL,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'DocuIntelli AI',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        offers: [
          { '@type': 'Offer', price: '0', priceCurrency: 'USD', name: 'Free Plan' },
          { '@type': 'Offer', price: '9', priceCurrency: 'USD', name: 'Starter Plan' },
          { '@type': 'Offer', price: '19', priceCurrency: 'USD', name: 'Pro Plan' },
        ],
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.8',
          ratingCount: '150',
        },
      },
    ],
  },

  '/pricing': {
    title: 'Pricing Plans — DocuIntelli AI | Free, Starter & Pro',
    description: 'Compare DocuIntelli AI plans. Free plan with 3 documents and 5 AI questions. Starter at $9/mo with 25 docs and unlimited AI. Pro at $15/mo with 100 docs, financial insights, and life events. Start free today.',
    canonicalPath: '/pricing',
    twitterCard: 'summary_large_image',
    ogImage: `${BASE_URL}/og/pricing.png`,
    jsonLd: [
      breadcrumb('Pricing', '/pricing'),
      faqSchema(PRICING_FAQS),
    ],
  },

  '/features': {
    title: 'Features — DocuIntelli AI | Secure Vault, AI Chat, Smart Reminders',
    description: 'Explore DocuIntelli AI features: secure document vault with encryption, AI-powered document chat, smart expiration reminders, OCR scanning, financial insights with Plaid, life events planning, and weekly audit reports.',
    canonicalPath: '/features',
    twitterCard: 'summary_large_image',
    ogImage: `${BASE_URL}/og/features.png`,
    jsonLd: [breadcrumb('Features', '/features')],
  },

  '/help': {
    title: 'Help Center — DocuIntelli AI | FAQs & Support',
    description: 'Get help with DocuIntelli AI. Find answers to common questions about uploading documents, AI chat, billing, document management, security, and account settings.',
    canonicalPath: '/help',
    jsonLd: [
      breadcrumb('Help Center', '/help'),
      faqSchema(HELP_FAQS),
    ],
  },

  '/status': {
    title: 'System Status — DocuIntelli AI | Service Health',
    description: 'Check the real-time operational status of DocuIntelli AI services including web application, API, database, AI processing, storage, and payment systems.',
    canonicalPath: '/status',
    jsonLd: [breadcrumb('System Status', '/status')],
  },

  '/beta': {
    title: 'Beta Program — DocuIntelli AI | Early Access Features',
    description: 'Join the DocuIntelli AI beta program for early access to new features including advanced AI document analysis, smart workflows, and enhanced financial tools.',
    canonicalPath: '/beta',
    jsonLd: [breadcrumb('Beta Program', '/beta')],
  },

  '/terms': {
    title: 'Terms & Conditions — DocuIntelli AI',
    description: 'Read the DocuIntelli AI terms of service covering account usage, document storage, subscription billing, data handling, and user responsibilities.',
    canonicalPath: '/terms',
    jsonLd: [breadcrumb('Terms & Conditions', '/terms')],
  },

  '/privacy': {
    title: 'Privacy Policy — DocuIntelli AI',
    description: 'Learn how DocuIntelli AI collects, uses, and protects your personal data and uploaded documents. Privacy-first approach with GDPR compliance.',
    canonicalPath: '/privacy',
    jsonLd: [breadcrumb('Privacy Policy', '/privacy')],
  },

  '/cookies': {
    title: 'Cookie Policy — DocuIntelli AI',
    description: 'DocuIntelli AI cookie policy explaining what cookies we use, why we use them, and how to manage your cookie preferences.',
    canonicalPath: '/cookies',
    jsonLd: [breadcrumb('Cookie Policy', '/cookies')],
  },

  '/security-policy': {
    title: 'Information Security Policy — DocuIntelli AI',
    description: 'DocuIntelli AI information security practices including AES-256 encryption, access controls, infrastructure security, incident response, and vulnerability management.',
    canonicalPath: '/security-policy',
    jsonLd: [breadcrumb('Security Policy', '/security-policy')],
  },

  '/data-retention': {
    title: 'Data Retention Policy — DocuIntelli AI',
    description: 'DocuIntelli AI data retention policy covering how long we store your documents, account data, and what happens when you delete your account. GDPR and CCPA compliant.',
    canonicalPath: '/data-retention',
    jsonLd: [breadcrumb('Data Retention', '/data-retention')],
  },

  '/vulnerability-management': {
    title: 'Vulnerability Management — DocuIntelli AI',
    description: 'DocuIntelli AI vulnerability disclosure and management policy. Learn how we identify, assess, and remediate security vulnerabilities to protect your data.',
    canonicalPath: '/vulnerability-management',
    jsonLd: [breadcrumb('Vulnerability Management', '/vulnerability-management')],
  },

  // Auth pages — noindex to prevent crawling login/signup shells
  '/login': { title: 'Sign In — DocuIntelli AI', description: '', canonicalPath: '/login', noindex: true },
  '/signup': { title: 'Sign Up — DocuIntelli AI', description: '', canonicalPath: '/signup', noindex: true },
  '/register': { title: 'Register — DocuIntelli AI', description: '', canonicalPath: '/register', noindex: true },
  '/forgot-password': { title: 'Reset Password — DocuIntelli AI', description: '', canonicalPath: '/forgot-password', noindex: true },

  // Authenticated pages — noindex to prevent crawling empty SPA shells
  '/dashboard': { title: 'Dashboard — DocuIntelli AI', description: '', canonicalPath: '/dashboard', noindex: true },
  '/vault': { title: 'Document Vault — DocuIntelli AI', description: '', canonicalPath: '/vault', noindex: true },
  '/settings': { title: 'Settings — DocuIntelli AI', description: '', canonicalPath: '/settings', noindex: true },
  '/audit': { title: 'Weekly Audit — DocuIntelli AI', description: '', canonicalPath: '/audit', noindex: true },
  '/life-events': { title: 'Life Events — DocuIntelli AI', description: '', canonicalPath: '/life-events', noindex: true },
  '/financial-insights': { title: 'Financial Insights — DocuIntelli AI', description: '', canonicalPath: '/financial-insights', noindex: true },
  '/admin': { title: 'Admin — DocuIntelli AI', description: '', canonicalPath: '/admin', noindex: true },
};

export const DEFAULT_SEO: RouteSeoConfig = {
  title: 'DocuIntelli AI — AI-Powered Document Management',
  description: 'Organize your important documents, get AI-powered insights, and stay on top of expirations, renewals, and life events with DocuIntelli AI.',
  canonicalPath: '/',
  noindex: true,
};

export function getSeoForRoute(path: string): RouteSeoConfig {
  const config = SEO_CONFIG[path];
  if (config) return config;
  // Unknown routes: use default SEO but with the actual path as canonical
  // and noindex to prevent phantom pages from polluting the index
  return { ...DEFAULT_SEO, canonicalPath: path };
}
