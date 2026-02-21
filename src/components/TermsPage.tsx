import { ArrowLeft } from 'lucide-react';

interface TermsPageProps {
  onBack: () => void;
}

export function TermsPage({ onBack }: TermsPageProps) {
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
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Terms & Conditions</h1>
        <p className="text-slate-500 mb-10">Last updated: February 15, 2026</p>

        <div className="prose prose-slate max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Acceptance of Terms</h2>
            <p className="text-slate-600 leading-relaxed">
              By accessing or using DocuIntelli AI ("the Service"), you agree to be bound by these Terms and Conditions. If you do not agree to these terms, you may not use the Service. These terms apply to all visitors, users, and others who access or use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Description of Service</h2>
            <p className="text-slate-600 leading-relaxed">
              DocuIntelli AI is an AI-powered document management platform that allows users to upload, organize, and interact with personal documents including warranties, insurance policies, leases, employment contracts, and other important files. The Service includes document storage, AI-powered chat and analysis, automatic tagging, expiration tracking, and related features as described on our pricing page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. User Accounts</h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              To use the Service, you must create an account using a valid email address or Google authentication. You are responsible for:
            </p>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li>Maintaining the confidentiality of your account credentials</li>
              <li>All activities that occur under your account</li>
              <li>Notifying us immediately of any unauthorized use of your account</li>
              <li>Ensuring that the information you provide is accurate and up to date</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Subscription Plans & Billing</h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              DocuIntelli AI offers three subscription tiers: Free, Starter ($7/month or $70/year), and Pro ($19/month or $190/year). Each plan includes specific limits on document storage, monthly uploads, and AI questions as described on the pricing page.
            </p>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li><strong>Upgrades</strong> take effect immediately. You will be charged a prorated amount for the remainder of your current billing cycle.</li>
              <li><strong>Downgrades</strong> take effect at the end of your current billing period. If your document count exceeds the lower plan's limit, you will be asked to select which documents to retain.</li>
              <li><strong>Cancellations</strong> take effect at the end of the current billing period. After cancellation, your account reverts to the Free plan.</li>
              <li><strong>Monthly counters</strong> (uploads and AI questions) reset automatically at the start of each billing month. Unused quota does not carry over.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Acceptable Use</h2>
            <p className="text-slate-600 leading-relaxed mb-3">You agree not to use the Service to:</p>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li>Upload illegal, harmful, or infringing content</li>
              <li>Attempt to gain unauthorized access to other users' accounts or data</li>
              <li>Interfere with or disrupt the Service or its infrastructure</li>
              <li>Use automated scripts, bots, or scrapers to access the Service</li>
              <li>Resell, redistribute, or sublicense access to the Service</li>
              <li>Upload files containing malware, viruses, or other harmful code</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Document Storage & Ownership</h2>
            <p className="text-slate-600 leading-relaxed">
              You retain full ownership of all documents you upload to DocuIntelli AI. We do not claim any intellectual property rights over your content. Documents are stored securely using industry-standard encryption. You may download or delete your documents at any time. Upon account deletion, all associated documents and data will be permanently removed within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">7. AI Processing & Financial Insights</h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              The Service uses artificial intelligence to analyze document contents for features including chat, tagging, summarization, and expiration detection. AI-generated responses are provided for informational purposes only and should not be treated as legal, financial, or professional advice. We do not guarantee the accuracy, completeness, or reliability of AI-generated content.
            </p>
            <p className="text-slate-600 leading-relaxed mb-3">
              <strong>Financial Insights Disclaimer:</strong> The Financial Insights feature, including spending analysis, loan analysis, debt optimization suggestions, AI-generated financial recommendations, and any other financial intelligence provided by DocuIntelli AI, is for informational and educational purposes only. DocuIntelli AI does not replace the role of a certified financial advisor, certified financial planner, accountant, or any other licensed financial professional.
            </p>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li>Users are solely responsible for any financial decisions made based on the information, analysis, or recommendations provided by DocuIntelli AI.</li>
              <li>DocuIntelli AI does not provide personalized financial advice, investment advice, tax advice, or legal advice.</li>
              <li>AI-generated financial analysis may contain errors, inaccuracies, or outdated information. Always verify financial data independently.</li>
              <li>Past financial patterns identified by the Service do not guarantee future results.</li>
              <li>You should consult a qualified financial professional before making significant financial decisions, including but not limited to investments, debt management, refinancing, or tax planning.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Service Availability</h2>
            <p className="text-slate-600 leading-relaxed">
              We strive to maintain high availability of the Service but do not guarantee uninterrupted access. The Service may be temporarily unavailable due to maintenance, updates, or circumstances beyond our control. We will make reasonable efforts to notify users of planned maintenance in advance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">9. Limitation of Liability</h2>
            <p className="text-slate-600 leading-relaxed">
              To the maximum extent permitted by law, DocuIntelli AI and its affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of data, profits, or goodwill, arising out of or in connection with your use of the Service. Our total liability shall not exceed the amount you paid for the Service in the twelve months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">10. Changes to Terms</h2>
            <p className="text-slate-600 leading-relaxed">
              We reserve the right to modify these Terms at any time. We will notify users of material changes via email or through the Service. Continued use of the Service after changes take effect constitutes acceptance of the revised terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">11. Contact</h2>
            <p className="text-slate-600 leading-relaxed">
              If you have questions about these Terms, please contact us at{' '}
              <a href="mailto:legal@docuintelli.com" className="text-emerald-600 hover:text-emerald-700 underline">
                legal@docuintelli.com
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
