/**
 * Send all 37 email templates to a test address for visual review.
 * Usage: npx ts-node src/scripts/sendAllTemplates.ts
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { sendDirectEmail } from '../services/emailService';
import type { EmailTemplate } from '../services/emailTemplates';

const TO = 'okestra0909@gmail.com';

interface TemplatePayload {
  template: EmailTemplate;
  data: any;
}

const allTemplates: TemplatePayload[] = [
  // 1. Welcome
  {
    template: 'welcome',
    data: {
      userName: 'Alex Johnson',
      email: TO,
    },
  },
  // 2. Password Changed
  {
    template: 'password_changed',
    data: {
      userName: 'Alex Johnson',
      email: TO,
      timestamp: new Date().toISOString(),
    },
  },
  // 3. Account Deleted
  {
    template: 'account_deleted',
    data: {
      userName: 'Alex Johnson',
      email: TO,
      documentCount: 14,
    },
  },
  // 4. Subscription Confirmed (Starter)
  {
    template: 'subscription_confirmed',
    data: {
      userName: 'Alex Johnson',
      plan: 'starter',
      amount: '$7',
      billingPeriod: 'month',
      documentLimit: 25,
      nextBillingDate: 'March 13, 2026',
    },
  },
  // 5. Subscription Confirmed (Pro)
  {
    template: 'subscription_confirmed',
    data: {
      userName: 'Alex Johnson',
      plan: 'pro',
      amount: '$19',
      billingPeriod: 'month',
      documentLimit: 100,
      nextBillingDate: 'March 13, 2026',
    },
  },
  // 6. Payment Receipt
  {
    template: 'payment_receipt',
    data: {
      userName: 'Alex Johnson',
      amount: '$19.00',
      currency: 'usd',
      plan: 'pro',
      invoiceId: 'INV-2026-0213',
      paymentDate: 'February 13, 2026',
      cardLast4: '4242',
      nextBillingDate: 'March 13, 2026',
    },
  },
  // 7. Payment Failed
  {
    template: 'payment_failed',
    data: {
      userName: 'Alex Johnson',
      amount: '$19.00',
      currency: 'usd',
      plan: 'pro',
      failureReason: 'Your card was declined due to insufficient funds.',
      retryDate: 'February 16, 2026',
    },
  },
  // 8. Subscription Canceled
  {
    template: 'subscription_canceled',
    data: {
      userName: 'Alex Johnson',
      plan: 'pro',
      effectiveDate: 'March 13, 2026',
      documentCount: 47,
    },
  },
  // 9. Subscription Upgraded
  {
    template: 'subscription_upgraded',
    data: {
      userName: 'Alex Johnson',
      oldPlan: 'starter',
      newPlan: 'pro',
      newAmount: '$19/month',
      effectiveDate: 'February 13, 2026',
    },
  },
  // 10. Subscription Downgraded
  {
    template: 'subscription_downgraded',
    data: {
      userName: 'Alex Johnson',
      oldPlan: 'pro',
      newPlan: 'starter',
      effectiveDate: 'March 13, 2026',
    },
  },
  // 11. Subscription Reactivated
  {
    template: 'subscription_reactivated',
    data: {
      userName: 'Alex Johnson',
      plan: 'pro',
    },
  },
  // 12. Usage Limit Warning
  {
    template: 'usage_limit_warning',
    data: {
      userName: 'Alex Johnson',
      limitType: 'documents',
      currentUsage: 4,
      limit: 5,
      plan: 'free',
    },
  },
  // 13. Document Expiring
  {
    template: 'document_expiring',
    data: {
      userName: 'Alex Johnson',
      documents: [
        { name: 'Auto Insurance Policy', category: 'insurance', expirationDate: 'February 15, 2026', daysUntil: 2 },
        { name: 'Apartment Lease Agreement', category: 'lease', expirationDate: 'February 20, 2026', daysUntil: 7 },
        { name: 'Dell Laptop Warranty', category: 'warranty', expirationDate: 'March 1, 2026', daysUntil: 16 },
      ],
    },
  },
  // 14. Document Expired
  {
    template: 'document_expired',
    data: {
      userName: 'Alex Johnson',
      documentName: 'Auto Insurance Policy',
      category: 'insurance',
      expiredDate: 'February 10, 2026',
    },
  },
  // 15. Document Processing Failed
  {
    template: 'document_processing_failed',
    data: {
      userName: 'Alex Johnson',
      documentName: 'Scanned_Contract_pg3.jpg',
      errorMessage: 'OCR extraction failed: image quality too low (DPI < 150). Please re-scan at a higher resolution.',
    },
  },
  // 16. Weekly Audit Digest
  {
    template: 'weekly_audit',
    data: {
      userName: 'Alex Johnson',
      preparednessScore: 72,
      scoreChange: -4,
      totalDocuments: 23,
      healthySummary: { healthy: 16, review: 3, risk: 2, critical: 2 },
      expiringDocuments: [
        { name: 'Auto Insurance Policy', daysUntil: 5 },
        { name: 'Apartment Lease', daysUntil: 12 },
        { name: 'Passport', daysUntil: 28 },
      ],
      missingMetadataCount: 4,
      gapSuggestions: [
        'You have an insurance policy but no vehicle registration on file',
        'Consider uploading a recent pay stub for employment records',
        'Add your health insurance card for complete coverage tracking',
      ],
    },
  },
  // 17. Life Event Created
  {
    template: 'life_event_created',
    data: {
      userName: 'Alex Johnson',
      eventTitle: 'Moving to a New Apartment',
      templateName: 'Moving / Relocation',
      requirementsCount: 12,
      readinessScore: 42,
      matchedDocuments: 5,
    },
  },
  // 18. Life Event Complete
  {
    template: 'life_event_complete',
    data: {
      userName: 'Alex Johnson',
      eventTitle: 'International Travel to Japan',
      completionDate: 'February 13, 2026',
      requirementsCount: 8,
    },
  },
  // 19. Document Health Alert (Critical)
  {
    template: 'document_health_alert',
    data: {
      userName: 'Alex Johnson',
      documentName: 'Home Insurance Policy',
      healthState: 'critical',
      healthScore: 18,
      reasons: [
        'Document expired 14 days ago',
        'No tags or metadata assigned',
        'Never reviewed since upload',
      ],
      recommendedActions: [
        'Upload a renewed insurance policy',
        'Add tags and expiration date',
        'Review and verify document details',
      ],
    },
  },
  // 20. Subscription Expiring Soon
  {
    template: 'subscription_expiring_soon',
    data: {
      userName: 'Alex Johnson',
      plan: 'pro',
      expirationDate: 'February 16, 2026',
      daysUntil: 3,
    },
  },
  // 21. Document Uploaded
  {
    template: 'document_uploaded',
    data: {
      userName: 'Alex Johnson',
      documentName: 'Home Purchase Agreement.pdf',
      category: 'contract',
      fileSize: '2.4 MB',
      uploadedAt: 'February 13, 2026, 3:42 PM',
    },
  },
  // 22. Document Processing Complete
  {
    template: 'document_processing_complete',
    data: {
      userName: 'Alex Johnson',
      documentName: 'Home Purchase Agreement.pdf',
      category: 'contract',
      tagsGenerated: 5,
      embeddingsCreated: true,
      expirationDetected: 'March 15, 2027',
    },
  },
  // 23. Document Deleted
  {
    template: 'document_deleted',
    data: {
      userName: 'Alex Johnson',
      documentName: 'Old Lease 2024.pdf',
      category: 'lease',
      deletedAt: 'February 13, 2026, 4:15 PM',
    },
  },
  // 24. Document Metadata Updated
  {
    template: 'document_metadata_updated',
    data: {
      userName: 'Alex Johnson',
      documentName: 'Auto Insurance Policy',
      changes: [
        { field: 'Expiration Date', oldValue: 'March 1, 2026', newValue: 'March 1, 2027' },
        { field: 'Tags', oldValue: 'insurance, auto', newValue: 'insurance, auto, renewal' },
      ],
    },
  },
  // 25. Document Review Overdue
  {
    template: 'document_review_overdue',
    data: {
      userName: 'Alex Johnson',
      documents: [
        { name: 'Employment Contract', category: 'employment', lastReviewed: 'August 10, 2025', daysSinceReview: 187 },
        { name: 'Homeowners Insurance', category: 'insurance', lastReviewed: 'October 1, 2025', daysSinceReview: 135 },
        { name: 'Vehicle Registration', category: 'other', lastReviewed: 'November 20, 2025', daysSinceReview: 85 },
      ],
    },
  },
  // 26. Gap Suggestion
  {
    template: 'gap_suggestion',
    data: {
      userName: 'Alex Johnson',
      preparednessScore: 64,
      suggestions: [
        { title: 'Health Insurance Card', description: 'You have medical records but no insurance card on file', category: 'insurance' },
        { title: 'Vehicle Registration', description: 'You have auto insurance but no registration document', category: 'other' },
        { title: 'Recent Pay Stub', description: 'Your employment contract is on file but no recent proof of income', category: 'employment' },
      ],
    },
  },
  // 27. Preparedness Score Drop
  {
    template: 'preparedness_score_drop',
    data: {
      userName: 'Alex Johnson',
      oldScore: 78,
      newScore: 52,
      dropAmount: 26,
      reasons: [
        'Auto Insurance Policy expired 3 days ago',
        'Apartment Lease expires in 5 days',
        '2 documents missing metadata (tags, expiration)',
      ],
    },
  },
  // 28. Life Event Readiness Change
  {
    template: 'life_event_readiness_change',
    data: {
      userName: 'Alex Johnson',
      eventTitle: 'Moving to a New Apartment',
      oldScore: 42,
      newScore: 67,
      direction: 'up',
      changedRequirements: [
        { name: 'Proof of Income', status: 'fulfilled' },
        { name: 'Bank Statement', status: 'fulfilled' },
        { name: 'Previous Landlord Reference', status: 'unfulfilled' },
      ],
    },
  },
  // 29. Life Event Requirement Missing
  {
    template: 'life_event_requirement_missing',
    data: {
      userName: 'Alex Johnson',
      eventTitle: 'Moving to a New Apartment',
      requirementName: 'Previous Landlord Reference Letter',
      category: 'other',
      urgency: 'high',
      dueDate: 'February 20, 2026',
    },
  },
  // 30. Life Event Archived
  {
    template: 'life_event_archived',
    data: {
      userName: 'Alex Johnson',
      eventTitle: 'International Travel to Japan',
      completionStatus: 'completed',
      finalScore: 100,
      requirementsMet: 8,
      totalRequirements: 8,
    },
  },
  // 31. New Device Login
  {
    template: 'new_device_login',
    data: {
      userName: 'Alex Johnson',
      email: TO,
      device: 'MacBook Pro (Chrome)',
      browser: 'Chrome 120',
      ipAddress: '203.0.113.42',
      location: 'San Francisco, CA',
      timestamp: new Date().toISOString(),
    },
  },
  // 32. Daily Summary
  {
    template: 'daily_summary',
    data: {
      userName: 'Alex Johnson',
      date: 'February 13, 2026',
      documentsUploaded: 3,
      documentsExpiringSoon: 2,
      aiQuestionsAsked: 7,
      preparednessScore: 72,
      topAction: 'Renew your Auto Insurance Policy expiring in 2 days',
    },
  },
  // 33. Monthly Summary
  {
    template: 'monthly_summary',
    data: {
      userName: 'Alex Johnson',
      month: 'January 2026',
      totalDocuments: 23,
      documentsAdded: 5,
      documentsExpired: 1,
      aiQuestionsAsked: 42,
      averageScore: 74,
      scoreChange: 8,
      topCategory: 'insurance',
      highlights: [
        'You uploaded 5 new documents this month',
        'Your preparedness score improved by 8 points',
        'You completed the "International Travel" life event',
      ],
    },
  },
  // 34. Scheduled Maintenance
  {
    template: 'scheduled_maintenance',
    data: {
      startTime: 'February 15, 2026 at 2:00 AM EST',
      endTime: 'February 15, 2026 at 4:00 AM EST',
      duration: '2 hours',
      affectedServices: ['Document Upload', 'AI Chat', 'Embedding Generation'],
      reason: 'Database optimization and infrastructure upgrades',
    },
  },
  // 35. Service Outage (Ongoing)
  {
    template: 'service_outage',
    data: {
      status: 'ongoing',
      affectedServices: ['AI Document Chat', 'Embedding Generation'],
      startTime: 'February 13, 2026 at 11:30 AM EST',
      details: 'We are investigating issues with our AI processing infrastructure. Document uploads and vault access are unaffected.',
    },
  },
  // 36. Preferences Updated
  {
    template: 'preferences_updated',
    data: {
      userName: 'Alex Johnson',
      changes: [
        { setting: 'Document Alerts', oldValue: 'On', newValue: 'Off' },
        { setting: 'Engagement Digests', oldValue: 'On', newValue: 'Off' },
      ],
      timestamp: new Date().toISOString(),
    },
  },
  // 37. Profile Updated
  {
    template: 'profile_updated',
    data: {
      userName: 'Alex Johnson',
      changes: [
        { field: 'Display Name', newValue: 'Alexander Johnson' },
        { field: 'Bio', newValue: 'Software engineer and document organization enthusiast' },
      ],
      timestamp: new Date().toISOString(),
    },
  },
  // 38. Suspicious Login
  {
    template: 'suspicious_login',
    data: {
      userName: 'Alex Johnson',
      email: TO,
      ipAddress: '198.51.100.77',
      location: 'Lagos, Nigeria',
      device: 'Unknown Device (Firefox)',
      reason: 'Login from a new country that doesn\'t match your usual location (United States).',
      timestamp: new Date().toISOString(),
    },
  },
];

async function main() {
  console.log(`\n📧 Sending all ${allTemplates.length} email templates to ${TO}\n`);
  console.log('─'.repeat(60));

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < allTemplates.length; i++) {
    const { template, data } = allTemplates[i];
    const label = `[${String(i + 1).padStart(2, '0')}/${allTemplates.length}] ${template}`;

    try {
      const result = await sendDirectEmail(TO, template, data);

      if (result.sent) {
        console.log(`  ✅ ${label} — sent`);
        sent++;
      } else {
        console.log(`  ❌ ${label} — ${result.reason}`);
        failed++;
      }
    } catch (err: any) {
      console.log(`  ❌ ${label} — ${err.message}`);
      failed++;
    }

    // Small delay between sends to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('─'.repeat(60));
  console.log(`\n📊 Results: ${sent} sent, ${failed} failed (${allTemplates.length} total)`);
  console.log(`📬 Check inbox at ${TO}\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
