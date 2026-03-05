/**
 * DocuIntelli AI - Email Service (Mailjet SMTP)
 *
 * Sends transactional emails via Mailjet SMTP using nodemailer.
 * Respects user notification preferences from user_subscriptions table.
 */

import nodemailer from 'nodemailer';
import { query } from '../services/db';
import {
  welcomeEmail,
  passwordChangedEmail,
  accountDeletedEmail,
  subscriptionConfirmedEmail,
  paymentReceiptEmail,
  paymentFailedEmail,
  subscriptionCanceledEmail,
  subscriptionUpgradedEmail,
  subscriptionDowngradedEmail,
  subscriptionReactivatedEmail,
  usageLimitWarningEmail,
  documentExpiringEmail,
  documentExpiredEmail,
  documentProcessingFailedEmail,
  weeklyAuditEmail,
  lifeEventCreatedEmail,
  lifeEventCompleteEmail,
  documentHealthAlertEmail,
  subscriptionExpiringSoonEmail,
  documentUploadedEmail,
  documentProcessingCompleteEmail,
  documentDeletedEmail,
  documentMetadataUpdatedEmail,
  documentReviewOverdueEmail,
  gapSuggestionEmail,
  preparednessScoreDropEmail,
  lifeEventReadinessChangeEmail,
  lifeEventRequirementMissingEmail,
  lifeEventArchivedEmail,
  newDeviceLoginEmail,
  dailySummaryEmail,
  monthlySummaryEmail,
  scheduledMaintenanceEmail,
  serviceOutageEmail,
  preferencesUpdatedEmail,
  profileUpdatedEmail,
  suspiciousLoginEmail,
  dunningFriendlyReminderEmail,
  dunningUpdateUrgentEmail,
  dunningFeatureCountdownEmail,
  dunningAccessRestrictedEmail,
  dunningLastChanceEmail,
  dunningDowngradeNoticeEmail,
  dunningDeletionWarningEmail,
  dunningFinalConfirmationEmail,
  dunningPaymentRecoveredEmail,
  bankAccountConnectedEmail,
  bankAccountDisconnectedEmail,
  goalCreatedEmail,
  goalMilestoneEmail,
  goalCompletedEmail,
  goalExpiredEmail,
  goalDeadlineApproachingEmail,
  lifeEventDeadlineApproachingEmail,
  emergencyContactInviteEmail,
  emergencyInviteAcceptedEmail,
  emergencyAccessRequestedEmail,
  emergencyAccessGrantedEmail,
  emergencyAccessDeniedEmail,
  emergencyCooldownReminderEmail,
  supportTicketCreatedEmail,
  type EmailTemplate,
} from './emailTemplates';

// ─── Configuration ─────────────────────────────────────────────────────────────

const SMTP_HOST = process.env.SMTP_HOST || 'in-v3.mailjet.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';         // Mailjet API Key
const SMTP_PASS = process.env.SMTP_PASS || '';         // Mailjet Secret Key
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@docuintelli.com';
const FROM_NAME = process.env.FROM_NAME || 'DocuIntelli AI';

// ─── Transporter ───────────────────────────────────────────────────────────────

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    if (!SMTP_USER || !SMTP_PASS) {
      throw new Error(
        'Email service not configured. Set SMTP_USER (Mailjet API Key) and SMTP_PASS (Mailjet Secret Key) in environment variables.'
      );
    }

    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false, // STARTTLS on port 587
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false,
      },
    });

    console.log(`📧 Email service initialized (${SMTP_HOST}:${SMTP_PORT})`);
  }
  return transporter;
}

// ─── Notification Preference Categories ────────────────────────────────────────

/**
 * Notification Preference Categories (6 groups)
 *
 * 1. security_alerts     — Login, password, suspicious activity (critical — always on)
 * 2. billing_alerts      — Payments, subscriptions, plan changes
 * 3. document_alerts     — Uploads, processing, expirations, deletions, health
 * 4. engagement_digests  — Weekly/daily/monthly summaries, gap suggestions, score changes
 * 5. life_event_alerts   — Life events, readiness, requirements
 * 6. activity_alerts     — Profile changes, preference updates, metadata changes
 */
