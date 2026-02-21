/**
 * DocuIntelli AI - Email Templates
 *
 * Branded email templates for all notification scenarios.
 * Design: Emerald/teal gradient brand, clean modern layout, mobile-responsive.
 */

// ─── Brand Constants ───────────────────────────────────────────────────────────

const BRAND = {
  name: 'DocuIntelli AI',
  tagline: 'Your Intelligent Document Vault',
  primaryColor: '#059669',     // emerald-600
  primaryDark: '#0d9488',      // teal-600
  gradientStart: '#059669',    // emerald-600
  gradientEnd: '#0d9488',      // teal-600
  textDark: '#1e293b',         // slate-800
  textMuted: '#64748b',        // slate-500
  textLight: '#94a3b8',        // slate-400
  bgLight: '#f8fafc',          // slate-50
  bgCard: '#ffffff',
  borderColor: '#e2e8f0',      // slate-200
  successColor: '#059669',     // emerald-600
  warningColor: '#d97706',     // amber-600
  dangerColor: '#dc2626',      // red-600
  infoColor: '#2563eb',        // blue-600
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  supportEmail: process.env.SUPPORT_EMAIL || 'support@docuintelli.com',
  year: new Date().getFullYear(),
};

// ─── Base Layout ───────────────────────────────────────────────────────────────

function baseLayout(content: string, preheader?: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${BRAND.name}</title>
  ${preheader ? `<span style="display:none;font-size:1px;color:#f8fafc;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>` : ''}
  <style>
    /* Reset */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; max-width: 100%; }
    table { border-collapse: collapse !important; }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: #0f172a !important; }
      .email-card { background-color: #1e293b !important; }
      .email-text-dark { color: #f1f5f9 !important; }
      .email-text-muted { color: #94a3b8 !important; }
      .email-border { border-color: #334155 !important; }
    }

    /* Mobile responsive */
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; padding: 12px !important; }
      .email-card { padding: 24px 20px !important; }
      .email-heading { font-size: 22px !important; }
      .email-btn { display: block !important; width: 100% !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:${BRAND.bgLight}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.bgLight};" class="email-bg">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;" class="email-container">

          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:${BRAND.gradientStart}; background:linear-gradient(135deg,${BRAND.gradientStart},${BRAND.gradientEnd}); width:44px; height:44px; border-radius:14px; text-align:center; vertical-align:middle; font-size:20px; line-height:44px; color:#ffffff;">&#x2713;</td>
                  <td style="padding-left:12px; vertical-align:middle;">
                    <span style="font-size:22px; font-weight:700; color:${BRAND.textDark}; letter-spacing:-0.5px;" class="email-text-dark">${BRAND.name}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Card -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.bgCard}; border-radius:16px; border:1px solid ${BRAND.borderColor}; overflow:hidden;" class="email-card email-border">
                <tr>
                  <td style="padding:36px 32px;">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px; text-align:center;">
              <p style="font-size:13px; color:${BRAND.textLight}; line-height:1.6; margin:0;" class="email-text-muted">
                ${BRAND.name} &mdash; ${BRAND.tagline}
              </p>
              <p style="font-size:12px; color:${BRAND.textLight}; line-height:1.6; margin:4px 0 0;" class="email-text-muted">
                <a href="${BRAND.appUrl}" style="color:${BRAND.primaryColor}; text-decoration:none;">Open App</a>
                &nbsp;&bull;&nbsp;
                <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.primaryColor}; text-decoration:none;">Contact Support</a>
              </p>
              <p style="font-size:11px; color:${BRAND.textLight}; margin-top:12px;" class="email-text-muted">
                &copy; ${BRAND.year} ${BRAND.name}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Reusable Components ───────────────────────────────────────────────────────

function iconBadge(emoji: string, bgColor: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
    <tr>
      <td style="width:56px; height:56px; border-radius:16px; background-color:${bgColor}10; background:${bgColor}10; text-align:center; vertical-align:middle; font-size:28px; line-height:56px;">${emoji}</td>
    </tr>
  </table>`;
}

function heading(text: string): string {
  return `<h1 style="font-size:24px; font-weight:700; color:${BRAND.textDark}; margin:0 0 8px; line-height:1.3; letter-spacing:-0.3px;" class="email-heading email-text-dark">${text}</h1>`;
}

function subheading(text: string): string {
  return `<p style="font-size:15px; color:${BRAND.textMuted}; margin:0 0 24px; line-height:1.6;" class="email-text-muted">${text}</p>`;
}

function paragraph(text: string): string {
  return `<p style="font-size:15px; color:${BRAND.textDark}; margin:0 0 16px; line-height:1.7;" class="email-text-dark">${text}</p>`;
}

function primaryButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="border-radius:12px; background:linear-gradient(135deg,${BRAND.gradientStart},${BRAND.gradientEnd});" class="email-btn">
        <a href="${url}" target="_blank" style="display:inline-block; padding:14px 32px; color:#ffffff; font-size:15px; font-weight:600; text-decoration:none; border-radius:12px; letter-spacing:0.2px;">${text}</a>
      </td>
    </tr>
  </table>`;
}

function secondaryButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
    <tr>
      <td style="border-radius:12px; border:2px solid ${BRAND.borderColor};">
        <a href="${url}" target="_blank" style="display:inline-block; padding:12px 28px; color:${BRAND.textDark}; font-size:14px; font-weight:600; text-decoration:none; border-radius:12px;">${text}</a>
      </td>
    </tr>
  </table>`;
}

function infoBox(content: string, accentColor: string = BRAND.primaryColor): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td style="background:${accentColor}08; border-left:4px solid ${accentColor}; border-radius:0 12px 12px 0; padding:16px 20px;">
        ${content}
      </td>
    </tr>
  </table>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0; font-size:14px; color:${BRAND.textMuted}; width:40%;" class="email-text-muted">${label}</td>
    <td style="padding:8px 0; font-size:14px; font-weight:600; color:${BRAND.textDark}; text-align:right;" class="email-text-dark">${value}</td>
  </tr>`;
}

function detailsTable(rows: { label: string; value: string }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0; border-top:1px solid ${BRAND.borderColor}; border-bottom:1px solid ${BRAND.borderColor};" class="email-border">
    ${rows.map(r => detailRow(r.label, r.value)).join('')}
  </table>`;
}

function divider(): string {
  return `<hr style="border:none; border-top:1px solid ${BRAND.borderColor}; margin:24px 0;" class="email-border">`;
}

function smallText(text: string): string {
  return `<p style="font-size:13px; color:${BRAND.textLight}; margin:16px 0 0; line-height:1.6;" class="email-text-muted">${text}</p>`;
}

// ─── Template: Welcome Email ───────────────────────────────────────────────────

export interface WelcomeEmailData {
  userName: string;
  email: string;
}

export function welcomeEmail(data: WelcomeEmailData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const content = `
    ${iconBadge('👋', BRAND.primaryColor)}
    ${heading(`Welcome to ${BRAND.name}!`)}
    ${subheading(`Hi ${firstName}, we're glad you're here.`)}
    ${paragraph(`${BRAND.name} is your intelligent document vault — a secure place to store, organize, and manage all your important documents with AI-powered insights.`)}
    ${infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.textDark}; margin:0 0 8px;" class="email-text-dark">Here's what you can do:</p>
      <ul style="margin:0; padding-left:20px; font-size:14px; color:${BRAND.textMuted}; line-height:2;" class="email-text-muted">
        <li>Upload and organize important documents</li>
        <li>Get AI-powered document chat and insights</li>
        <li>Track expiration dates with smart reminders</li>
        <li>Monitor your document health and preparedness</li>
      </ul>
    `)}
    ${primaryButton('Open Your Vault', `${BRAND.appUrl}#vault`)}
    ${smallText(`You're currently on the <strong>Free plan</strong> (3 documents, 5 AI questions/month). Upgrade anytime for more.`)}
  `;
  return {
    subject: `Welcome to ${BRAND.name} — Let's get your documents organized`,
    html: baseLayout(content, `Welcome aboard! Your intelligent document vault is ready.`),
  };
}

// ─── Template: Password Changed ────────────────────────────────────────────────

export interface PasswordChangedData {
  userName: string;
  email: string;
  timestamp: string;
}

export function passwordChangedEmail(data: PasswordChangedData): { subject: string; html: string } {
  const content = `
    ${iconBadge('🔒', BRAND.warningColor)}
    ${heading('Password Changed')}
    ${subheading('Your account password was successfully updated.')}
    ${detailsTable([
      { label: 'Account', value: data.email },
      { label: 'Changed at', value: new Date(data.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) },
    ])}
    ${infoBox(`
      <p style="font-size:14px; color:${BRAND.warningColor}; font-weight:600; margin:0 0 4px;">Didn't make this change?</p>
      <p style="font-size:13px; color:${BRAND.textMuted}; margin:0;" class="email-text-muted">If you didn't change your password, please reset it immediately and contact our support team.</p>
    `, BRAND.warningColor)}
    ${primaryButton('Open Account Settings', `${BRAND.appUrl}#settings`)}
    ${smallText(`If you made this change, no further action is needed.`)}
  `;
  return {
    subject: `${BRAND.name} — Your password was changed`,
    html: baseLayout(content, `Your account password was successfully updated.`),
  };
}

// ─── Template: Account Deleted ─────────────────────────────────────────────────

export interface AccountDeletedData {
  userName: string;
  email: string;
  documentCount: number;
}

export function accountDeletedEmail(data: AccountDeletedData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const content = `
    ${iconBadge('👋', BRAND.textMuted)}
    ${heading('Account Deleted')}
    ${subheading(`Hi ${firstName}, your account has been permanently deleted.`)}
    ${paragraph('All your data, including documents, chat history, and preferences, has been removed from our systems.')}
    ${detailsTable([
      { label: 'Account', value: data.email },
      { label: 'Documents removed', value: String(data.documentCount) },
      { label: 'Deleted on', value: new Date().toLocaleString('en-US', { dateStyle: 'medium' }) },
    ])}
    ${paragraph(`We're sorry to see you go. If you ever want to come back, you can create a new account at any time.`)}
    ${smallText(`If you didn't request this deletion, please contact us immediately at <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.primaryColor};">${BRAND.supportEmail}</a>.`)}
  `;
  return {
    subject: `${BRAND.name} — Your account has been deleted`,
    html: baseLayout(content, `Your DocuIntelli AI account has been permanently deleted.`),
  };
}

// ─── Template: Subscription Confirmed ──────────────────────────────────────────

export interface SubscriptionConfirmedData {
  userName: string;
  plan: 'starter' | 'pro';
  amount: string;
  billingPeriod: string;
  documentLimit: number;
  nextBillingDate?: string;
}

export function subscriptionConfirmedEmail(data: SubscriptionConfirmedData): { subject: string; html: string } {
  const planLabel = data.plan === 'pro' ? 'Pro' : 'Starter';
  const firstName = data.userName?.split(' ')[0] || 'there';
  const content = `
    ${iconBadge('🎉', BRAND.successColor)}
    ${heading(`Welcome to ${BRAND.name} ${planLabel}!`)}
    ${subheading(`Hi ${firstName}, your subscription is now active.`)}
    ${detailsTable([
      { label: 'Plan', value: `${planLabel}` },
      { label: 'Amount', value: `${data.amount}/${data.billingPeriod}` },
      { label: 'Document limit', value: `${data.documentLimit} documents` },
      { label: 'AI questions', value: 'Unlimited' },
      ...(data.nextBillingDate ? [{ label: 'Next billing', value: data.nextBillingDate }] : []),
    ])}
    ${data.plan === 'pro' ? infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.primaryColor}; margin:0 0 8px;">Pro Features Unlocked</p>
      <ul style="margin:0; padding-left:20px; font-size:13px; color:${BRAND.textMuted}; line-height:2;" class="email-text-muted">
        <li>Life Events planning with smart checklists</li>
        <li>100 documents with unlimited AI chat</li>
        <li>Priority document processing</li>
        <li>Advanced document health monitoring</li>
      </ul>
    `) : infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.primaryColor}; margin:0 0 8px;">Starter Features Unlocked</p>
      <ul style="margin:0; padding-left:20px; font-size:13px; color:${BRAND.textMuted}; line-height:2;" class="email-text-muted">
        <li>25 documents with unlimited AI chat</li>
        <li>Weekly audit reports</li>
        <li>Document health monitoring</li>
        <li>Expiration tracking and alerts</li>
      </ul>
    `)}
    ${primaryButton('Go to Dashboard', `${BRAND.appUrl}#dashboard`)}
    ${smallText('You can manage your subscription anytime from Account Settings.')}
  `;
  return {
    subject: `${BRAND.name} ${planLabel} — Subscription Confirmed`,
    html: baseLayout(content, `Your ${planLabel} subscription is active. Let's get started!`),
  };
}

