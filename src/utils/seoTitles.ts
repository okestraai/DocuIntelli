/**
 * Client-side page titles — mirrors server-side seoConfig.ts titles.
 * Used by App.tsx to update document.title on SPA navigation.
 */

const PAGE_TITLES: Record<string, string> = {
  landing: 'DocuIntelli AI — AI-Powered Document Management for Families',
  dashboard: 'Dashboard — DocuIntelli AI',
  vault: 'Document Vault — DocuIntelli AI',
  pricing: 'Pricing Plans — DocuIntelli AI | Free, Starter & Pro',
  settings: 'Settings — DocuIntelli AI',

  'life-events': 'Life Events — DocuIntelli AI',
  'financial-insights': 'Financial Insights — DocuIntelli AI',
  admin: 'Admin — DocuIntelli AI',
  terms: 'Terms & Conditions — DocuIntelli AI',
  privacy: 'Privacy Policy — DocuIntelli AI',
  cookies: 'Cookie Policy — DocuIntelli AI',
  help: 'Help Center — DocuIntelli AI',
  status: 'System Status — DocuIntelli AI',
  features: 'Features — DocuIntelli AI | Secure Vault, AI Chat, Smart Reminders',
  beta: 'Beta Program — DocuIntelli AI',
  'security-policy': 'Information Security Policy — DocuIntelli AI',
  'data-retention': 'Data Retention Policy — DocuIntelli AI',
  'vulnerability-management': 'Vulnerability Management — DocuIntelli AI',
  'emergency-invite': 'Emergency Access Invitation — DocuIntelli AI',
};

export function getPageTitle(page: string): string {
  return PAGE_TITLES[page] || 'DocuIntelli AI';
}