type NotificationCategory =
  | 'security_alerts'
  | 'billing_alerts'
  | 'document_alerts'
  | 'engagement_digests'
  | 'life_event_alerts'
  | 'activity_alerts';

const TEMPLATE_CATEGORY_MAP: Record<EmailTemplate, NotificationCategory> = {
  // Security & Account (always sent — critical)
  welcome: 'security_alerts',
  password_changed: 'security_alerts',
  account_deleted: 'security_alerts',
  new_device_login: 'security_alerts',
  suspicious_login: 'security_alerts',

  // Billing & Subscription
  subscription_confirmed: 'billing_alerts',
  payment_receipt: 'billing_alerts',
  payment_failed: 'billing_alerts',
  subscription_canceled: 'billing_alerts',
  subscription_upgraded: 'billing_alerts',
  subscription_downgraded: 'billing_alerts',
  subscription_reactivated: 'billing_alerts',
  subscription_expiring_soon: 'billing_alerts',
  usage_limit_warning: 'billing_alerts',

  // Document Alerts
  document_uploaded: 'document_alerts',
  document_processing_complete: 'document_alerts',
  document_processing_failed: 'document_alerts',
  document_deleted: 'document_alerts',
  document_expiring: 'document_alerts',
  document_expired: 'document_alerts',
  document_health_alert: 'document_alerts',
  document_metadata_updated: 'document_alerts',
  document_review_overdue: 'document_alerts',

  // Engagement Digests
  weekly_audit: 'engagement_digests',
  daily_summary: 'engagement_digests',
  monthly_summary: 'engagement_digests',
  gap_suggestion: 'engagement_digests',
  preparedness_score_drop: 'engagement_digests',

  // Life Events
  life_event_created: 'life_event_alerts',
  life_event_complete: 'life_event_alerts',
  life_event_readiness_change: 'life_event_alerts',
  life_event_requirement_missing: 'life_event_alerts',
  life_event_archived: 'life_event_alerts',

  // Activity
  preferences_updated: 'activity_alerts',
  profile_updated: 'activity_alerts',

  // System (always sent)
  scheduled_maintenance: 'security_alerts',
  service_outage: 'security_alerts',

  // Dunning (payment failure escalation — always sent, critical billing)
  dunning_friendly_reminder: 'billing_alerts',
  dunning_update_urgent: 'billing_alerts',
  dunning_feature_countdown: 'billing_alerts',
  dunning_access_restricted: 'billing_alerts',
  dunning_last_chance: 'billing_alerts',
  dunning_downgrade_notice: 'billing_alerts',
  dunning_deletion_warning: 'billing_alerts',
  dunning_final_confirmation: 'billing_alerts',
  dunning_payment_recovered: 'billing_alerts',

  // Financial Insights & Goals
  bank_account_connected: 'activity_alerts',
  bank_account_disconnected: 'activity_alerts',
  goal_created: 'engagement_digests',
  goal_milestone: 'engagement_digests',
  goal_completed: 'engagement_digests',
  goal_expired: 'engagement_digests',
  goal_deadline_approaching: 'engagement_digests',
  life_event_deadline_approaching: 'life_event_alerts',

  // Emergency Access
  emergency_contact_invite: 'life_event_alerts',
  emergency_invite_accepted: 'life_event_alerts',
  emergency_access_requested: 'life_event_alerts',
  emergency_access_granted: 'life_event_alerts',
  emergency_access_denied: 'life_event_alerts',
  emergency_cooldown_reminder: 'life_event_alerts',

  // Support Tickets
  support_ticket_created: 'activity_alerts',
};

