import React from 'react';
import { ShieldCheck, FileText, MessageSquare, Bell, Lock, Smartphone, ArrowRight, CheckCircle, Sparkles, Shield } from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.05),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_60%,rgba(14,165,233,0.05),transparent_50%)]"></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 pb-16 sm:pb-24">
          <div className="text-center">
            <div className="flex justify-center mb-6 sm:mb-8">
              <div className="bg-gradient-to-br from-emerald-600 to-teal-600 p-4 sm:p-5 rounded-2xl shadow-lg">
                <ShieldCheck className="h-10 w-10 sm:h-12 sm:w-12 text-white" strokeWidth={2.5} />
              </div>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 mb-4 sm:mb-6 tracking-tight px-4">
              DocuVault <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600">AI</span>
            </h1>
            <p className="text-lg sm:text-xl lg:text-2xl text-slate-600 mb-3 sm:mb-4 max-w-3xl mx-auto leading-relaxed px-4">
              Your intelligent legal document companion
            </p>
            <p className="text-base sm:text-lg text-slate-500 mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed px-4">
              Store, understand, and manage all your legal and financial documents in one secure place.
              Never miss another expiration date or struggle with complex legal language.
            </p>
            <button
              onClick={onGetStarted}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold py-3 sm:py-4 px-6 sm:px-8 rounded-xl text-base sm:text-lg transition-all duration-200 hover:shadow-xl transform hover:-translate-y-0.5 inline-flex items-center gap-2 shadow-lg"
            >
              <span>Get Started Free</span>
              <ArrowRight className="h-5 w-5" />
            </button>
            <p className="mt-4 text-sm text-slate-500">No credit card required • Free forever</p>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-12 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Sparkles className="h-4 w-4" />
              <span>Powerful Features</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
              Everything you need to manage<br className="hidden sm:inline" /> legal documents
            </h2>
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
              From warranties to insurance policies, DocuVault AI makes complex legal documents simple and actionable
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            <div className="group bg-white border border-slate-200 p-6 sm:p-8 rounded-2xl hover:shadow-xl hover:border-emerald-200 transition-all duration-300">
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center mb-5 sm:mb-6 group-hover:scale-110 transition-transform">
                <FileText className="h-6 w-6 sm:h-7 sm:w-7 text-emerald-600" strokeWidth={2} />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-3">Secure Document Vault</h3>
              <p className="text-slate-600 leading-relaxed text-sm sm:text-base">
                Upload and organize all your legal documents in one encrypted space. Support for PDFs,
                Word docs, and scanned images with OCR.
              </p>
            </div>

            <div className="group bg-white border border-slate-200 p-6 sm:p-8 rounded-2xl hover:shadow-xl hover:border-teal-200 transition-all duration-300">
              <div className="bg-gradient-to-br from-teal-50 to-cyan-50 w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center mb-5 sm:mb-6 group-hover:scale-110 transition-transform">
                <MessageSquare className="h-6 w-6 sm:h-7 sm:w-7 text-teal-600" strokeWidth={2} />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-3">AI-Powered Q&A</h3>
              <p className="text-slate-600 leading-relaxed text-sm sm:text-base">
                Ask questions in plain English and get instant answers. "What's covered under my insurance?"
                or "How do I file a claim?" - just ask.
              </p>
            </div>

            <div className="group bg-white border border-slate-200 p-6 sm:p-8 rounded-2xl hover:shadow-xl hover:border-amber-200 transition-all duration-300">
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center mb-5 sm:mb-6 group-hover:scale-110 transition-transform">
                <Bell className="h-6 w-6 sm:h-7 sm:w-7 text-amber-600" strokeWidth={2} />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-3">Smart Reminders</h3>
              <p className="text-slate-600 leading-relaxed text-sm sm:text-base">
                Never miss important dates. Get notified before warranties expire,
                insurance renewals are due, or lease agreements end.
              </p>
            </div>

            <div className="group bg-white border border-slate-200 p-6 sm:p-8 rounded-2xl hover:shadow-xl hover:border-violet-200 transition-all duration-300">
              <div className="bg-gradient-to-br from-violet-50 to-purple-50 w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center mb-5 sm:mb-6 group-hover:scale-110 transition-transform">
                <Lock className="h-6 w-6 sm:h-7 sm:w-7 text-violet-600" strokeWidth={2} />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-3">Bank-Level Security</h3>
              <p className="text-slate-600 leading-relaxed text-sm sm:text-base">
                Your documents are protected with end-to-end encryption.
                We never use your data for training and you maintain complete privacy.
              </p>
            </div>

            <div className="group bg-white border border-slate-200 p-6 sm:p-8 rounded-2xl hover:shadow-xl hover:border-blue-200 transition-all duration-300">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center mb-5 sm:mb-6 group-hover:scale-110 transition-transform">
                <Smartphone className="h-6 w-6 sm:h-7 sm:w-7 text-blue-600" strokeWidth={2} />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-3">Cross-Device Access</h3>
              <p className="text-slate-600 leading-relaxed text-sm sm:text-base">
                Access your documents anywhere, anytime. Seamlessly synced across
                desktop, tablet, and mobile.
              </p>
            </div>

            <div className="group bg-white border border-slate-200 p-6 sm:p-8 rounded-2xl hover:shadow-xl hover:border-emerald-200 transition-all duration-300">
              <div className="bg-gradient-to-br from-emerald-50 to-green-50 w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center mb-5 sm:mb-6 group-hover:scale-110 transition-transform">
                <CheckCircle className="h-6 w-6 sm:h-7 sm:w-7 text-emerald-600" strokeWidth={2} />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-3">Actionable Insights</h3>
              <p className="text-slate-600 leading-relaxed text-sm sm:text-base">
                Get clear, actionable summaries for every document. Know your coverage,
                understand your rights, and learn the steps for claims.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Use Cases Section */}
      <div className="py-12 sm:py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
              Perfect for all your<br className="sm:hidden" /> important documents
            </h2>
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
              Whether it's warranties, insurance, leases, or contracts - DocuVault AI helps you stay organized and informed
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div>
              <div className="space-y-6 sm:space-y-8">
                <div className="flex items-start gap-4">
                  <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white rounded-xl p-2.5 sm:p-3 flex-shrink-0 shadow-lg">
                    <span className="text-base sm:text-lg font-bold">1</span>
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">Warranties & Extended Protection</h3>
                    <p className="text-slate-600 text-sm sm:text-base">Upload electronics and appliance warranties. Ask "What repairs are covered?" Get notified before they expire.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white rounded-xl p-2.5 sm:p-3 flex-shrink-0 shadow-lg">
                    <span className="text-base sm:text-lg font-bold">2</span>
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">Insurance Policies</h3>
                    <p className="text-slate-600 text-sm sm:text-base">Manage car, health, and home insurance. Understand your coverage and get renewal reminders.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white rounded-xl p-2.5 sm:p-3 flex-shrink-0 shadow-lg">
                    <span className="text-base sm:text-lg font-bold">3</span>
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">Rental & Lease Agreements</h3>
                    <p className="text-slate-600 text-sm sm:text-base">Know your tenant rights, understand lease terms, and track renewal dates automatically.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white rounded-xl p-2.5 sm:p-3 flex-shrink-0 shadow-lg">
                    <span className="text-base sm:text-lg font-bold">4</span>
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">Employment & Service Contracts</h3>
                    <p className="text-slate-600 text-sm sm:text-base">Understand your employment terms, freelance agreements, and service contracts with ease.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200">
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-5 sm:p-6 rounded-xl border border-emerald-100">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="h-5 w-5 text-emerald-600" />
                  <h4 className="text-base sm:text-lg font-semibold text-slate-900">Example Q&A</h4>
                </div>
                <div className="space-y-3">
                  <div className="bg-white p-3 sm:p-4 rounded-lg border border-slate-200 shadow-sm">
                    <p className="text-xs sm:text-sm text-slate-500 mb-1.5">You asked:</p>
                    <p className="text-slate-900 text-sm sm:text-base font-medium">"What is my car insurance deductible?"</p>
                  </div>
                  <div className="bg-emerald-50 p-3 sm:p-4 rounded-lg border border-emerald-200">
                    <p className="text-xs sm:text-sm text-emerald-700 mb-1.5 font-medium">DocuVault AI answered:</p>
                    <p className="text-slate-900 text-sm sm:text-base">Your collision deductible is $500 and comprehensive deductible is $250, as stated in Section 3.2 of your policy.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="relative bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-700 py-12 sm:py-16 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_60%,rgba(255,255,255,0.1),transparent_50%)]"></div>
        <div className="relative max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
            Ready to simplify your<br className="sm:hidden" /> legal documents?
          </h2>
          <p className="text-lg sm:text-xl text-emerald-50 mb-8 sm:mb-10">
            Join thousands who trust DocuVault AI to keep their important documents organized and accessible
          </p>
          <button
            onClick={onGetStarted}
            className="bg-white hover:bg-slate-50 text-emerald-700 font-semibold py-3 sm:py-4 px-6 sm:px-8 rounded-xl text-base sm:text-lg transition-all duration-200 hover:shadow-2xl transform hover:-translate-y-0.5 inline-flex items-center gap-2 shadow-xl"
          >
            <span>Start Your Free Account</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
