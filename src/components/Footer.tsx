import { FileText, Mail, Shield, Twitter, Linkedin, Github } from 'lucide-react';
import type { Page } from '../App';

interface FooterProps {
  onNavigate: (page: Page) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  const currentYear = new Date().getFullYear();

  const navButton = (label: string, page: Page) => (
    <li>
      <button
        onClick={() => onNavigate(page)}
        className="text-sm text-slate-400 hover:text-emerald-400 transition-colors"
      >
        {label}
      </button>
    </li>
  );

  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-500 p-1.5 rounded-lg">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-white">DocuIntelli AI</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              AI-powered document management for individuals and families. Organize, understand, and act on your important documents.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://twitter.com/docuintelli"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-emerald-400 transition-colors"
                aria-label="Twitter"
              >
                <Twitter className="h-5 w-5" />
              </a>
              <a
                href="https://linkedin.com/company/docuintelli"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-emerald-400 transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-5 w-5" />
              </a>
              <a
                href="https://github.com/docuintelli"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-emerald-400 transition-colors"
                aria-label="GitHub"
              >
                <Github className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Product</h4>
            <ul className="space-y-3">
              {navButton('Pricing', 'pricing')}
              {navButton('Features', 'features')}
              {navButton('System Status', 'status')}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Legal</h4>
            <ul className="space-y-3">
              {navButton('Terms & Conditions', 'terms')}
              {navButton('Privacy Policy', 'privacy')}
              {navButton('Cookie Policy', 'cookies')}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Support</h4>
            <ul className="space-y-3">
              <li>
                <a
                  href="mailto:support@docuintelli.com"
                  className="text-sm text-slate-400 hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Contact Us
                </a>
              </li>
              {navButton('Help Center', 'help')}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            &copy; {currentYear} DocuIntelli AI. All rights reserved.
          </p>
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <Shield className="h-3.5 w-3.5" />
            <span>Your documents are encrypted and secure</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