// ─── Template: Payment Receipt ─────────────────────────────────────────────────

export interface PaymentReceiptData {
  userName: string;
  amount: string;
  currency: string;
  plan: string;
  invoiceId?: string;
  paymentDate: string;
  cardLast4?: string;
  nextBillingDate?: string;
}

export function paymentReceiptEmail(data: PaymentReceiptData): { subject: string; html: string } {
  const content = `
    ${iconBadge('✅', BRAND.successColor)}
    ${heading('Payment Received')}
    ${subheading('Thank you for your payment.')}
    ${detailsTable([
      { label: 'Amount', value: `${data.amount} ${data.currency.toUpperCase()}` },
      { label: 'Plan', value: data.plan.charAt(0).toUpperCase() + data.plan.slice(1) },
      { label: 'Date', value: data.paymentDate },
      ...(data.cardLast4 ? [{ label: 'Payment method', value: `Card ending in ${data.cardLast4}` }] : []),
      ...(data.invoiceId ? [{ label: 'Invoice', value: data.invoiceId }] : []),
      ...(data.nextBillingDate ? [{ label: 'Next billing', value: data.nextBillingDate }] : []),
    ])}
    ${primaryButton('View Billing History', `${BRAND.appUrl}#settings`)}
    ${smallText('This receipt confirms your payment was processed successfully.')}
  `;
  return {
    subject: `${BRAND.name} — Payment receipt for ${data.paymentDate}`,
    html: baseLayout(content, `Payment of ${data.amount} ${data.currency.toUpperCase()} received.`),
  };
}

// ─── Template: Payment Failed ──────────────────────────────────────────────────

export interface PaymentFailedData {
  userName: string;
  amount: string;
  currency: string;
  plan: string;
  failureReason?: string;
  retryDate?: string;
}

export function paymentFailedEmail(data: PaymentFailedData): { subject: string; html: string } {
  const content = `
    ${iconBadge('⚠️', BRAND.dangerColor)}
    ${heading('Payment Failed')}
    ${subheading(`We were unable to process your payment of ${data.amount} ${data.currency.toUpperCase()}.`)}
    ${infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.dangerColor}; margin:0 0 4px;">Action Required</p>
      <p style="font-size:13px; color:${BRAND.textMuted}; margin:0;" class="email-text-muted">
        ${data.failureReason || 'Your payment method was declined.'}
        Please update your payment method to avoid service interruption.
      </p>
    `, BRAND.dangerColor)}
    ${detailsTable([
      { label: 'Amount due', value: `${data.amount} ${data.currency.toUpperCase()}` },
      { label: 'Plan', value: data.plan.charAt(0).toUpperCase() + data.plan.slice(1) },
      ...(data.retryDate ? [{ label: 'Next retry', value: data.retryDate }] : []),
    ])}
    ${primaryButton('Update Payment Method', `${BRAND.appUrl}#settings`)}
    ${paragraph(`If your payment isn't resolved, your account will be downgraded to the Free plan and you may lose access to premium features.`)}
    ${smallText(`Need help? Contact us at <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.primaryColor};">${BRAND.supportEmail}</a>.`)}
  `;
  return {
    subject: `${BRAND.name} — Payment failed — Action required`,
    html: baseLayout(content, `Your payment of ${data.amount} ${data.currency.toUpperCase()} failed. Please update your payment method.`),
  };
}

// ─── Template: Subscription Canceled ───────────────────────────────────────────

export interface SubscriptionCanceledData {
  userName: string;
  plan: string;
  effectiveDate: string;
  documentCount: number;
}

export function subscriptionCanceledEmail(data: SubscriptionCanceledData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const content = `
    ${iconBadge('📋', BRAND.textMuted)}
    ${heading('Subscription Canceled')}
    ${subheading(`Hi ${firstName}, your cancellation has been confirmed.`)}
    ${detailsTable([
      { label: 'Plan', value: data.plan.charAt(0).toUpperCase() + data.plan.slice(1) },
      { label: 'Access until', value: data.effectiveDate },
      { label: 'Current documents', value: String(data.documentCount) },
    ])}
    ${infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.warningColor}; margin:0 0 8px;">What happens next</p>
      <ul style="margin:0; padding-left:20px; font-size:13px; color:${BRAND.textMuted}; line-height:2;" class="email-text-muted">
        <li>You'll keep full access until <strong>${data.effectiveDate}</strong></li>
        <li>After that, your account moves to the Free plan (3 documents)</li>
        <li>Documents beyond the free limit will be preserved but read-only</li>
        <li>You can reactivate anytime before the end date</li>
      </ul>
    `, BRAND.warningColor)}
    ${primaryButton('Reactivate Subscription', `${BRAND.appUrl}#settings`)}
    ${smallText('Changed your mind? You can reactivate your subscription at any time before the end of your billing period.')}
  `;
  return {
    subject: `${BRAND.name} — Subscription cancellation confirmed`,
    html: baseLayout(content, `Your subscription will end on ${data.effectiveDate}. You can reactivate anytime.`),
  };
}

// ─── Template: Subscription Upgraded ───────────────────────────────────────────

export interface SubscriptionUpgradedData {
  userName: string;
  oldPlan: string;
  newPlan: string;
  newAmount?: string;
  effectiveDate: string;
}

export function subscriptionUpgradedEmail(data: SubscriptionUpgradedData): { subject: string; html: string } {
  const content = `
    ${iconBadge('🚀', BRAND.primaryColor)}
    ${heading('Plan Upgraded!')}
    ${subheading(`Your plan has been upgraded and is effective immediately.`)}
    ${detailsTable([
      { label: 'Previous plan', value: data.oldPlan.charAt(0).toUpperCase() + data.oldPlan.slice(1) },
      { label: 'New plan', value: data.newPlan.charAt(0).toUpperCase() + data.newPlan.slice(1) },
      ...(data.newAmount ? [{ label: 'New price', value: data.newAmount }] : []),
      { label: 'Effective', value: data.effectiveDate },
    ])}
    ${paragraph(`Your new limits and features are active right now. Any price difference has been prorated on your next invoice.`)}
    ${primaryButton('Explore New Features', `${BRAND.appUrl}#dashboard`)}
  `;
  return {
    subject: `${BRAND.name} — Upgraded to ${data.newPlan.charAt(0).toUpperCase() + data.newPlan.slice(1)}`,
    html: baseLayout(content, `You've been upgraded to the ${data.newPlan} plan!`),
  };
}

// ─── Template: Subscription Downgraded ─────────────────────────────────────────

export interface SubscriptionDowngradedData {
  userName: string;
  oldPlan: string;
  newPlan: string;
  effectiveDate: string;
}

export function subscriptionDowngradedEmail(data: SubscriptionDowngradedData): { subject: string; html: string } {
  const content = `
    ${iconBadge('📉', BRAND.warningColor)}
    ${heading('Plan Downgrade Scheduled')}
    ${subheading(`Your plan will change at the end of your current billing period.`)}
    ${detailsTable([
      { label: 'Current plan', value: data.oldPlan.charAt(0).toUpperCase() + data.oldPlan.slice(1) },
      { label: 'New plan', value: data.newPlan.charAt(0).toUpperCase() + data.newPlan.slice(1) },
      { label: 'Effective date', value: data.effectiveDate },
    ])}
    ${infoBox(`
      <p style="font-size:13px; color:${BRAND.textMuted}; margin:0;" class="email-text-muted">
        You'll keep all your current features until ${data.effectiveDate}. After that, your limits will adjust to the new plan.
      </p>
    `, BRAND.warningColor)}
    ${primaryButton('Review Your Plan', `${BRAND.appUrl}#settings`)}
  `;
  return {
    subject: `${BRAND.name} — Plan downgrade scheduled`,
    html: baseLayout(content, `Your plan will change to ${data.newPlan} on ${data.effectiveDate}.`),
  };
}

// ─── Template: Subscription Reactivated ────────────────────────────────────────

export interface SubscriptionReactivatedData {
  userName: string;
  plan: string;
}

export function subscriptionReactivatedEmail(data: SubscriptionReactivatedData): { subject: string; html: string } {
  const content = `
    ${iconBadge('🎊', BRAND.successColor)}
    ${heading('Subscription Reactivated!')}
    ${subheading(`Great news — your ${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)} plan is back.`)}
    ${paragraph(`Your cancellation has been reversed. You'll continue to be billed as normal and retain full access to all your features.`)}
    ${primaryButton('Go to Dashboard', `${BRAND.appUrl}#dashboard`)}
    ${smallText('Glad to have you staying with us!')}
  `;
  return {
    subject: `${BRAND.name} — Subscription reactivated`,
    html: baseLayout(content, `Your ${data.plan} subscription has been reactivated.`),
  };
}

// ─── Template: Usage Limit Warning ─────────────────────────────────────────────

export interface UsageLimitWarningData {
  userName: string;
  limitType: 'documents' | 'ai_questions';
  currentUsage: number;
  limit: number;
  plan: string;
}

export function usageLimitWarningEmail(data: UsageLimitWarningData): { subject: string; html: string } {
  const percentUsed = Math.round((data.currentUsage / data.limit) * 100);
  const limitLabel = data.limitType === 'documents' ? 'documents' : 'AI questions';
  const firstName = data.userName?.split(' ')[0] || 'there';
  const content = `
    ${iconBadge('📊', BRAND.warningColor)}
    ${heading(`You're approaching your ${limitLabel} limit`)}
    ${subheading(`Hi ${firstName}, you've used ${percentUsed}% of your monthly ${limitLabel}.`)}

    <!-- Progress bar -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="background:${BRAND.borderColor}; border-radius:8px; height:12px; padding:2px;">
          <div style="background:linear-gradient(135deg,${percentUsed >= 90 ? BRAND.dangerColor : BRAND.warningColor},${percentUsed >= 90 ? '#ef4444' : '#f59e0b'}); border-radius:6px; height:8px; width:${Math.min(percentUsed, 100)}%;"></div>
        </td>
      </tr>
    </table>
    <p style="font-size:14px; color:${BRAND.textMuted}; text-align:center; margin:8px 0 20px;" class="email-text-muted">
      <strong style="color:${BRAND.textDark};" class="email-text-dark">${data.currentUsage}</strong> of <strong style="color:${BRAND.textDark};" class="email-text-dark">${data.limit}</strong> ${limitLabel} used
    </p>

    ${paragraph('Upgrade your plan to get more capacity and unlock additional features.')}
    ${primaryButton('Upgrade Now', `${BRAND.appUrl}#pricing`)}
    ${smallText(`You're currently on the ${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)} plan.`)}
  `;
  return {
    subject: `${BRAND.name} — ${percentUsed}% of your ${limitLabel} used`,
    html: baseLayout(content, `You've used ${data.currentUsage} of ${data.limit} ${limitLabel}.`),
  };
}