// Templates that bypass preference checks (always sent regardless of user settings)
const ALWAYS_SEND_TEMPLATES: EmailTemplate[] = [
  'welcome',
  'password_changed',
  'account_deleted',
  'payment_failed',
  'subscription_confirmed',
  'payment_receipt',
  'subscription_canceled',
  'suspicious_login',
  'scheduled_maintenance',
  'service_outage',
  'dunning_friendly_reminder',
  'dunning_update_urgent',
  'dunning_feature_countdown',
  'dunning_access_restricted',
  'dunning_last_chance',
  'dunning_downgrade_notice',
  'dunning_deletion_warning',
  'dunning_final_confirmation',
  'dunning_payment_recovered',
  'emergency_contact_invite',
  'emergency_access_requested',
  'emergency_cooldown_reminder',
  'support_ticket_created',
];

// ─── User Preferences ─────────────────────────────────────────────────────────

interface UserNotificationPreferences {
  security_alerts: boolean;
  billing_alerts: boolean;
  document_alerts: boolean;
  engagement_digests: boolean;
  life_event_alerts: boolean;
  activity_alerts: boolean;
}

async function getUserPreferences(userId: string): Promise<UserNotificationPreferences> {
  const defaults: UserNotificationPreferences = {
    security_alerts: true,
    billing_alerts: true,
    document_alerts: true,
    engagement_digests: true,
    life_event_alerts: true,
    activity_alerts: true,
  };

  // Read from user_profiles first (source of truth for preferences), fall back to user_subscriptions
  try {
    const profileResult = await query(
      'SELECT security_alerts, billing_alerts, document_alerts, engagement_digests, life_event_alerts, activity_alerts FROM user_profiles WHERE id = $1',
      [userId]
    );

    let data = profileResult.rows[0];

    if (!data) {
      const subResult = await query(
        'SELECT security_alerts, billing_alerts, document_alerts, engagement_digests, life_event_alerts, activity_alerts FROM user_subscriptions WHERE user_id = $1',
        [userId]
      );
      data = subResult.rows[0];
    }

    if (!data) return defaults;

    return {
      security_alerts: data.security_alerts ?? true,
      billing_alerts: data.billing_alerts ?? true,
      document_alerts: data.document_alerts ?? true,
      engagement_digests: data.engagement_digests ?? true,
      life_event_alerts: data.life_event_alerts ?? true,
      activity_alerts: data.activity_alerts ?? true,
    };
  } catch (err) {
    console.error('Failed to fetch user preferences:', err);
    return defaults;
  }
}

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const result = await query(
      'SELECT email FROM auth_users WHERE id = $1',
      [userId]
    );
    return result.rows[0]?.email || null;
  } catch (err) {
    console.error('Failed to fetch user email:', err);
    return null;
  }
}

async function getUserName(userId: string): Promise<string> {
  try {
    const result = await query(
      'SELECT full_name, display_name FROM user_profiles WHERE id = $1',
      [userId]
    );
    const row = result.rows[0];
    return row?.full_name || row?.display_name || '';
  } catch (err) {
    console.error('Failed to fetch user name:', err);
    return '';
  }
}

// ─── Core Send Function ────────────────────────────────────────────────────────

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

async function sendRawEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transport = getTransporter();

    const result = await transport.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo || FROM_EMAIL,
    });

    console.log(`📧 Email sent to ${options.to}: "${options.subject}" (${result.messageId})`);
    return { success: true, messageId: result.messageId };
  } catch (error: any) {
    console.error(`📧 Email send failed to ${options.to}:`, error.message);
    return { success: false, error: error.message };
  }
}

// ─── Logging ───────────────────────────────────────────────────────────────────

