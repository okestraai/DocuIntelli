import { ArrowLeft } from 'lucide-react';

interface PrivacyPageProps {
  onBack: () => void;
}

export function PrivacyPage({ onBack }: PrivacyPageProps) {
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
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-slate-500 mb-10">Last updated: February 15, 2026</p>

        <div className="prose prose-slate max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Introduction</h2>
            <p className="text-slate-600 leading-relaxed">
              DocuIntelli AI ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our document management platform. By using DocuIntelli AI, you consent to the practices described in this policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Information We Collect</h2>

            <h3 className="text-lg font-medium text-slate-800 mt-4 mb-2">Account Information</h3>
            <p className="text-slate-600 leading-relaxed mb-3">
              When you create an account, we collect your email address and display name. If you sign in with Google, we receive your name, email, and profile picture from Google's authentication service.
            </p>

            <h3 className="text-lg font-medium text-slate-800 mt-4 mb-2">Documents & Content</h3>
            <p className="text-slate-600 leading-relaxed mb-3">
              We store the documents you upload, including the file content, metadata (name, category, tags, expiration date), and AI-generated data (text chunks, embeddings, summaries). Document content is processed by our AI systems solely to provide the Service's features.
            </p>

            <h3 className="text-lg font-medium text-slate-800 mt-4 mb-2">Usage Data</h3>
            <p className="text-slate-600 leading-relaxed">
              We collect usage information such as features accessed, documents uploaded, AI questions asked, and subscription activity. This data helps us improve the Service and enforce plan limits.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li><strong>Provide the Service:</strong> Store and process your documents, power AI chat and analysis, generate tags and embeddings, and track expirations.</li>
              <li><strong>Account Management:</strong> Authenticate your identity, manage your subscription, and process payments through Stripe.</li>
              <li><strong>Communications:</strong> Send transactional emails (document processing notifications, expiration alerts, weekly audits, usage warnings). You can manage notification preferences in Account Settings.</li>
              <li><strong>Improvement:</strong> Analyze aggregate usage patterns to improve features, performance, and user experience. We do not use your document content for training AI models.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Data Storage & Security</h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              Your data is stored in Supabase (built on PostgreSQL) with the following security measures:
            </p>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li><strong>Encryption at rest:</strong> All data is encrypted using AES-256 encryption at the database level.</li>
              <li><strong>Encryption in transit:</strong> All data is transmitted over TLS 1.2+.</li>
              <li><strong>Row-Level Security (RLS):</strong> Database policies ensure users can only access their own documents and data.</li>
              <li><strong>File storage:</strong> Documents are stored in Supabase Storage with access controlled by authenticated signed URLs.</li>
              <li><strong>AI processing:</strong> Document content is sent to our dedicated AI infrastructure (vLLM) over encrypted connections with Cloudflare Access authentication. Your documents are not stored by the AI processing system beyond the duration of the request.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Third-Party Services</h2>
            <p className="text-slate-600 leading-relaxed mb-3">We use the following third-party services:</p>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li><strong>Supabase:</strong> Database hosting, authentication, and file storage.</li>
              <li><strong>Stripe:</strong> Payment processing. We do not store your full credit card details — Stripe handles all payment information under PCI-DSS Level 1 compliance.</li>
              <li><strong>Mailjet:</strong> Transactional email delivery for notifications, alerts, and weekly audits.</li>
              <li><strong>Cloudflare:</strong> CDN, security, and access control for our AI infrastructure.</li>
            </ul>
            <p className="text-slate-600 leading-relaxed mt-3">
              Each third-party service has its own privacy policy governing their handling of your data. We only share the minimum information necessary for each service to function.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Data Retention</h2>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li><strong>Active accounts:</strong> Your documents and account data are retained as long as your account is active.</li>
              <li><strong>Deleted documents:</strong> When you delete a document, it and all associated data (chunks, embeddings, tags) are permanently removed immediately.</li>
              <li><strong>Account deletion:</strong> Upon request, all account data including documents, subscription records, and usage logs are permanently deleted within 30 days.</li>
              <li><strong>Logs:</strong> Usage logs are retained for 30 days, notification logs for 90 days, and limit violation records for 180 days for operational purposes, then automatically purged.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Your Rights</h2>
            <p className="text-slate-600 leading-relaxed mb-3">You have the right to:</p>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li><strong>Access:</strong> Download any of your uploaded documents at any time from the Document Vault.</li>
              <li><strong>Correction:</strong> Update your profile information from Account Settings.</li>
              <li><strong>Deletion:</strong> Delete individual documents or request full account deletion.</li>
              <li><strong>Portability:</strong> Export your documents in their original uploaded format.</li>
              <li><strong>Opt-out:</strong> Disable email notifications from Account Settings.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Children's Privacy</h2>
            <p className="text-slate-600 leading-relaxed">
              DocuIntelli AI is not intended for use by children under the age of 16. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, please contact us and we will delete that information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">9. Changes to This Policy</h2>
            <p className="text-slate-600 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of material changes via email or through the Service. The "Last updated" date at the top of this page indicates when this policy was last revised.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">10. Contact Us</h2>
            <p className="text-slate-600 leading-relaxed">
              For privacy-related questions or requests, contact us at{' '}
              <a href="mailto:privacy@docuintelli.com" className="text-emerald-600 hover:text-emerald-700 underline">
                privacy@docuintelli.com
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