// ─── Template: Document Expiring Soon ──────────────────────────────────────────

export interface DocumentExpiringData {
  userName: string;
  documents: {
    name: string;
    category: string;
    expirationDate: string;
    daysUntil: number;
  }[];
}

export function documentExpiringEmail(data: DocumentExpiringData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const urgent = data.documents.some(d => d.daysUntil <= 2);
  const count = data.documents.length;

  const docRows = data.documents.map(doc => {
    const urgencyColor = doc.daysUntil <= 2 ? BRAND.dangerColor : doc.daysUntil <= 7 ? BRAND.warningColor : BRAND.textMuted;
    const urgencyLabel = doc.daysUntil <= 0 ? 'Expired' : doc.daysUntil === 1 ? 'Tomorrow' : `${doc.daysUntil} days`;
    return `<tr>
      <td style="padding:12px 0; border-bottom:1px solid ${BRAND.borderColor};" class="email-border">
        <p style="font-size:14px; font-weight:600; color:${BRAND.textDark}; margin:0;" class="email-text-dark">${doc.name}</p>
        <p style="font-size:12px; color:${BRAND.textMuted}; margin:2px 0 0;" class="email-text-muted">${doc.category.charAt(0).toUpperCase() + doc.category.slice(1)} &bull; Expires ${doc.expirationDate}</p>
      </td>
      <td style="padding:12px 0; border-bottom:1px solid ${BRAND.borderColor}; text-align:right; vertical-align:middle;" class="email-border">
        <span style="display:inline-block; padding:4px 10px; border-radius:20px; font-size:12px; font-weight:600; color:#fff; background:${urgencyColor};">${urgencyLabel}</span>
      </td>
    </tr>`;
  }).join('');

  const content = `
    ${iconBadge(urgent ? '🚨' : '⏰', urgent ? BRAND.dangerColor : BRAND.warningColor)}
    ${heading(urgent ? 'Urgent: Documents Expiring' : 'Documents Expiring Soon')}
    ${subheading(`Hi ${firstName}, ${count} document${count !== 1 ? 's' : ''} ${count !== 1 ? 'need' : 'needs'} your attention.`)}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${docRows}
    </table>

    ${primaryButton('Review in Vault', `${BRAND.appUrl}#vault`)}
    ${smallText('Tip: Upload a renewal document and we\'ll automatically link it to the expiring one.')}
  `;
  return {
    subject: urgent
      ? `${BRAND.name} — URGENT: ${count} document${count !== 1 ? 's' : ''} expiring soon`
      : `${BRAND.name} — ${count} document${count !== 1 ? 's' : ''} expiring soon`,
    html: baseLayout(content, `${count} document${count !== 1 ? 's' : ''} expiring soon. Review and renew them now.`),
  };
}

// ─── Template: Document Expired ────────────────────────────────────────────────

export interface DocumentExpiredData {
  userName: string;
  documentName: string;
  category: string;
  expiredDate: string;
}

export function documentExpiredEmail(data: DocumentExpiredData): { subject: string; html: string } {
  const content = `
    ${iconBadge('❌', BRAND.dangerColor)}
    ${heading('Document Expired')}
    ${subheading(`Your document has passed its expiration date.`)}
    ${detailsTable([
      { label: 'Document', value: data.documentName },
      { label: 'Category', value: data.category.charAt(0).toUpperCase() + data.category.slice(1) },
      { label: 'Expired on', value: data.expiredDate },
    ])}
    ${paragraph('Upload a renewed version to keep your vault up to date and maintain your preparedness score.')}
    ${primaryButton('Upload Renewal', `${BRAND.appUrl}#vault`)}
  `;
  return {
    subject: `${BRAND.name} — "${data.documentName}" has expired`,
    html: baseLayout(content, `Your document "${data.documentName}" has expired. Upload a renewal.`),
  };
}

// ─── Template: Document Processing Failed ──────────────────────────────────────

export interface DocumentProcessingFailedData {
  userName: string;
  documentName: string;
  errorMessage: string;
}

export function documentProcessingFailedEmail(data: DocumentProcessingFailedData): { subject: string; html: string } {
  const content = `
    ${iconBadge('⚙️', BRAND.dangerColor)}
    ${heading('Document Processing Failed')}
    ${subheading(`We couldn't process "${data.documentName}".`)}
    ${infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.dangerColor}; margin:0 0 4px;">Error Details</p>
      <p style="font-size:13px; color:${BRAND.textMuted}; margin:0; font-family:monospace;" class="email-text-muted">${data.errorMessage}</p>
    `, BRAND.dangerColor)}
    ${paragraph('This can happen with corrupted files, scanned images with poor quality, or unsupported formats. Try re-uploading the document or contact support.')}
    ${primaryButton('Try Again', `${BRAND.appUrl}#vault`)}
    ${smallText(`Need help? Contact us at <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.primaryColor};">${BRAND.supportEmail}</a>.`)}
  `;
  return {
    subject: `${BRAND.name} — Failed to process "${data.documentName}"`,
    html: baseLayout(content, `We couldn't process your document. Please try again or contact support.`),
  };
}

// ─── Template: Weekly Audit Digest ─────────────────────────────────────────────

export interface WeeklyAuditData {
  userName: string;
  preparednessScore: number;
  scoreChange: number;
  totalDocuments: number;
  healthySummary: { healthy: number; review: number; risk: number; critical: number };
  expiringDocuments: { name: string; daysUntil: number }[];
  missingMetadataCount: number;
  gapSuggestions: string[];
}

