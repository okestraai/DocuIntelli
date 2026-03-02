import { ArrowLeft } from 'lucide-react';

interface DataRetentionPolicyPageProps {
  onBack: () => void;
}

export function DataRetentionPolicyPage({ onBack }: DataRetentionPolicyPageProps) {
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
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Data Retention & Deletion Policy</h1>
        <p className="text-slate-500 mb-10">Last updated: February 19, 2026</p>

        <div className="prose prose-slate max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Purpose</h2>
            <p className="text-slate-600 leading-relaxed">
              This Data Retention & Deletion Policy defines how DocuIntelli AI collects, retains, and deletes personal and consumer data. It ensures compliance with applicable data privacy laws including the General Data Protection Regulation (GDPR), the California Consumer Privacy Act (CCPA), and other relevant regulations. This policy is reviewed at least annually and updated as needed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Scope</h2>
            <p className="text-slate-600 leading-relaxed">
              This policy applies to all personal data, consumer financial data, documents, usage records, and metadata processed by the DocuIntelli AI platform, including data received from third-party integrations such as payment processors and financial data providers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Data Categories & Retention Periods</h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              The following retention periods apply to each category of data we process:
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-900 border-b border-slate-200">Data Category</th>
                    <th className="px-4 py-3 font-semibold text-slate-900 border-b border-slate-200">Retention Period</th>
                    <th className="px-4 py-3 font-semibold text-slate-900 border-b border-slate-200">Deletion Method</th>
                  </tr>
                </thead>
                <tbody className="text-slate-600">
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium">Account information (email, name)</td>
                    <td className="px-4 py-3">Duration of account + 30 days after deletion request</td>
                    <td className="px-4 py-3">Permanent deletion from database</td>
                  </tr>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <td className="px-4 py-3 font-medium">Uploaded documents & files</td>
                    <td className="px-4 py-3">Until user deletes or account closure</td>
                    <td className="px-4 py-3">Immediate permanent deletion from database and file storage</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium">Document chunks & embeddings</td>
                    <td className="px-4 py-3">Same as parent document</td>
                    <td className="px-4 py-3">Cascade deletion with parent document</td>
                  </tr>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <td className="px-4 py-3 font-medium">AI-generated metadata (tags, summaries)</td>
                    <td className="px-4 py-3">Same as parent document</td>
                    <td className="px-4 py-3">Cascade deletion with parent document</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium">Financial data (from third-party integrations)</td>
                    <td className="px-4 py-3">Until user revokes access or account closure</td>
                    <td className="px-4 py-3">Permanent deletion; third-party access tokens revoked</td>
                  </tr>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <td className="px-4 py-3 font-medium">Usage logs (feature usage, API calls)</td>
                    <td className="px-4 py-3">30 days</td>
                    <td className="px-4 py-3">Automated purge via scheduled job</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium">Notification logs</td>
                    <td className="px-4 py-3">90 days</td>
                    <td className="px-4 py-3">Automated purge via scheduled job</td>
                  </tr>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <td className="px-4 py-3 font-medium">Limit violation records</td>
                    <td className="px-4 py-3">180 days</td>
                    <td className="px-4 py-3">Automated purge via scheduled job</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium">Review & audit events</td>
                    <td className="px-4 py-3">365 days</td>
                    <td className="px-4 py-3">Automated purge via scheduled job</td>
                  </tr>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <td className="px-4 py-3 font-medium">Payment records</td>
                    <td className="px-4 py-3">Per Stripe retention (PCI-DSS compliant)</td>
                    <td className="px-4 py-3">Managed by Stripe; local references deleted with account</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">Orphaned data (chunks without parent doc)</td>
                    <td className="px-4 py-3">7 days maximum</td>
                    <td className="px-4 py-3">Automated weekly cleanup job</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Automated Enforcement</h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              Retention limits are enforced automatically through scheduled database tasks (pg_cron):
            </p>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li><strong>Daily cleanup:</strong> Usage logs older than 30 days and notification logs older than 90 days are automatically purged.</li>
              <li><strong>Periodic cleanup:</strong> Limit violation records (180 days), review events (365 days), and orphaned document chunks (weekly) are purged on schedule.</li>
              <li><strong>Real-time deletion:</strong> When a user deletes a document, all associated data (file in storage, database records, text chunks, vector embeddings, tags) is removed immediately in a single transaction.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Account Deletion Process</h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              Users may request full account deletion at any time from their Account Settings. The process is as follows:
            </p>
            <ol className="list-decimal pl-6 text-slate-600 space-y-2">
              <li>User initiates deletion by typing the confirmation keyword "DELETE" in the Account Settings page.</li>
              <li>All documents owned by the user are deleted from the database, including chunks and embeddings.</li>
              <li>All files associated with the user are permanently removed from file storage (Supabase Storage).</li>
              <li>Subscription records and billing references are deactivated. Active Stripe subscriptions are cancelled.</li>
              <li>A confirmation email is sent to the user's registered email address.</li>
              <li>The user session is terminated immediately.</li>
              <li>Any residual account data is permanently purged within 30 days.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Financial Data Handling</h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              For features involving third-party financial data integrations (e.g., account balances, transaction feeds):
            </p>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li><strong>Access tokens:</strong> Third-party access tokens are stored encrypted at rest and are never exposed to the frontend client.</li>
              <li><strong>Data minimization:</strong> Only the data necessary to provide the requested feature is retrieved and stored. Raw API responses are not persisted beyond processing.</li>
              <li><strong>Revocation:</strong> Users may disconnect third-party integrations at any time, which immediately revokes the access token and deletes all associated financial data from our systems.</li>
              <li><strong>No secondary use:</strong> Financial data is never used for advertising, profiling, or sold to third parties. It is used solely to provide the features the user has consented to.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Consumer Rights</h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              In accordance with GDPR, CCPA, and other applicable regulations, consumers have the following rights regarding their data:
            </p>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li><strong>Right to access:</strong> Users may download their uploaded documents and request a copy of their personal data at any time.</li>
              <li><strong>Right to correction:</strong> Users may update their profile information from Account Settings.</li>
              <li><strong>Right to deletion:</strong> Users may delete individual documents or request full account deletion (see Section 5).</li>
              <li><strong>Right to data portability:</strong> Users may export their documents in their original uploaded format.</li>
              <li><strong>Right to restrict processing:</strong> Users may contact us to request restrictions on specific data processing activities.</li>
              <li><strong>Right to object:</strong> Users may opt out of non-essential data processing and email communications from Account Settings.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Policy Review</h2>
            <p className="text-slate-600 leading-relaxed">
              This policy is reviewed at least annually by the security and privacy team, or whenever a material change occurs to our data processing activities, infrastructure, third-party integrations, or applicable regulations. Updates are published on this page with a revised "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">9. Contact</h2>
            <p className="text-slate-600 leading-relaxed">
              For data retention or deletion inquiries, or to exercise your data rights, contact us at{' '}
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