async function logNotification(
  userId: string,
  template: EmailTemplate,
  recipientEmail: string,
  success: boolean,
  messageId?: string,
  error?: string,
): Promise<void> {
  try {
    await query(
      `INSERT INTO notification_logs (user_id, notification_type, channel, recipient, status, message_id, error_message, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, `email:${template}`, 'email', recipientEmail, success ? 'sent' : 'failed', messageId || null, error || null, new Date().toISOString()]
    );
  } catch (err) {
    console.error('Failed to log notification:', err);
  }
}

// ─── Public API: Send Notification Email ───────────────────────────────────────

/**
 * Send a templated email notification to a user.
 * Checks user preferences before sending (unless template is in ALWAYS_SEND list).
 */
export async function sendNotificationEmail(
  userId: string,
  template: EmailTemplate,
  data: any,
  overrideEmail?: string,
): Promise<{ sent: boolean; reason?: string }> {
  // 1. Check user preferences (unless always-send)
  if (!ALWAYS_SEND_TEMPLATES.includes(template)) {
    const preferences = await getUserPreferences(userId);
    const category = TEMPLATE_CATEGORY_MAP[template];
    if (!preferences[category]) {
      console.log(`📧 Skipped "${template}" for user ${userId} — ${category} disabled`);
      return { sent: false, reason: `User has ${category} disabled` };
    }
  }

  // 2. Resolve recipient email
  const recipientEmail = overrideEmail || await getUserEmail(userId);
  if (!recipientEmail) {
    console.error(`📧 No email found for user ${userId}`);
    return { sent: false, reason: 'No email address found' };
  }

  // 3. Generate email from template
  const email = generateEmail(template, data);
  if (!email) {
    return { sent: false, reason: `Unknown template: ${template}` };
  }

  // 4. Send email
  const result = await sendRawEmail({
    to: recipientEmail,
    subject: email.subject,
    html: email.html,
  });

  // 5. Log the result
  await logNotification(userId, template, recipientEmail, result.success, result.messageId, result.error);

  return { sent: result.success, reason: result.error };
}

/**
 * Send an email to any address (not user-id based).
 * Used for scenarios where we only have an email (e.g., account deletion confirmation).
 */
export async function sendDirectEmail(
  to: string,
  template: EmailTemplate,
  data: any,
): Promise<{ sent: boolean; reason?: string }> {
  const email = generateEmail(template, data);
  if (!email) {
    return { sent: false, reason: `Unknown template: ${template}` };
  }

  const result = await sendRawEmail({ to, subject: email.subject, html: email.html });
  return { sent: result.success, reason: result.error };
}

// ─── Template Dispatcher ───────────────────────────────────────────────────────

function generateEmail(template: EmailTemplate, data: any): { subject: string; html: string } | null {
  switch (template) {
    case 'welcome':
      return welcomeEmail(data);
    case 'password_changed':
      return passwordChangedEmail(data);
    case 'account_deleted':
      return accountDeletedEmail(data);
    case 'subscription_confirmed':
      return subscriptionConfirmedEmail(data);
    case 'payment_receipt':
      return paymentReceiptEmail(data);
    case 'payment_failed':
      return paymentFailedEmail(data);
    case 'subscription_canceled':
      return subscriptionCanceledEmail(data);
    case 'subscription_upgraded':
      return subscriptionUpgradedEmail(data);
    case 'subscription_downgraded':
      return subscriptionDowngradedEmail(data);
    case 'subscription_reactivated':
      return subscriptionReactivatedEmail(data);
    case 'usage_limit_warning':
      return usageLimitWarningEmail(data);
    case 'document_expiring':
      return documentExpiringEmail(data);
    case 'document_expired':
      return documentExpiredEmail(data);
    case 'document_processing_failed':
      return documentProcessingFailedEmail(data);
    case 'weekly_audit':
      return weeklyAuditEmail(data);
    case 'life_event_created':
      return lifeEventCreatedEmail(data);
    case 'life_event_complete':
      return lifeEventCompleteEmail(data);
    case 'document_health_alert':
      return documentHealthAlertEmail(data);
    case 'subscription_expiring_soon':
      return subscriptionExpiringSoonEmail(data);
    case 'document_uploaded':
      return documentUploadedEmail(data);
    case 'document_processing_complete':
      return documentProcessingCompleteEmail(data);
    case 'document_deleted':
      return documentDeletedEmail(data);
    case 'document_metadata_updated':
      return documentMetadataUpdatedEmail(data);
    case 'document_review_overdue':
      return documentReviewOverdueEmail(data);
    case 'gap_suggestion':
      return gapSuggestionEmail(data);
    case 'preparedness_score_drop':
      return preparednessScoreDropEmail(data);
    case 'life_event_readiness_change':
      return lifeEventReadinessChangeEmail(data);
    case 'life_event_requirement_missing':
      return lifeEventRequirementMissingEmail(data);
    case 'life_event_archived':
      return lifeEventArchivedEmail(data);
    case 'new_device_login':
      return newDeviceLoginEmail(data);
    case 'daily_summary':
      return dailySummaryEmail(data);
    case 'monthly_summary':
      return monthlySummaryEmail(data);
    case 'scheduled_maintenance':
      return scheduledMaintenanceEmail(data);
    case 'service_outage':
      return serviceOutageEmail(data);
    case 'preferences_updated':
      return preferencesUpdatedEmail(data);
    case 'profile_updated':
      return profileUpdatedEmail(data);
    case 'suspicious_login':
      return suspiciousLoginEmail(data);
    case 'dunning_friendly_reminder':
      return dunningFriendlyReminderEmail(data);
    case 'dunning_update_urgent':
      return dunningUpdateUrgentEmail(data);
    case 'dunning_feature_countdown':
      return dunningFeatureCountdownEmail(data);
    case 'dunning_access_restricted':
      return dunningAccessRestrictedEmail(data);
    case 'dunning_last_chance':
      return dunningLastChanceEmail(data);
    case 'dunning_downgrade_notice':
      return dunningDowngradeNoticeEmail(data);
    case 'dunning_deletion_warning':
      return dunningDeletionWarningEmail(data);
    case 'dunning_final_confirmation':
      return dunningFinalConfirmationEmail(data);
    case 'dunning_payment_recovered':
      return dunningPaymentRecoveredEmail(data);
    case 'bank_account_connected':
      return bankAccountConnectedEmail(data);
    case 'bank_account_disconnected':
      return bankAccountDisconnectedEmail(data);
    case 'goal_created':
      return goalCreatedEmail(data);
    case 'goal_milestone':
      return goalMilestoneEmail(data);
    case 'goal_completed':
      return goalCompletedEmail(data);
    case 'goal_expired':
      return goalExpiredEmail(data);
    case 'goal_deadline_approaching':
      return goalDeadlineApproachingEmail(data);
    case 'life_event_deadline_approaching':
      return lifeEventDeadlineApproachingEmail(data);

    // Emergency Access
    case 'emergency_contact_invite':
      return emergencyContactInviteEmail(data);
    case 'emergency_invite_accepted':
      return emergencyInviteAcceptedEmail(data);
    case 'emergency_access_requested':
      return emergencyAccessRequestedEmail(data);
    case 'emergency_access_granted':
      return emergencyAccessGrantedEmail(data);
    case 'emergency_access_denied':
      return emergencyAccessDeniedEmail(data);
    case 'emergency_cooldown_reminder':
      return emergencyCooldownReminderEmail(data);

    // Support Tickets
    case 'support_ticket_created':
      return supportTicketCreatedEmail(data);
    default:
      return null;
  }
}

// ─── Utility: Verify SMTP Connection ──────────────────────────────────────────

export async function verifyEmailConnection(): Promise<boolean> {
  try {
    const transport = getTransporter();
    await transport.verify();
    console.log('📧 SMTP connection verified successfully');
    return true;
  } catch (error: any) {
    console.error('📧 SMTP connection failed:', error.message);
    return false;
  }
}

// ─── Utility: Get User Info Helper ─────────────────────────────────────────────

export async function resolveUserInfo(userId: string): Promise<{ email: string; userName: string } | null> {
  const email = await getUserEmail(userId);
  if (!email) return null;
  const userName = await getUserName(userId);
  return { email, userName };
}