export function weeklyAuditEmail(data: WeeklyAuditData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const scoreColor = data.preparednessScore >= 80 ? BRAND.successColor : data.preparednessScore >= 50 ? BRAND.warningColor : BRAND.dangerColor;
  const changeIcon = data.scoreChange > 0 ? '↑' : data.scoreChange < 0 ? '↓' : '→';
  const changeColor = data.scoreChange > 0 ? BRAND.successColor : data.scoreChange < 0 ? BRAND.dangerColor : BRAND.textMuted;

  const expiringList = data.expiringDocuments.length > 0
    ? data.expiringDocuments.slice(0, 5).map(d =>
        `<li style="margin:4px 0;">${d.name} <span style="color:${d.daysUntil <= 7 ? BRAND.dangerColor : BRAND.warningColor}; font-weight:600;">(${d.daysUntil}d)</span></li>`
      ).join('')
    : '<li style="color:' + BRAND.successColor + ';">No documents expiring soon</li>';

  const gapsList = data.gapSuggestions.length > 0
    ? data.gapSuggestions.slice(0, 3).map(g => `<li style="margin:4px 0;">${g}</li>`).join('')
    : '';

  const content = `
    ${iconBadge('📋', BRAND.primaryColor)}
    ${heading('Your Weekly Vault Audit')}
    ${subheading(`Hi ${firstName}, here's your weekly document health summary.`)}

    <!-- Preparedness Score -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0; text-align:center;">
      <tr>
        <td style="padding:20px; background:${scoreColor}08; border-radius:16px;">
          <p style="font-size:48px; font-weight:800; color:${scoreColor}; margin:0; line-height:1;">${data.preparednessScore}</p>
          <p style="font-size:14px; color:${BRAND.textMuted}; margin:4px 0 0;" class="email-text-muted">
            Preparedness Score
            <span style="color:${changeColor}; font-weight:600;"> ${changeIcon} ${Math.abs(data.scoreChange)}</span>
          </p>
        </td>
      </tr>
    </table>

    <!-- Health Breakdown -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="text-align:center; padding:8px;">
          <p style="font-size:20px; font-weight:700; color:${BRAND.successColor}; margin:0;">${data.healthySummary.healthy}</p>
          <p style="font-size:11px; color:${BRAND.textMuted}; margin:2px 0 0; text-transform:uppercase; letter-spacing:0.5px;" class="email-text-muted">Healthy</p>
        </td>
        <td style="text-align:center; padding:8px;">
          <p style="font-size:20px; font-weight:700; color:${BRAND.infoColor}; margin:0;">${data.healthySummary.review}</p>
          <p style="font-size:11px; color:${BRAND.textMuted}; margin:2px 0 0; text-transform:uppercase; letter-spacing:0.5px;" class="email-text-muted">Review</p>
        </td>
        <td style="text-align:center; padding:8px;">
          <p style="font-size:20px; font-weight:700; color:${BRAND.warningColor}; margin:0;">${data.healthySummary.risk}</p>
          <p style="font-size:11px; color:${BRAND.textMuted}; margin:2px 0 0; text-transform:uppercase; letter-spacing:0.5px;" class="email-text-muted">At Risk</p>
        </td>
        <td style="text-align:center; padding:8px;">
          <p style="font-size:20px; font-weight:700; color:${BRAND.dangerColor}; margin:0;">${data.healthySummary.critical}</p>
          <p style="font-size:11px; color:${BRAND.textMuted}; margin:2px 0 0; text-transform:uppercase; letter-spacing:0.5px;" class="email-text-muted">Critical</p>
        </td>
      </tr>
    </table>

    ${divider()}

    <!-- Expiring Documents -->
    <p style="font-size:15px; font-weight:600; color:${BRAND.textDark}; margin:0 0 8px;" class="email-text-dark">Expiring Soon</p>
    <ul style="margin:0 0 16px; padding-left:20px; font-size:13px; color:${BRAND.textMuted}; line-height:1.8;" class="email-text-muted">
      ${expiringList}
    </ul>

    ${data.missingMetadataCount > 0 ? `
      <p style="font-size:13px; color:${BRAND.warningColor}; margin:8px 0;">
        <strong>${data.missingMetadataCount} document${data.missingMetadataCount !== 1 ? 's' : ''}</strong> missing metadata (expiration date, tags, or issuer)
      </p>
    ` : ''}

    ${gapsList ? `
      ${divider()}
      <p style="font-size:15px; font-weight:600; color:${BRAND.textDark}; margin:0 0 8px;" class="email-text-dark">Suggestions</p>
      <ul style="margin:0 0 16px; padding-left:20px; font-size:13px; color:${BRAND.textMuted}; line-height:1.8;" class="email-text-muted">
        ${gapsList}
      </ul>
    ` : ''}

    ${primaryButton('View Full Audit', `${BRAND.appUrl}#audit`)}
  `;
  return {
    subject: `${BRAND.name} — Weekly Audit: Score ${data.preparednessScore}/100`,
    html: baseLayout(content, `Your weekly vault audit is ready. Preparedness score: ${data.preparednessScore}/100.`),
  };
}

// ─── Template: Life Event Created ──────────────────────────────────────────────

export interface LifeEventCreatedData {
  userName: string;
  eventTitle: string;
  templateName: string;
  requirementsCount: number;
  readinessScore: number;
  matchedDocuments: number;
}

export function lifeEventCreatedEmail(data: LifeEventCreatedData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const scoreColor = data.readinessScore >= 80 ? BRAND.successColor : data.readinessScore >= 50 ? BRAND.warningColor : BRAND.dangerColor;
  const content = `
    ${iconBadge('🧭', BRAND.primaryColor)}
    ${heading('Life Event Created')}
    ${subheading(`Hi ${firstName}, your life event checklist is ready.`)}
    ${detailsTable([
      { label: 'Event', value: data.eventTitle },
      { label: 'Template', value: data.templateName },
      { label: 'Requirements', value: `${data.requirementsCount} documents` },
      { label: 'Already matched', value: `${data.matchedDocuments} documents` },
    ])}

    <!-- Readiness Score -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0; text-align:center;">
      <tr>
        <td style="padding:16px; background:${scoreColor}08; border-radius:12px;">
          <p style="font-size:36px; font-weight:800; color:${scoreColor}; margin:0; line-height:1;">${data.readinessScore}%</p>
          <p style="font-size:13px; color:${BRAND.textMuted}; margin:4px 0 0;" class="email-text-muted">Initial Readiness</p>
        </td>
      </tr>
    </table>

    ${paragraph('Upload missing documents to increase your readiness score. We\'ll automatically match them to your requirements.')}
    ${primaryButton('View Life Event', `${BRAND.appUrl}#life-events`)}
  `;
  return {
    subject: `${BRAND.name} — "${data.eventTitle}" checklist created`,
    html: baseLayout(content, `Your "${data.eventTitle}" life event checklist has ${data.requirementsCount} requirements.`),
  };
}

// ─── Template: Life Event Complete ─────────────────────────────────────────────

export interface LifeEventCompleteData {
  userName: string;
  eventTitle: string;
  completionDate: string;
  requirementsCount: number;
}

export function lifeEventCompleteEmail(data: LifeEventCompleteData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const content = `
    ${iconBadge('🏆', BRAND.successColor)}
    ${heading('Life Event Complete!')}
    ${subheading(`Congratulations ${firstName}! You're 100% ready.`)}

    <!-- Celebration -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0; text-align:center;">
      <tr>
        <td style="padding:24px; background:${BRAND.successColor}08; border-radius:16px;">
          <p style="font-size:56px; margin:0; line-height:1;">🎉</p>
          <p style="font-size:20px; font-weight:700; color:${BRAND.successColor}; margin:12px 0 0;">100% Ready</p>
        </td>
      </tr>
    </table>

    ${detailsTable([
      { label: 'Event', value: data.eventTitle },
      { label: 'Requirements met', value: `${data.requirementsCount}/${data.requirementsCount}` },
      { label: 'Completed on', value: data.completionDate },
    ])}
    ${paragraph('All your documents are in order. You can archive this event or keep it for reference.')}
    ${primaryButton('View Life Event', `${BRAND.appUrl}#life-events`)}
  `;
  return {
    subject: `${BRAND.name} — "${data.eventTitle}" is 100% ready!`,
    html: baseLayout(content, `You've completed all requirements for "${data.eventTitle}". You're 100% ready!`),
  };
}

// ─── Template: Document Health Alert ───────────────────────────────────────────

export interface DocumentHealthAlertData {
  userName: string;
  documentName: string;
  healthState: 'critical' | 'risk';
  healthScore: number;
  reasons: string[];
  recommendedActions: string[];
}

export function documentHealthAlertEmail(data: DocumentHealthAlertData): { subject: string; html: string } {
  const isCritical = data.healthState === 'critical';
  const alertColor = isCritical ? BRAND.dangerColor : BRAND.warningColor;
  const content = `
    ${iconBadge(isCritical ? '🚨' : '⚠️', alertColor)}
    ${heading(isCritical ? 'Critical: Document Needs Attention' : 'Document Health Warning')}
    ${subheading(`"${data.documentName}" health has dropped to ${data.healthState}.`)}

    <!-- Health Score -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0; text-align:center;">
      <tr>
        <td style="padding:12px; background:${alertColor}08; border-radius:12px;">
          <p style="font-size:32px; font-weight:800; color:${alertColor}; margin:0;">${data.healthScore}</p>
          <p style="font-size:12px; color:${BRAND.textMuted}; margin:2px 0 0; text-transform:uppercase;" class="email-text-muted">Health Score</p>
        </td>
      </tr>
    </table>

    ${infoBox(`
      <p style="font-size:14px; font-weight:600; color:${alertColor}; margin:0 0 8px;">Issues Found</p>
      <ul style="margin:0; padding-left:20px; font-size:13px; color:${BRAND.textMuted}; line-height:2;" class="email-text-muted">
        ${data.reasons.map(r => `<li>${r}</li>`).join('')}
      </ul>
    `, alertColor)}

    ${data.recommendedActions.length > 0 ? `
      <p style="font-size:14px; font-weight:600; color:${BRAND.textDark}; margin:16px 0 8px;" class="email-text-dark">Recommended Actions</p>
      <ul style="margin:0; padding-left:20px; font-size:13px; color:${BRAND.textMuted}; line-height:2;" class="email-text-muted">
        ${data.recommendedActions.map(a => `<li>${a}</li>`).join('')}
      </ul>
    ` : ''}

    ${primaryButton('Fix Document', `${BRAND.appUrl}#vault`)}
  `;
  return {
    subject: isCritical
      ? `${BRAND.name} — CRITICAL: "${data.documentName}" needs immediate attention`
      : `${BRAND.name} — "${data.documentName}" health warning`,
    html: baseLayout(content, `"${data.documentName}" health has dropped to ${data.healthState}. Action needed.`),
  };
}

// ─── Template: Subscription Expiring Soon ───────────────────────────────────

export interface SubscriptionExpiringSoonData {
  userName: string;
  plan: string;
  expirationDate: string;
  daysUntil: number;
}

export function subscriptionExpiringSoonEmail(data: SubscriptionExpiringSoonData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const urgent = data.daysUntil <= 3;
  const content = `
    ${iconBadge(urgent ? '🚨' : '⏳', urgent ? BRAND.dangerColor : BRAND.warningColor)}
    ${heading('Subscription Expiring Soon')}
    ${subheading(`Hi ${firstName}, your ${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)} plan expires in ${data.daysUntil} day${data.daysUntil !== 1 ? 's' : ''}.`)}
    ${detailsTable([
      { label: 'Plan', value: data.plan.charAt(0).toUpperCase() + data.plan.slice(1) },
      { label: 'Expires on', value: data.expirationDate },
      { label: 'Days remaining', value: String(data.daysUntil) },
    ])}
    ${infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.warningColor}; margin:0 0 4px;">What happens next</p>
      <p style="font-size:13px; color:${BRAND.textMuted}; margin:0;" class="email-text-muted">
        After your plan expires, your account will revert to the Free plan (3 documents, 5 AI questions/month). Documents beyond the free limit become read-only.
      </p>
    `, BRAND.warningColor)}
    ${primaryButton('Renew Subscription', `${BRAND.appUrl}#settings`)}
    ${smallText('Renew now to keep all your premium features and document capacity.')}
  `;
  return {
    subject: urgent
      ? `${BRAND.name} — URGENT: Subscription expires in ${data.daysUntil} day${data.daysUntil !== 1 ? 's' : ''}`
      : `${BRAND.name} — Subscription expires on ${data.expirationDate}`,
    html: baseLayout(content, `Your subscription expires in ${data.daysUntil} days. Renew to keep your features.`),
  };
}

// ─── Template: Document Uploaded ────────────────────────────────────────────

export interface DocumentUploadedData {
  userName: string;
  documentName: string;
  category: string;
  fileSize: string;
  uploadedAt: string;
}

export function documentUploadedEmail(data: DocumentUploadedData): { subject: string; html: string } {
  const content = `
    ${iconBadge('📄', BRAND.successColor)}
    ${heading('Document Uploaded')}
    ${subheading('Your document has been added to the vault.')}
    ${detailsTable([
      { label: 'Document', value: data.documentName },
      { label: 'Category', value: data.category.charAt(0).toUpperCase() + data.category.slice(1) },
      { label: 'Size', value: data.fileSize },
      { label: 'Uploaded', value: data.uploadedAt },
    ])}
    ${paragraph('Your document is being processed. We\'ll extract text, generate tags, and create embeddings for AI chat.')}
    ${primaryButton('View in Vault', `${BRAND.appUrl}#vault`)}
  `;
  return {
    subject: `${BRAND.name} — "${data.documentName}" uploaded successfully`,
    html: baseLayout(content, `Your document "${data.documentName}" has been uploaded to your vault.`),
  };
}

// ─── Template: Document Processing Complete ─────────────────────────────────

export interface DocumentProcessingCompleteData {
  userName: string;
  documentName: string;
  category: string;
  tagsGenerated: number;
  embeddingsCreated: boolean;
  expirationDetected?: string;
}

export function documentProcessingCompleteEmail(data: DocumentProcessingCompleteData): { subject: string; html: string } {
  const content = `
    ${iconBadge('✅', BRAND.successColor)}
    ${heading('Document Ready')}
    ${subheading(`"${data.documentName}" has been fully processed.`)}
    ${detailsTable([
      { label: 'Document', value: data.documentName },
      { label: 'Category', value: data.category.charAt(0).toUpperCase() + data.category.slice(1) },
      { label: 'Tags generated', value: data.tagsGenerated > 0 ? `${data.tagsGenerated} tags` : 'None' },
      { label: 'AI chat ready', value: data.embeddingsCreated ? 'Yes' : 'No' },
      ...(data.expirationDetected ? [{ label: 'Expiration detected', value: data.expirationDetected }] : []),
    ])}
    ${paragraph('You can now ask AI questions about this document, and it will appear in your vault with full search capability.')}
    ${primaryButton('Chat About This Document', `${BRAND.appUrl}#vault`)}
  `;
  return {
    subject: `${BRAND.name} — "${data.documentName}" is ready`,
    html: baseLayout(content, `Your document has been processed and is ready for AI chat.`),
  };
}

// ─── Template: Document Deleted ─────────────────────────────────────────────

export interface DocumentDeletedData {
  userName: string;
  documentName: string;
  category: string;
  deletedAt: string;
}

export function documentDeletedEmail(data: DocumentDeletedData): { subject: string; html: string } {
  const content = `
    ${iconBadge('🗑️', BRAND.textMuted)}
    ${heading('Document Deleted')}
    ${subheading('A document has been removed from your vault.')}
    ${detailsTable([
      { label: 'Document', value: data.documentName },
      { label: 'Category', value: data.category.charAt(0).toUpperCase() + data.category.slice(1) },
      { label: 'Deleted on', value: data.deletedAt },
    ])}
    ${infoBox(`
      <p style="font-size:13px; color:${BRAND.textMuted}; margin:0;" class="email-text-muted">
        This document and all associated data (embeddings, tags, chat history) have been permanently removed.
      </p>
    `)}
    ${smallText(`Didn't delete this? Contact us at <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.primaryColor};">${BRAND.supportEmail}</a>.`)}
  `;
  return {
    subject: `${BRAND.name} — "${data.documentName}" deleted`,
    html: baseLayout(content, `"${data.documentName}" has been removed from your vault.`),
  };
}

// ─── Template: Document Metadata Updated ────────────────────────────────────

export interface DocumentMetadataUpdatedData {
  userName: string;
  documentName: string;
  changes: { field: string; oldValue: string; newValue: string }[];
}

export function documentMetadataUpdatedEmail(data: DocumentMetadataUpdatedData): { subject: string; html: string } {
  const changeRows = data.changes.map(c =>
    `<tr>
      <td style="padding:8px 0; font-size:13px; color:${BRAND.textMuted}; border-bottom:1px solid ${BRAND.borderColor};" class="email-text-muted email-border">${c.field}</td>
      <td style="padding:8px 0; font-size:13px; color:${BRAND.textLight}; text-decoration:line-through; border-bottom:1px solid ${BRAND.borderColor};" class="email-text-muted email-border">${c.oldValue || '(empty)'}</td>
      <td style="padding:8px 0; font-size:13px; font-weight:600; color:${BRAND.textDark}; border-bottom:1px solid ${BRAND.borderColor};" class="email-text-dark email-border">${c.newValue}</td>
    </tr>`
  ).join('');
  const content = `
    ${iconBadge('📝', BRAND.infoColor)}
    ${heading('Document Updated')}
    ${subheading(`Metadata for "${data.documentName}" has been changed.`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <th style="padding:8px 0; font-size:12px; color:${BRAND.textLight}; text-align:left; text-transform:uppercase; letter-spacing:0.5px; border-bottom:2px solid ${BRAND.borderColor};" class="email-text-muted email-border">Field</th>
        <th style="padding:8px 0; font-size:12px; color:${BRAND.textLight}; text-align:left; text-transform:uppercase; letter-spacing:0.5px; border-bottom:2px solid ${BRAND.borderColor};" class="email-text-muted email-border">Old</th>
        <th style="padding:8px 0; font-size:12px; color:${BRAND.textLight}; text-align:left; text-transform:uppercase; letter-spacing:0.5px; border-bottom:2px solid ${BRAND.borderColor};" class="email-text-muted email-border">New</th>
      </tr>
      ${changeRows}
    </table>
    ${primaryButton('View Document', `${BRAND.appUrl}#vault`)}
  `;
  return {
    subject: `${BRAND.name} — "${data.documentName}" metadata updated`,
    html: baseLayout(content, `Metadata for "${data.documentName}" has been updated.`),
  };
}

// ─── Template: Document Review Overdue ──────────────────────────────────────

export interface DocumentReviewOverdueData {
  userName: string;
  documents: { name: string; category: string; lastReviewed: string; daysSinceReview: number }[];
}

export function documentReviewOverdueEmail(data: DocumentReviewOverdueData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const count = data.documents.length;
  const docRows = data.documents.map(doc =>
    `<tr>
      <td style="padding:10px 0; border-bottom:1px solid ${BRAND.borderColor};" class="email-border">
        <p style="font-size:14px; font-weight:600; color:${BRAND.textDark}; margin:0;" class="email-text-dark">${doc.name}</p>
        <p style="font-size:12px; color:${BRAND.textMuted}; margin:2px 0 0;" class="email-text-muted">${doc.category.charAt(0).toUpperCase() + doc.category.slice(1)} &bull; Last reviewed ${doc.lastReviewed}</p>
      </td>
      <td style="padding:10px 0; border-bottom:1px solid ${BRAND.borderColor}; text-align:right; vertical-align:middle;" class="email-border">
        <span style="display:inline-block; padding:4px 10px; border-radius:20px; font-size:12px; font-weight:600; color:#fff; background:${doc.daysSinceReview >= 180 ? BRAND.dangerColor : BRAND.warningColor};">${doc.daysSinceReview}d ago</span>
      </td>
    </tr>`
  ).join('');
  const content = `
    ${iconBadge('📋', BRAND.warningColor)}
    ${heading('Documents Overdue for Review')}
    ${subheading(`Hi ${firstName}, ${count} document${count !== 1 ? 's' : ''} haven't been reviewed in a while.`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${docRows}
    </table>
    ${paragraph('Regular reviews keep your vault accurate and your preparedness score high.')}
    ${primaryButton('Review Documents', `${BRAND.appUrl}#vault`)}
  `;
  return {
    subject: `${BRAND.name} — ${count} document${count !== 1 ? 's' : ''} overdue for review`,
    html: baseLayout(content, `${count} documents need to be reviewed.`),
  };
}

// ─── Template: Gap Suggestion ───────────────────────────────────────────────

export interface GapSuggestionData {
  userName: string;
  suggestions: { title: string; description: string; category: string }[];
  preparednessScore: number;
}

export function gapSuggestionEmail(data: GapSuggestionData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const scoreColor = data.preparednessScore >= 80 ? BRAND.successColor : data.preparednessScore >= 50 ? BRAND.warningColor : BRAND.dangerColor;
  const suggestionRows = data.suggestions.map(s =>
    `<tr>
      <td style="padding:12px 0; border-bottom:1px solid ${BRAND.borderColor};" class="email-border">
        <p style="font-size:14px; font-weight:600; color:${BRAND.textDark}; margin:0;" class="email-text-dark">${s.title}</p>
        <p style="font-size:13px; color:${BRAND.textMuted}; margin:4px 0 0;" class="email-text-muted">${s.description}</p>
        <span style="display:inline-block; margin-top:6px; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; background:${BRAND.primaryColor}10; color:${BRAND.primaryColor};">${s.category.charAt(0).toUpperCase() + s.category.slice(1)}</span>
      </td>
    </tr>`
  ).join('');
  const content = `
    ${iconBadge('💡', BRAND.primaryColor)}
    ${heading('Document Gap Suggestions')}
    ${subheading(`Hi ${firstName}, we found some gaps in your document coverage.`)}

    <!-- Current Score -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0; text-align:center;">
      <tr>
        <td style="padding:12px; background:${scoreColor}08; border-radius:12px;">
          <p style="font-size:28px; font-weight:800; color:${scoreColor}; margin:0; line-height:1;">${data.preparednessScore}</p>
          <p style="font-size:12px; color:${BRAND.textMuted}; margin:2px 0 0;" class="email-text-muted">Current Score</p>
        </td>
      </tr>
    </table>

    <p style="font-size:14px; font-weight:600; color:${BRAND.textDark}; margin:20px 0 8px;" class="email-text-dark">Suggested Documents to Upload</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${suggestionRows}
    </table>
    ${primaryButton('Upload Documents', `${BRAND.appUrl}#vault`)}
    ${smallText('Uploading these documents will improve your preparedness score.')}
  `;
  return {
    subject: `${BRAND.name} — ${data.suggestions.length} document gap${data.suggestions.length !== 1 ? 's' : ''} found`,
    html: baseLayout(content, `We found gaps in your document coverage. Upload suggested documents to improve your score.`),
  };
}

// ─── Template: Preparedness Score Drop ──────────────────────────────────────

export interface PreparednessScoreDropData {
  userName: string;
  oldScore: number;
  newScore: number;
  dropAmount: number;
  reasons: string[];
}

export function preparednessScoreDropEmail(data: PreparednessScoreDropData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const newScoreColor = data.newScore >= 80 ? BRAND.successColor : data.newScore >= 50 ? BRAND.warningColor : BRAND.dangerColor;
  const content = `
    ${iconBadge('📉', BRAND.dangerColor)}
    ${heading('Preparedness Score Dropped')}
    ${subheading(`Hi ${firstName}, your vault preparedness score has dropped.`)}

    <!-- Score Comparison -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="text-align:center; padding:16px; width:40%;">
          <p style="font-size:36px; font-weight:800; color:${BRAND.textLight}; margin:0; text-decoration:line-through;">${data.oldScore}</p>
          <p style="font-size:12px; color:${BRAND.textLight}; margin:2px 0 0;">Previous</p>
        </td>
        <td style="text-align:center; padding:16px; width:20%;">
          <p style="font-size:24px; color:${BRAND.dangerColor}; margin:0;">→</p>
        </td>
        <td style="text-align:center; padding:16px; width:40%; background:${newScoreColor}08; border-radius:12px;">
          <p style="font-size:36px; font-weight:800; color:${newScoreColor}; margin:0;">${data.newScore}</p>
          <p style="font-size:12px; color:${BRAND.textMuted}; margin:2px 0 0;" class="email-text-muted">Current</p>
        </td>
      </tr>
    </table>

    ${infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.dangerColor}; margin:0 0 8px;">Why did your score drop?</p>
      <ul style="margin:0; padding-left:20px; font-size:13px; color:${BRAND.textMuted}; line-height:2;" class="email-text-muted">
        ${data.reasons.map(r => `<li>${r}</li>`).join('')}
      </ul>
    `, BRAND.dangerColor)}
    ${primaryButton('Improve Your Score', `${BRAND.appUrl}#dashboard`)}
  `;
  return {
    subject: `${BRAND.name} — Preparedness score dropped to ${data.newScore}`,
    html: baseLayout(content, `Your preparedness score dropped from ${data.oldScore} to ${data.newScore}.`),
  };
}

// ─── Template: Life Event Readiness Change ──────────────────────────────────

export interface LifeEventReadinessChangeData {
  userName: string;
  eventTitle: string;
  oldScore: number;
  newScore: number;
  direction: 'up' | 'down';
  changedRequirements: { name: string; status: 'fulfilled' | 'unfulfilled' }[];
}

export function lifeEventReadinessChangeEmail(data: LifeEventReadinessChangeData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const isUp = data.direction === 'up';
  const scoreColor = data.newScore >= 80 ? BRAND.successColor : data.newScore >= 50 ? BRAND.warningColor : BRAND.dangerColor;
  const changeRows = data.changedRequirements.map(r =>
    `<li style="margin:4px 0;">
      <span style="color:${r.status === 'fulfilled' ? BRAND.successColor : BRAND.dangerColor}; font-weight:600;">${r.status === 'fulfilled' ? '✓' : '✗'}</span>
      ${r.name}
    </li>`
  ).join('');
  const content = `
    ${iconBadge(isUp ? '📈' : '📉', isUp ? BRAND.successColor : BRAND.warningColor)}
    ${heading(`Life Event Readiness ${isUp ? 'Improved' : 'Changed'}`)}
    ${subheading(`Hi ${firstName}, readiness for "${data.eventTitle}" has ${isUp ? 'improved' : 'decreased'}.`)}

    <!-- Score -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0; text-align:center;">
      <tr>
        <td style="padding:16px; background:${scoreColor}08; border-radius:12px;">
          <p style="font-size:36px; font-weight:800; color:${scoreColor}; margin:0;">${data.newScore}%</p>
          <p style="font-size:13px; color:${BRAND.textMuted}; margin:4px 0 0;" class="email-text-muted">
            ${isUp ? '↑' : '↓'} from ${data.oldScore}%
          </p>
        </td>
      </tr>
    </table>

    ${data.changedRequirements.length > 0 ? `
      <p style="font-size:14px; font-weight:600; color:${BRAND.textDark}; margin:20px 0 8px;" class="email-text-dark">Changes</p>
      <ul style="margin:0 0 16px; padding-left:20px; font-size:13px; color:${BRAND.textMuted}; line-height:2;" class="email-text-muted">
        ${changeRows}
      </ul>
    ` : ''}
    ${primaryButton('View Life Event', `${BRAND.appUrl}#life-events`)}
  `;
  return {
    subject: isUp
      ? `${BRAND.name} — "${data.eventTitle}" readiness improved to ${data.newScore}%`
      : `${BRAND.name} — "${data.eventTitle}" readiness dropped to ${data.newScore}%`,
    html: baseLayout(content, `Readiness for "${data.eventTitle}" is now ${data.newScore}%.`),
  };
}

// ─── Template: Life Event Requirement Missing ───────────────────────────────

export interface LifeEventRequirementMissingData {
  userName: string;
  eventTitle: string;
  requirementName: string;
  category: string;
  urgency: 'low' | 'medium' | 'high';
  dueDate?: string;
}

export function lifeEventRequirementMissingEmail(data: LifeEventRequirementMissingData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const urgencyColor = data.urgency === 'high' ? BRAND.dangerColor : data.urgency === 'medium' ? BRAND.warningColor : BRAND.infoColor;
  const urgencyLabel = data.urgency.charAt(0).toUpperCase() + data.urgency.slice(1);
  const content = `
    ${iconBadge('📌', urgencyColor)}
    ${heading('Missing Requirement')}
    ${subheading(`Hi ${firstName}, a document is missing for your life event.`)}
    ${detailsTable([
      { label: 'Life event', value: data.eventTitle },
      { label: 'Required document', value: data.requirementName },
      { label: 'Category', value: data.category.charAt(0).toUpperCase() + data.category.slice(1) },
      { label: 'Urgency', value: `<span style="color:${urgencyColor}; font-weight:700;">${urgencyLabel}</span>` },
      ...(data.dueDate ? [{ label: 'Needed by', value: data.dueDate }] : []),
    ])}
    ${paragraph('Upload the required document to check it off your list and improve your readiness score.')}
    ${primaryButton('Upload Document', `${BRAND.appUrl}#vault`)}
  `;
  return {
    subject: `${BRAND.name} — Missing: "${data.requirementName}" for ${data.eventTitle}`,
    html: baseLayout(content, `"${data.requirementName}" is needed for "${data.eventTitle}".`),
  };
}

// ─── Template: Life Event Archived ──────────────────────────────────────────

export interface LifeEventArchivedData {
  userName: string;
  eventTitle: string;
  completionStatus: 'completed' | 'archived';
  finalScore: number;
  requirementsMet: number;
  totalRequirements: number;
}

export function lifeEventArchivedEmail(data: LifeEventArchivedData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const isCompleted = data.completionStatus === 'completed';
  const content = `
    ${iconBadge(isCompleted ? '✅' : '📦', isCompleted ? BRAND.successColor : BRAND.textMuted)}
    ${heading(isCompleted ? 'Life Event Completed & Archived' : 'Life Event Archived')}
    ${subheading(`Hi ${firstName}, "${data.eventTitle}" has been ${data.completionStatus}.`)}
    ${detailsTable([
      { label: 'Event', value: data.eventTitle },
      { label: 'Status', value: isCompleted ? 'Completed' : 'Archived' },
      { label: 'Final readiness', value: `${data.finalScore}%` },
      { label: 'Requirements met', value: `${data.requirementsMet}/${data.totalRequirements}` },
    ])}
    ${paragraph(isCompleted
      ? 'Great job! All documents are on file. This event has been moved to your archive.'
      : 'This event has been archived. You can restore it later if needed.'
    )}
    ${primaryButton('View Archive', `${BRAND.appUrl}#life-events`)}
  `;
  return {
    subject: `${BRAND.name} — "${data.eventTitle}" ${data.completionStatus}`,
    html: baseLayout(content, `"${data.eventTitle}" has been ${data.completionStatus}.`),
  };
}

// ─── Template: New Device Login ─────────────────────────────────────────────

export interface NewDeviceLoginData {
  userName: string;
  email: string;
  device: string;
  browser: string;
  ipAddress: string;
  location?: string;
  timestamp: string;
}

export function newDeviceLoginEmail(data: NewDeviceLoginData): { subject: string; html: string } {
  const content = `
    ${iconBadge('🖥️', BRAND.warningColor)}
    ${heading('New Device Login')}
    ${subheading('A new device was used to sign into your account.')}
    ${detailsTable([
      { label: 'Account', value: data.email },
      { label: 'Device', value: data.device },
      { label: 'Browser', value: data.browser },
      { label: 'IP address', value: data.ipAddress },
      ...(data.location ? [{ label: 'Location', value: data.location }] : []),
      { label: 'Time', value: new Date(data.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) },
    ])}
    ${infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.warningColor}; margin:0 0 4px;">Wasn't you?</p>
      <p style="font-size:13px; color:${BRAND.textMuted}; margin:0;" class="email-text-muted">
        If you don't recognize this login, change your password immediately and contact support.
      </p>
    `, BRAND.warningColor)}
    ${primaryButton('Review Account Security', `${BRAND.appUrl}#settings`)}
    ${smallText('You\'re receiving this because you have security alerts enabled.')}
  `;
  return {
    subject: `${BRAND.name} — New sign-in from ${data.device}`,
    html: baseLayout(content, `New sign-in detected from ${data.device}. If this wasn't you, secure your account.`),
  };
}

// ─── Template: Daily Summary ────────────────────────────────────────────────

export interface DailySummaryData {
  userName: string;
  date: string;
  documentsUploaded: number;
  documentsExpiringSoon: number;
  aiQuestionsAsked: number;
  preparednessScore: number;
  topAction?: string;
}

export function dailySummaryEmail(data: DailySummaryData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const scoreColor = data.preparednessScore >= 80 ? BRAND.successColor : data.preparednessScore >= 50 ? BRAND.warningColor : BRAND.dangerColor;
  const content = `
    ${iconBadge('📊', BRAND.primaryColor)}
    ${heading('Your Daily Summary')}
    ${subheading(`Hi ${firstName}, here's what happened on ${data.date}.`)}

    <!-- Stats Grid -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="text-align:center; padding:16px; width:25%; background:${BRAND.successColor}08; border-radius:12px 0 0 12px;">
          <p style="font-size:24px; font-weight:800; color:${BRAND.successColor}; margin:0;">${data.documentsUploaded}</p>
          <p style="font-size:11px; color:${BRAND.textMuted}; margin:2px 0 0; text-transform:uppercase;" class="email-text-muted">Uploaded</p>
        </td>
        <td style="text-align:center; padding:16px; width:25%; background:${BRAND.warningColor}08;">
          <p style="font-size:24px; font-weight:800; color:${BRAND.warningColor}; margin:0;">${data.documentsExpiringSoon}</p>
          <p style="font-size:11px; color:${BRAND.textMuted}; margin:2px 0 0; text-transform:uppercase;" class="email-text-muted">Expiring</p>
        </td>
        <td style="text-align:center; padding:16px; width:25%; background:${BRAND.infoColor}08;">
          <p style="font-size:24px; font-weight:800; color:${BRAND.infoColor}; margin:0;">${data.aiQuestionsAsked}</p>
          <p style="font-size:11px; color:${BRAND.textMuted}; margin:2px 0 0; text-transform:uppercase;" class="email-text-muted">AI Chats</p>
        </td>
        <td style="text-align:center; padding:16px; width:25%; background:${scoreColor}08; border-radius:0 12px 12px 0;">
          <p style="font-size:24px; font-weight:800; color:${scoreColor}; margin:0;">${data.preparednessScore}</p>
          <p style="font-size:11px; color:${BRAND.textMuted}; margin:2px 0 0; text-transform:uppercase;" class="email-text-muted">Score</p>
        </td>
      </tr>
    </table>

    ${data.topAction ? infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.primaryColor}; margin:0 0 4px;">Top Action for Tomorrow</p>
      <p style="font-size:13px; color:${BRAND.textMuted}; margin:0;" class="email-text-muted">${data.topAction}</p>
    `) : ''}
    ${primaryButton('Open Dashboard', `${BRAND.appUrl}#dashboard`)}
  `;
  return {
    subject: `${BRAND.name} — Daily Summary for ${data.date}`,
    html: baseLayout(content, `Your daily vault summary for ${data.date}.`),
  };
}

// ─── Template: Monthly Summary ──────────────────────────────────────────────

export interface MonthlySummaryData {
  userName: string;
  month: string;
  totalDocuments: number;
  documentsAdded: number;
  documentsExpired: number;
  aiQuestionsAsked: number;
  averageScore: number;
  scoreChange: number;
  topCategory: string;
  highlights: string[];
}

export function monthlySummaryEmail(data: MonthlySummaryData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const scoreColor = data.averageScore >= 80 ? BRAND.successColor : data.averageScore >= 50 ? BRAND.warningColor : BRAND.dangerColor;
  const changeIcon = data.scoreChange > 0 ? '↑' : data.scoreChange < 0 ? '↓' : '→';
  const changeColor = data.scoreChange > 0 ? BRAND.successColor : data.scoreChange < 0 ? BRAND.dangerColor : BRAND.textMuted;
  const content = `
    ${iconBadge('📅', BRAND.primaryColor)}
    ${heading(`${data.month} in Review`)}
    ${subheading(`Hi ${firstName}, here's your monthly vault summary.`)}

    <!-- Monthly Score -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0; text-align:center;">
      <tr>
        <td style="padding:20px; background:${scoreColor}08; border-radius:16px;">
          <p style="font-size:48px; font-weight:800; color:${scoreColor}; margin:0; line-height:1;">${data.averageScore}</p>
          <p style="font-size:14px; color:${BRAND.textMuted}; margin:4px 0 0;" class="email-text-muted">
            Average Score
            <span style="color:${changeColor}; font-weight:600;"> ${changeIcon} ${Math.abs(data.scoreChange)}</span>
          </p>
        </td>
      </tr>
    </table>

    ${detailsTable([
      { label: 'Total documents', value: String(data.totalDocuments) },
      { label: 'Added this month', value: `+${data.documentsAdded}` },
      { label: 'Expired this month', value: String(data.documentsExpired) },
      { label: 'AI questions asked', value: String(data.aiQuestionsAsked) },
      { label: 'Top category', value: data.topCategory.charAt(0).toUpperCase() + data.topCategory.slice(1) },
    ])}

    ${data.highlights.length > 0 ? `
      ${divider()}
      <p style="font-size:15px; font-weight:600; color:${BRAND.textDark}; margin:0 0 8px;" class="email-text-dark">Highlights</p>
      <ul style="margin:0 0 16px; padding-left:20px; font-size:13px; color:${BRAND.textMuted}; line-height:2;" class="email-text-muted">
        ${data.highlights.map(h => `<li>${h}</li>`).join('')}
      </ul>
    ` : ''}
    ${primaryButton('View Dashboard', `${BRAND.appUrl}#dashboard`)}
  `;
  return {
    subject: `${BRAND.name} — Your ${data.month} Summary`,
    html: baseLayout(content, `Your ${data.month} vault summary is ready.`),
  };
}

// ─── Template: Scheduled Maintenance ────────────────────────────────────────

export interface ScheduledMaintenanceData {
  startTime: string;
  endTime: string;
  duration: string;
  affectedServices: string[];
  reason?: string;
}

export function scheduledMaintenanceEmail(data: ScheduledMaintenanceData): { subject: string; html: string } {
  const content = `
    ${iconBadge('🔧', BRAND.infoColor)}
    ${heading('Scheduled Maintenance')}
    ${subheading(`We'll be performing maintenance on ${data.startTime}.`)}
    ${detailsTable([
      { label: 'Start time', value: data.startTime },
      { label: 'End time', value: data.endTime },
      { label: 'Duration', value: data.duration },
      ...(data.reason ? [{ label: 'Reason', value: data.reason }] : []),
    ])}
    ${data.affectedServices.length > 0 ? infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.infoColor}; margin:0 0 8px;">Affected Services</p>
      <ul style="margin:0; padding-left:20px; font-size:13px; color:${BRAND.textMuted}; line-height:2;" class="email-text-muted">
        ${data.affectedServices.map(s => `<li>${s}</li>`).join('')}
      </ul>
    `, BRAND.infoColor) : ''}
    ${paragraph('During maintenance, some features may be temporarily unavailable. Your documents and data are safe.')}
    ${smallText('We appreciate your patience. No action is needed on your part.')}
  `;
  return {
    subject: `${BRAND.name} — Scheduled maintenance on ${data.startTime}`,
    html: baseLayout(content, `Scheduled maintenance on ${data.startTime}. Some services may be briefly unavailable.`),
  };
}

// ─── Template: Service Outage ───────────────────────────────────────────────

export interface ServiceOutageData {
  status: 'ongoing' | 'resolved';
  affectedServices: string[];
  startTime: string;
  resolvedTime?: string;
  details?: string;
}

export function serviceOutageEmail(data: ServiceOutageData): { subject: string; html: string } {
  const isResolved = data.status === 'resolved';
  const content = `
    ${iconBadge(isResolved ? '✅' : '⚡', isResolved ? BRAND.successColor : BRAND.dangerColor)}
    ${heading(isResolved ? 'Service Restored' : 'Service Disruption')}
    ${subheading(isResolved
      ? 'All services have been restored and are operating normally.'
      : 'We are currently experiencing a service disruption.'
    )}
    ${detailsTable([
      { label: 'Status', value: isResolved ? 'Resolved' : 'Ongoing' },
      { label: 'Started at', value: data.startTime },
      ...(data.resolvedTime ? [{ label: 'Resolved at', value: data.resolvedTime }] : []),
    ])}
    ${data.affectedServices.length > 0 ? infoBox(`
      <p style="font-size:14px; font-weight:600; color:${isResolved ? BRAND.successColor : BRAND.dangerColor}; margin:0 0 8px;">Affected Services</p>
      <ul style="margin:0; padding-left:20px; font-size:13px; color:${BRAND.textMuted}; line-height:2;" class="email-text-muted">
        ${data.affectedServices.map(s => `<li>${s}</li>`).join('')}
      </ul>
    `, isResolved ? BRAND.successColor : BRAND.dangerColor) : ''}
    ${data.details ? paragraph(data.details) : ''}
    ${!isResolved ? paragraph('Our team is actively working to resolve this issue. Your documents and data are safe.') : ''}
    ${smallText(`Questions? Contact us at <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.primaryColor};">${BRAND.supportEmail}</a>.`)}
  `;
  return {
    subject: isResolved
      ? `${BRAND.name} — Service restored`
      : `${BRAND.name} — Service disruption in progress`,
    html: baseLayout(content, isResolved
      ? 'All services have been restored.'
      : 'We are experiencing a service disruption. Our team is working on it.'
    ),
  };
}

// ─── Template: Preferences Updated ──────────────────────────────────────────

export interface PreferencesUpdatedData {
  userName: string;
  changes: { setting: string; oldValue: string; newValue: string }[];
  timestamp: string;
}

export function preferencesUpdatedEmail(data: PreferencesUpdatedData): { subject: string; html: string } {
  const changeRows = data.changes.map(c =>
    `<tr>
      <td style="padding:8px 0; font-size:13px; color:${BRAND.textMuted}; border-bottom:1px solid ${BRAND.borderColor};" class="email-text-muted email-border">${c.setting}</td>
      <td style="padding:8px 0; font-size:13px; color:${BRAND.textLight}; border-bottom:1px solid ${BRAND.borderColor};" class="email-text-muted email-border">${c.oldValue}</td>
      <td style="padding:8px 0; font-size:13px; font-weight:600; color:${BRAND.textDark}; border-bottom:1px solid ${BRAND.borderColor};" class="email-text-dark email-border">${c.newValue}</td>
    </tr>`
  ).join('');
  const content = `
    ${iconBadge('⚙️', BRAND.primaryColor)}
    ${heading('Preferences Updated')}
    ${subheading('Your notification preferences have been changed.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <th style="padding:8px 0; font-size:12px; color:${BRAND.textLight}; text-align:left; text-transform:uppercase; letter-spacing:0.5px; border-bottom:2px solid ${BRAND.borderColor};" class="email-text-muted email-border">Setting</th>
        <th style="padding:8px 0; font-size:12px; color:${BRAND.textLight}; text-align:left; text-transform:uppercase; letter-spacing:0.5px; border-bottom:2px solid ${BRAND.borderColor};" class="email-text-muted email-border">Was</th>
        <th style="padding:8px 0; font-size:12px; color:${BRAND.textLight}; text-align:left; text-transform:uppercase; letter-spacing:0.5px; border-bottom:2px solid ${BRAND.borderColor};" class="email-text-muted email-border">Now</th>
      </tr>
      ${changeRows}
    </table>
    ${smallText(`Changed on ${new Date(data.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}. If you didn't make this change, please review your account security.`)}
  `;
  return {
    subject: `${BRAND.name} — Notification preferences updated`,
    html: baseLayout(content, 'Your notification preferences have been updated.'),
  };
}

// ─── Template: Profile Updated ──────────────────────────────────────────────

export interface ProfileUpdatedData {
  userName: string;
  changes: { field: string; newValue: string }[];
  timestamp: string;
}

export function profileUpdatedEmail(data: ProfileUpdatedData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const content = `
    ${iconBadge('👤', BRAND.primaryColor)}
    ${heading('Profile Updated')}
    ${subheading(`Hi ${firstName}, your profile information has been changed.`)}
    ${detailsTable(
      data.changes.map(c => ({ label: c.field, value: c.newValue }))
    )}
    ${smallText(`Updated on ${new Date(data.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}. If you didn't make this change, please secure your account.`)}
  `;
  return {
    subject: `${BRAND.name} — Profile updated`,
    html: baseLayout(content, 'Your profile information has been updated.'),
  };
}

// ─── Template: Suspicious Login ─────────────────────────────────────────────

export interface SuspiciousLoginData {
  userName: string;
  email: string;
  ipAddress: string;
  location?: string;
  device: string;
  reason: string;
  timestamp: string;
}

export function suspiciousLoginEmail(data: SuspiciousLoginData): { subject: string; html: string } {
  const content = `
    ${iconBadge('🚨', BRAND.dangerColor)}
    ${heading('Suspicious Login Detected')}
    ${subheading('We detected an unusual sign-in attempt on your account.')}
    ${detailsTable([
      { label: 'Account', value: data.email },
      { label: 'Device', value: data.device },
      { label: 'IP address', value: data.ipAddress },
      ...(data.location ? [{ label: 'Location', value: data.location }] : []),
      { label: 'Time', value: new Date(data.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) },
    ])}
    ${infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.dangerColor}; margin:0 0 4px;">Why this was flagged</p>
      <p style="font-size:13px; color:${BRAND.textMuted}; margin:0;" class="email-text-muted">${data.reason}</p>
    `, BRAND.dangerColor)}
    ${paragraph('<strong>If this was you:</strong> You can safely ignore this email.')}
    ${paragraph('<strong>If this wasn\'t you:</strong> Change your password immediately and review your recent account activity.')}
    ${primaryButton('Secure My Account', `${BRAND.appUrl}/settings`)}
    ${smallText(`This alert cannot be disabled. Contact <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.primaryColor};">${BRAND.supportEmail}</a> if you need help.`)}
  `;
  return {
    subject: `${BRAND.name} — ALERT: Suspicious sign-in detected`,
    html: baseLayout(content, 'Suspicious sign-in detected on your account. Please review immediately.'),
  };
}

// ─── Dunning Templates (Payment Failure Escalation) ──────────────────────────

export interface DunningFriendlyReminderData {
  userName: string;
  plan: string;
  amount: string;
  currency: string;
  failureReason?: string;
  retryDate: string;
}

export function dunningFriendlyReminderEmail(data: DunningFriendlyReminderData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const content = `
    ${iconBadge('💳', BRAND.warningColor)}
    ${heading('Heads Up — Payment Issue')}
    ${subheading(`Hi ${firstName}, we couldn't process your latest payment.`)}
    ${paragraph(`We attempted to charge ${data.amount} ${data.currency.toUpperCase()} for your <strong>${data.plan}</strong> plan, but it didn't go through. Don't worry — we'll automatically retry on <strong>${data.retryDate}</strong>.`)}
    ${data.failureReason ? infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.warningColor}; margin:0 0 4px;">Reason</p>
      <p style="font-size:13px; color:${BRAND.textMuted}; margin:0;">${data.failureReason}</p>
    `, BRAND.warningColor) : ''}
    ${primaryButton('Update Payment Method', `${BRAND.appUrl}/settings`)}
    ${smallText('You currently have full access. We\'ll keep retrying automatically.')}
  `;
  return {
    subject: `${BRAND.name} — Payment issue with your ${data.plan} plan`,
    html: baseLayout(content, `We couldn't process your payment of ${data.amount} ${data.currency.toUpperCase()}. We'll retry automatically.`),
  };
}

export interface DunningUpdateUrgentData {
  userName: string;
  plan: string;
  amount: string;
  currency: string;
  daysSinceFailure: number;
}

export function dunningUpdateUrgentEmail(data: DunningUpdateUrgentData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const content = `
    ${iconBadge('⚠️', BRAND.warningColor)}
    ${heading('Payment Still Failing')}
    ${subheading(`Hi ${firstName}, your payment of ${data.amount} ${data.currency.toUpperCase()} has failed again.`)}
    ${paragraph(`It's been <strong>${data.daysSinceFailure} days</strong> since the first failure. We're still retrying automatically, but to ensure uninterrupted access, please update your payment method.`)}
    ${detailsTable([
      { label: 'Plan', value: data.plan.charAt(0).toUpperCase() + data.plan.slice(1) },
      { label: 'Amount due', value: `${data.amount} ${data.currency.toUpperCase()}` },
      { label: 'Days overdue', value: String(data.daysSinceFailure) },
    ])}
    ${primaryButton('Update Payment Method', `${BRAND.appUrl}/settings`)}
    ${smallText('You still have full access, but this will change if payment isn\'t resolved.')}
  `;
  return {
    subject: `${BRAND.name} — Payment still failing — Please update your card`,
    html: baseLayout(content, `Your payment has failed for ${data.daysSinceFailure} days. Please update your payment method.`),
  };
}

export interface DunningFeatureCountdownData {
  userName: string;
  plan: string;
  features: string[];
  restrictionDate: string;
}

export function dunningFeatureCountdownEmail(data: DunningFeatureCountdownData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const featureList = data.features.map(f => `<li style="margin:4px 0;">${f}</li>`).join('');
  const content = `
    ${iconBadge('⏰', BRAND.dangerColor)}
    ${heading('Features at Risk')}
    ${subheading(`Hi ${firstName}, your payment is still outstanding.`)}
    ${paragraph(`If payment isn't resolved by <strong>${data.restrictionDate}</strong>, access to these features will be restricted:`)}
    <ul style="margin:12px 0; padding-left:20px; font-size:14px; color:${BRAND.textDark}; line-height:1.8;">${featureList}</ul>
    ${infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.dangerColor}; margin:0 0 4px;">Action Required</p>
      <p style="font-size:13px; color:${BRAND.textMuted}; margin:0;">Update your payment method to keep full access to your ${data.plan} plan.</p>
    `, BRAND.dangerColor)}
    ${primaryButton('Update Payment Method', `${BRAND.appUrl}/settings`)}
  `;
  return {
    subject: `${BRAND.name} — You'll lose access to premium features in 2 days`,
    html: baseLayout(content, `Your premium features will be restricted on ${data.restrictionDate} if payment isn't resolved.`),
  };
}

export interface DunningAccessRestrictedData {
  userName: string;
  plan: string;
  documentLimit: number;
  documentCount: number;
}

export function dunningAccessRestrictedEmail(data: DunningAccessRestrictedData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const content = `
    ${iconBadge('🔒', BRAND.dangerColor)}
    ${heading('Account Restricted')}
    ${subheading(`Hi ${firstName}, your account access has been restricted due to unpaid balance.`)}
    ${paragraph('We\'ve tried multiple times to process your payment, but each attempt has failed. Your account is now in <strong>restricted mode</strong>.')}
    ${infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.dangerColor}; margin:0 0 8px;">What's restricted</p>
      <ul style="margin:0; padding-left:20px; font-size:13px; color:${BRAND.textMuted}; line-height:2;">
        <li>No new document uploads</li>
        <li>AI chat is disabled</li>
        <li>Financial insights paused</li>
        <li>Documents above free limit (${data.documentLimit}) are read-only</li>
      </ul>
    `, BRAND.dangerColor)}
    ${paragraph('All your documents are safe. Update your payment method to instantly restore full access.')}
    ${primaryButton('Restore Access Now', `${BRAND.appUrl}/settings`)}
    ${smallText(`Need help? Contact <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.primaryColor};">${BRAND.supportEmail}</a>.`)}
  `;
  return {
    subject: `${BRAND.name} — Account restricted — Payment required`,
    html: baseLayout(content, 'Your account has been restricted due to unpaid balance. Update your payment method to restore access.'),
  };
}

export interface DunningLastChanceData {
  userName: string;
  plan: string;
  downgradeDate: string;
  documentCount: number;
  freeLimit: number;
}

export function dunningLastChanceEmail(data: DunningLastChanceData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const excessDocs = Math.max(0, data.documentCount - data.freeLimit);
  const content = `
    ${iconBadge('🚨', BRAND.dangerColor)}
    ${heading('Last Chance — Downgrade in 7 Days')}
    ${subheading(`Hi ${firstName}, your ${data.plan} plan will be downgraded to Free on ${data.downgradeDate}.`)}
    ${paragraph(`We've been unable to process your payment after multiple retries. If payment isn't resolved by <strong>${data.downgradeDate}</strong>, your account will be permanently downgraded.`)}
    ${excessDocs > 0 ? infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.dangerColor}; margin:0 0 4px;">Impact</p>
      <p style="font-size:13px; color:${BRAND.textMuted}; margin:0;">
        You have <strong>${data.documentCount}</strong> documents. The Free plan allows <strong>${data.freeLimit}</strong>.
        ${excessDocs} document${excessDocs > 1 ? 's' : ''} will be scheduled for deletion after downgrade.
      </p>
    `, BRAND.dangerColor) : ''}
    ${primaryButton('Update Payment Method', `${BRAND.appUrl}/settings`)}
    ${smallText('Update your card now and your full access will be restored instantly.')}
  `;
  return {
    subject: `${BRAND.name} — URGENT: Account downgrades to Free in 7 days`,
    html: baseLayout(content, `Your account will be downgraded to Free on ${data.downgradeDate} if payment isn't resolved.`),
  };
}

export interface DunningDowngradeNoticeData {
  userName: string;
  previousPlan: string;
  documentCount: number;
  freeLimit: number;
  deletionDate: string;
}

export function dunningDowngradeNoticeEmail(data: DunningDowngradeNoticeData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const excessDocs = Math.max(0, data.documentCount - data.freeLimit);
  const content = `
    ${iconBadge('📉', BRAND.warningColor)}
    ${heading('Account Downgraded to Free')}
    ${subheading(`Hi ${firstName}, your ${data.previousPlan} plan has been downgraded to Free due to non-payment.`)}
    ${detailsTable([
      { label: 'Previous plan', value: data.previousPlan.charAt(0).toUpperCase() + data.previousPlan.slice(1) },
      { label: 'Current plan', value: 'Free' },
      { label: 'Document limit', value: String(data.freeLimit) },
      { label: 'Your documents', value: String(data.documentCount) },
    ])}
    ${excessDocs > 0 ? infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.dangerColor}; margin:0 0 4px;">Important</p>
      <p style="font-size:13px; color:${BRAND.textMuted}; margin:0;">
        <strong>${excessDocs}</strong> document${excessDocs > 1 ? 's' : ''} exceed${excessDocs === 1 ? 's' : ''} the Free plan limit and will be <strong>permanently deleted on ${data.deletionDate}</strong>.
        Bank account connections have been disconnected.
      </p>
    `, BRAND.dangerColor) : ''}
    ${paragraph('Resubscribe before the deletion date to keep all your documents.')}
    ${primaryButton('Resubscribe Now', `${BRAND.appUrl}/settings`)}
    ${smallText(`Questions? Contact <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.primaryColor};">${BRAND.supportEmail}</a>.`)}
  `;
  return {
    subject: `${BRAND.name} — Account downgraded to Free plan`,
    html: baseLayout(content, `Your account was downgraded to Free. ${excessDocs > 0 ? `${excessDocs} documents will be deleted on ${data.deletionDate}.` : ''}`),
  };
}

export interface DunningDeletionWarningData {
  userName: string;
  excessDocuments: number;
  deletionDate: string;
  documentNames: string[];
}

export function dunningDeletionWarningEmail(data: DunningDeletionWarningData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const docList = data.documentNames.slice(0, 10).map(n => `<li style="margin:4px 0;">${n}</li>`).join('');
  const content = `
    ${iconBadge('🗑️', BRAND.dangerColor)}
    ${heading('Documents Will Be Deleted')}
    ${subheading(`Hi ${firstName}, ${data.excessDocuments} document${data.excessDocuments > 1 ? 's' : ''} will be permanently deleted on ${data.deletionDate}.`)}
    ${paragraph('This is your <strong>final warning</strong>. After this date, the following documents (and their AI embeddings, chat history, and related data) will be <strong>permanently and irreversibly deleted</strong>:')}
    <ul style="margin:12px 0; padding-left:20px; font-size:14px; color:${BRAND.textDark}; line-height:1.8;">${docList}</ul>
    ${data.documentNames.length > 10 ? `<p style="font-size:13px; color:${BRAND.textLight}; margin:8px 0;">...and ${data.documentNames.length - 10} more</p>` : ''}
    ${infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.dangerColor}; margin:0 0 4px;">How to prevent this</p>
      <p style="font-size:13px; color:${BRAND.textMuted}; margin:0;">Resubscribe to any paid plan before ${data.deletionDate} to keep all your documents.</p>
    `, BRAND.dangerColor)}
    ${primaryButton('Resubscribe Now', `${BRAND.appUrl}/settings`)}
    ${smallText('This action cannot be undone after the deletion date.')}
  `;
  return {
    subject: `${BRAND.name} — FINAL WARNING: ${data.excessDocuments} documents will be deleted on ${data.deletionDate}`,
    html: baseLayout(content, `${data.excessDocuments} documents will be permanently deleted on ${data.deletionDate}. Resubscribe to prevent this.`),
  };
}

