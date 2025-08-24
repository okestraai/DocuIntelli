import React from 'react';
import { Shield, FileText, MessageSquare, Bell, Lock, Smartphone, ArrowRight, CheckCircle } from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20">
          <div className="text-center">
            <div className="flex justify-center mb-8">
              <Shield className="h-16 w-16 text-blue-600" />
            </div>
            <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 mb-6 tracking-tight">
              Legal<span className="text-blue-600">Ease</span>
            </h1>
            <p className="text-xl sm:text-2xl text-gray-600 mb-4 max-w-3xl mx-auto leading-relaxed">
              Your personal legal document assistant
            </p>
            <p className="text-lg text-gray-500 mb-8 max-w-2xl mx-auto">
              Store, understand, and manage all your legal and financial documents in one secure place. 
              Never miss another expiration date or struggle with complex legal language again.
            </p>
            <button
              onClick={onGetStarted}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-8 rounded-xl text-lg transition-all duration-200 hover:shadow-lg transform hover:-translate-y-0.5 inline-flex items-center space-x-2"
            >
              <span>Get Started Free</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything you need to manage legal documents
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From warranties to insurance policies, LegalEase makes complex legal documents simple and actionable.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-shadow">
              <div className="bg-blue-100 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Secure Document Vault</h3>
              <p className="text-gray-600 leading-relaxed">
                Upload and organize all your legal documents in one encrypted space. Support for PDFs, 
                Word docs, and even scanned images with OCR.
              </p>
            </div>

            <div className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-shadow">
              <div className="bg-green-100 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                <MessageSquare className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">AI-Powered Q&A</h3>
              <p className="text-gray-600 leading-relaxed">
                Ask questions in plain English and get instant answers. "What's covered under my insurance?" 
                or "How do I file a claim?" - just ask.
              </p>
            </div>

            <div className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-shadow">
              <div className="bg-orange-100 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                <Bell className="h-6 w-6 text-orange-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Smart Reminders</h3>
              <p className="text-gray-600 leading-relaxed">
                Never miss important dates again. Get notified before warranties expire, 
                insurance renewals are due, or lease agreements end.
              </p>
            </div>

            <div className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-shadow">
              <div className="bg-purple-100 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                <Lock className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Bank-Level Security</h3>
              <p className="text-gray-600 leading-relaxed">
                Your documents are protected with end-to-end encryption. 
                We never use your data for training and you maintain complete privacy.
              </p>
            </div>

            <div className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-shadow">
              <div className="bg-teal-100 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                <Smartphone className="h-6 w-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Cross-Device Access</h3>
              <p className="text-gray-600 leading-relaxed">
                Access your documents anywhere, anytime. Seamlessly synced across 
                desktop, tablet, and mobile with offline capability.
              </p>
            </div>

            <div className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-shadow">
              <div className="bg-red-100 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                <CheckCircle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Actionable Insights</h3>
              <p className="text-gray-600 leading-relaxed">
                Get clear, actionable summaries for every document. Know your coverage, 
                understand your rights, and learn the steps for claims or renewals.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Use Cases Section */}
      <div className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Perfect for all your important documents
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Whether it's warranties, insurance, leases, or contracts - LegalEase helps you stay organized and informed.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="space-y-8">
                <div className="flex items-start space-x-4">
                  <div className="bg-blue-600 text-white rounded-full p-2 flex-shrink-0">
                    <span className="text-sm font-semibold">1</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Warranties & Extended Protection</h3>
                    <p className="text-gray-600">Upload electronics and appliance warranties. Ask "What repairs are covered?" Get notified before they expire.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="bg-blue-600 text-white rounded-full p-2 flex-shrink-0">
                    <span className="text-sm font-semibold">2</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Insurance Policies</h3>
                    <p className="text-gray-600">Manage car, health, and home insurance. Understand your coverage and get renewal reminders.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="bg-blue-600 text-white rounded-full p-2 flex-shrink-0">
                    <span className="text-sm font-semibold">3</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Rental & Lease Agreements</h3>
                    <p className="text-gray-600">Know your tenant rights, understand lease terms, and track renewal dates automatically.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="bg-blue-600 text-white rounded-full p-2 flex-shrink-0">
                    <span className="text-sm font-semibold">4</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Employment & Service Contracts</h3>
                    <p className="text-gray-600">Understand your employment terms, freelance agreements, and service contracts with ease.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-xl">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Example Q&A</h4>
                <div className="space-y-3">
                  <div className="bg-white p-3 rounded-lg">
                    <p className="text-sm text-gray-600 mb-1">You asked:</p>
                    <p className="text-gray-900">"What is my car insurance deductible?"</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm text-blue-600 mb-1">LegalEase answered:</p>
                    <p className="text-gray-900">Your collision deductible is $500 and comprehensive deductible is $250, as stated in Section 3.2 of your policy.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-blue-600 py-16">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to simplify your legal documents?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join thousands of users who trust LegalEase to keep their important documents organized and accessible.
          </p>
          <button
            onClick={onGetStarted}
            className="bg-white hover:bg-gray-100 text-blue-600 font-semibold py-4 px-8 rounded-xl text-lg transition-all duration-200 hover:shadow-lg transform hover:-translate-y-0.5 inline-flex items-center space-x-2"
          >
            <span>Start Your Free Account</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}