import { ArrowLeft } from 'lucide-react';

interface CookiePolicyPageProps {
  onBack: () => void;
}

export function CookiePolicyPage({ onBack }: CookiePolicyPageProps) {
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
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Cookie Policy</h1>
        <p className="text-slate-500 mb-10">Last updated: February 15, 2026</p>

        <div className="prose prose-slate max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. What Are Cookies</h2>
            <p className="text-slate-600 leading-relaxed">
              Cookies are small text files stored on your device when you visit a website. They help the website remember your preferences and improve your browsing experience. DocuIntelli AI uses cookies and similar technologies (such as local storage) to operate the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Cookies We Use</h2>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Cookie</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Purpose</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">sb-*-auth-token</td>
                    <td className="px-4 py-3 text-slate-600">Authentication session managed by Supabase. Required to keep you signed in.</td>
                    <td className="px-4 py-3 text-slate-600">Session</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">sb-*-auth-token-code-verifier</td>
                    <td className="px-4 py-3 text-slate-600">PKCE code verifier for secure OAuth flows (Google sign-in).</td>
                    <td className="px-4 py-3 text-slate-600">Session</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Local Storage</h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              In addition to cookies, we use browser local storage for the following purposes:
            </p>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li><strong>Authentication tokens:</strong> Supabase stores session tokens in local storage to maintain your signed-in state across page reloads.</li>
              <li><strong>User preferences:</strong> Notification dismissals and UI state preferences are stored locally for a smoother experience.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Third-Party Cookies</h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              The following third-party services may set cookies when you use DocuIntelli AI:
            </p>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li><strong>Stripe:</strong> When you visit the payment or billing pages, Stripe may set cookies for fraud detection and payment processing. See <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-700 underline">Stripe's Privacy Policy</a>.</li>
              <li><strong>Google (OAuth):</strong> If you sign in with Google, Google may set cookies during the authentication flow. See <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-700 underline">Google's Privacy Policy</a>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. No Tracking or Analytics Cookies</h2>
            <p className="text-slate-600 leading-relaxed">
              DocuIntelli AI does not use tracking cookies, advertising cookies, or third-party analytics services such as Google Analytics. We do not track your activity across other websites. The only cookies and storage we use are strictly necessary for the Service to function.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Managing Cookies</h2>
            <p className="text-slate-600 leading-relaxed">
              You can control cookies through your browser settings. Most browsers allow you to block or delete cookies. However, if you disable cookies required for authentication, you will not be able to sign in to DocuIntelli AI. Clearing your browser's local storage will sign you out.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Contact</h2>
            <p className="text-slate-600 leading-relaxed">
              Questions about our use of cookies? Contact us at{' '}
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