export interface DunningFinalConfirmationData {
  userName: string;
  documentsDeleted: number;
  documentsRemaining: number;
  banksDisconnected: number;
}

export function dunningFinalConfirmationEmail(data: DunningFinalConfirmationData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const content = `
    ${iconBadge('📋', BRAND.textMuted)}
    ${heading('Dunning Process Complete')}
    ${subheading(`Hi ${firstName}, your account cleanup has been completed.`)}
    ${detailsTable([
      { label: 'Documents deleted', value: String(data.documentsDeleted) },
      { label: 'Documents remaining', value: String(data.documentsRemaining) },
      { label: 'Bank accounts disconnected', value: String(data.banksDisconnected) },
      { label: 'Current plan', value: 'Free' },
    ])}
    ${paragraph('Your account is now on the Free plan. The deleted documents and bank connections <strong>cannot be recovered</strong>.')}
    ${paragraph('You can continue using DocuIntelli with the Free plan, or resubscribe at any time to unlock premium features.')}
    ${primaryButton('View Plans', `${BRAND.appUrl}/settings`)}
    ${smallText(`Need help? Contact <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.primaryColor};">${BRAND.supportEmail}</a>.`)}
  `;
  return {
    subject: `${BRAND.name} — Account cleanup complete`,
    html: baseLayout(content, `${data.documentsDeleted} documents deleted. Your account is now on the Free plan.`),
  };
}

export interface DunningPaymentRecoveredData {
  userName: string;
  plan: string;
}

export function dunningPaymentRecoveredEmail(data: DunningPaymentRecoveredData): { subject: string; html: string } {
  const firstName = data.userName?.split(' ')[0] || 'there';
  const content = `
    ${iconBadge('✅', BRAND.successColor)}
    ${heading('Payment Received — Welcome Back!')}
    ${subheading(`Hi ${firstName}, your payment has been successfully processed.`)}
    ${paragraph(`Your <strong>${data.plan}</strong> plan has been fully restored. All features and access are back to normal.`)}
    ${infoBox(`
      <p style="font-size:14px; font-weight:600; color:${BRAND.successColor}; margin:0 0 4px;">All clear</p>
      <p style="font-size:13px; color:${BRAND.textMuted}; margin:0;">Your account is in good standing. No further action is needed.</p>
    `, BRAND.successColor)}
    ${primaryButton('Go to Dashboard', `${BRAND.appUrl}/dashboard`)}
  `;
  return {
    subject: `${BRAND.name} — Payment received — Access restored`,
    html: baseLayout(content, 'Your payment was successful and your full access has been restored.'),
  };
}

// ─── Template Map (for programmatic access) ────────────────────────────────────

export type EmailTemplate =
  | 'welcome'
  | 'password_changed'
  | 'account_deleted'
  | 'subscription_confirmed'
  | 'payment_receipt'
  | 'payment_failed'
  | 'subscription_canceled'
  | 'subscription_upgraded'
  | 'subscription_downgraded'
  | 'subscription_reactivated'
  | 'usage_limit_warning'
  | 'document_expiring'
  | 'document_expired'
  | 'document_processing_failed'
  | 'weekly_audit'
  | 'life_event_created'
  | 'life_event_complete'
  | 'document_health_alert'
  | 'subscription_expiring_soon'
  | 'document_uploaded'
  | 'document_processing_complete'
  | 'document_deleted'
  | 'document_metadata_updated'
  | 'document_review_overdue'
  | 'gap_suggestion'
  | 'preparedness_score_drop'
  | 'life_event_readiness_change'
  | 'life_event_requirement_missing'
  | 'life_event_archived'
  | 'new_device_login'
  | 'daily_summary'
  | 'monthly_summary'
  | 'scheduled_maintenance'
  | 'service_outage'
  | 'preferences_updated'
  | 'profile_updated'
  | 'suspicious_login'
  | 'dunning_friendly_reminder'
  | 'dunning_update_urgent'
  | 'dunning_feature_countdown'
  | 'dunning_access_restricted'
  | 'dunning_last_chance'
  | 'dunning_downgrade_notice'
  | 'dunning_deletion_warning'
  | 'dunning_final_confirmation'
  | 'dunning_payment_recovered';
