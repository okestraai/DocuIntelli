/**
 * Engagement Engine - Core computation services
 *
 * Provides deterministic, compute-on-read functions for:
 * - Document Health State computation
 * - Preparedness Index scoring
 * - Gap Detection (rule-based)
 * - Time-based Insight generation
 * - Review Cadence management
 * - Weekly Audit data compilation
 */

// ============================================================================
// Types
// ============================================================================

export type HealthState = 'healthy' | 'watch' | 'risk' | 'critical';

export interface DocumentForHealth {
  id: string;
  user_id: string;
  name: string;
  category: string;
  type: string;
  tags: string[] | null;
  expiration_date: string | null;
  upload_date: string;
  last_reviewed_at: string | null;
  review_cadence_days: number | null;
  issuer: string | null;
  owner_name: string | null;
  effective_date: string | null;
  status: string;
  processed: boolean;
  health_state: string | null;
  health_computed_at: string | null;
  insights_cache: any | null;
}

export interface HealthResult {
  state: HealthState;
  score: number; // 0-100, higher = healthier
  reasons: string[];
}

export interface PreparednessResult {
  score: number; // 0-100
  trend: 'up' | 'down' | 'stable';
  previousScore: number | null;
  factors: PreparednessFactors;
}

export interface PreparednessFactors {
  metadataCompleteness: number;     // 0-25 points
  expirationCoverage: number;       // 0-25 points
  reviewFreshness: number;          // 0-25 points
  healthDistribution: number;       // 0-25 points
  details: {
    docsWithExpiration: number;
    docsWithTags: number;
    docsWithCategory: number;
    docsReviewedRecently: number;
    docsHealthy: number;
    docsWatch: number;
    docsRisk: number;
    docsCritical: number;
    totalDocs: number;
  };
}

export interface GapSuggestion {
  key: string;
  label: string;
  description: string;
  sourceCategory: string;
  priority: 'high' | 'medium' | 'low';
}

export interface DocumentInsight {
  type: 'expiration_warning' | 'review_due' | 'metadata_incomplete' | 'cancellation_window' | 'renewal_approaching' | 'renewal_suggestion' | 'general';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  actionLabel?: string;
  actionType?: string;
}

export interface TodayFeedItem {
  type: 'health_change' | 'risk' | 'action' | 'gap';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  documentId?: string;
  documentName?: string;
  actionType?: string;
  gapKey?: string;
}

export interface WeeklyAuditData {
  missingExpirations: DocumentForHealth[];
  missingReviewCadence: DocumentForHealth[];
  nearingExpiration: DocumentForHealth[];
  incompleteMetadata: DocumentForHealth[];
  gapSuggestions: GapSuggestion[];
  healthSummary: { healthy: number; watch: number; risk: number; critical: number };
  preparedness: PreparednessResult;
}

// ============================================================================
// 1. Document Health Computation
// ============================================================================

/**
 * Compute health state for a single document.
 * Pure function - no side effects, no DB calls.
 */
export function computeDocumentHealth(doc: DocumentForHealth, now: Date = new Date()): HealthResult {
  const reasons: string[] = [];
  let score = 100;

  // --- Expiration proximity ---
  if (doc.expiration_date) {
    const expDate = new Date(doc.expiration_date);
    const daysUntilExp = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExp < 0) {
      score -= 50;
      reasons.push(`Expired ${Math.abs(daysUntilExp)} days ago`);
    } else if (daysUntilExp <= 7) {
      score -= 40;
      reasons.push(`Expires in ${daysUntilExp} days`);
    } else if (daysUntilExp <= 30) {
      score -= 25;
      reasons.push(`Expires in ${daysUntilExp} days`);
    } else if (daysUntilExp <= 90) {
      score -= 10;
      reasons.push(`Expires in ${daysUntilExp} days`);
    }
  }

  // --- Review cadence check ---
  if (doc.review_cadence_days) {
    const lastReview = doc.last_reviewed_at ? new Date(doc.last_reviewed_at) : new Date(doc.upload_date);
    const daysSinceReview = Math.ceil((now.getTime() - lastReview.getTime()) / (1000 * 60 * 60 * 24));
    const overdueBy = daysSinceReview - doc.review_cadence_days;

    if (overdueBy > 60) {
      score -= 30;
      reasons.push(`Review overdue by ${overdueBy} days`);
    } else if (overdueBy > 0) {
      score -= 15;
      reasons.push(`Review overdue by ${overdueBy} days`);
    } else if (doc.review_cadence_days - daysSinceReview <= 14) {
      score -= 5;
      reasons.push(`Review due in ${doc.review_cadence_days - daysSinceReview} days`);
    }
  } else if (!doc.expiration_date) {
    // No expiration and no cadence - needs attention
    const uploadDate = new Date(doc.upload_date);
    const daysSinceUpload = Math.ceil((now.getTime() - uploadDate.getTime()) / (1000 * 60 * 60 * 24));
    const lastReview = doc.last_reviewed_at ? new Date(doc.last_reviewed_at) : null;
    const daysSinceLastAction = lastReview
      ? Math.ceil((now.getTime() - lastReview.getTime()) / (1000 * 60 * 60 * 24))
      : daysSinceUpload;

    if (daysSinceLastAction > 365) {
      score -= 20;
      reasons.push('Not reviewed in over a year');
    } else if (daysSinceLastAction > 180) {
      score -= 10;
      reasons.push('Not reviewed in over 6 months');
    }
  }

  // --- Metadata completeness ---
  const metadataIssues: string[] = [];
  if (!doc.tags || doc.tags.length === 0) metadataIssues.push('tags');
  if (!doc.expiration_date && !doc.review_cadence_days) metadataIssues.push('expiration date or review cadence');
  if (!doc.issuer) metadataIssues.push('issuer');
  if (!doc.owner_name) metadataIssues.push('owner');

  if (metadataIssues.length >= 3) {
    score -= 15;
    reasons.push(`Missing metadata: ${metadataIssues.join(', ')}`);
  } else if (metadataIssues.length > 0) {
    score -= 5 * metadataIssues.length;
    reasons.push(`Missing: ${metadataIssues.join(', ')}`);
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine state
  let state: HealthState;
  if (score >= 75) state = 'healthy';
  else if (score >= 50) state = 'watch';
  else if (score >= 25) state = 'risk';
  else state = 'critical';

  return { state, score, reasons };
}

/**
 * Compute health for all documents of a user.
 */
export function computeAllDocumentHealth(docs: DocumentForHealth[], now: Date = new Date()): Map<string, HealthResult> {
  const results = new Map<string, HealthResult>();
  for (const doc of docs) {
    results.set(doc.id, computeDocumentHealth(doc, now));
  }
  return results;
}

// ============================================================================
// 2. Preparedness Index
// ============================================================================

/**
 * Compute user-level preparedness score (0-100).
 */
export function computePreparedness(
  docs: DocumentForHealth[],
  healthMap: Map<string, HealthResult>,
  previousScore: number | null = null,
  now: Date = new Date()
): PreparednessResult {
  if (docs.length === 0) {
    return {
      score: 0,
      trend: 'stable',
      previousScore,
      factors: {
        metadataCompleteness: 0,
        expirationCoverage: 0,
        reviewFreshness: 0,
        healthDistribution: 0,
        details: {
          docsWithExpiration: 0, docsWithTags: 0, docsWithCategory: 0,
          docsReviewedRecently: 0, docsHealthy: 0, docsWatch: 0,
          docsRisk: 0, docsCritical: 0, totalDocs: 0
        }
      }
    };
  }

  const total = docs.length;

  // Factor 1: Metadata Completeness (0-25)
  const docsWithExpiration = docs.filter(d => d.expiration_date).length;
  const docsWithTags = docs.filter(d => d.tags && d.tags.length > 0).length;
  const docsWithCategory = docs.filter(d => d.category && d.category !== 'other').length;
  const docsWithIssuer = docs.filter(d => d.issuer).length;

  const metadataScore = (
    (docsWithExpiration / total) * 0.35 +
    (docsWithTags / total) * 0.25 +
    (docsWithCategory / total) * 0.2 +
    (docsWithIssuer / total) * 0.2
  ) * 25;

  // Factor 2: Expiration Coverage (0-25)
  const criticalDocs = docs.filter(d => {
    if (!d.expiration_date) return false;
    const category = d.category;
    return ['insurance', 'lease', 'contract'].includes(category);
  });
  const criticalWithExpiration = criticalDocs.filter(d => d.expiration_date).length;
  const criticalTotal = criticalDocs.length;

  const expirationScore = criticalTotal > 0
    ? (criticalWithExpiration / criticalTotal) * 15 + (docsWithExpiration / total) * 10
    : (docsWithExpiration / total) * 25;

  // Factor 3: Review Freshness (0-25)
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const docsReviewedRecently = docs.filter(d => {
    if (d.last_reviewed_at) return new Date(d.last_reviewed_at) >= sixMonthsAgo;
    return new Date(d.upload_date) >= sixMonthsAgo;
  }).length;

  const reviewScore = (docsReviewedRecently / total) * 25;

  // Factor 4: Health Distribution (0-25)
  let docsHealthy = 0, docsWatch = 0, docsRisk = 0, docsCritical = 0;
  for (const doc of docs) {
    const health = healthMap.get(doc.id);
    if (!health) continue;
    switch (health.state) {
      case 'healthy': docsHealthy++; break;
      case 'watch': docsWatch++; break;
      case 'risk': docsRisk++; break;
      case 'critical': docsCritical++; break;
    }
  }

  const healthScore = (
    (docsHealthy / total) * 25 +
    (docsWatch / total) * 15 +
    (docsRisk / total) * 5
    // critical contributes 0
  );

  const score = Math.round(Math.max(0, Math.min(100,
    metadataScore + expirationScore + reviewScore + healthScore
  )));

  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (previousScore !== null) {
    if (score > previousScore + 2) trend = 'up';
    else if (score < previousScore - 2) trend = 'down';
  }

  return {
    score,
    trend,
    previousScore,
    factors: {
      metadataCompleteness: Math.round(metadataScore),
      expirationCoverage: Math.round(expirationScore),
      reviewFreshness: Math.round(reviewScore),
      healthDistribution: Math.round(healthScore),
      details: {
        docsWithExpiration, docsWithTags, docsWithCategory,
        docsReviewedRecently, docsHealthy, docsWatch,
        docsRisk, docsCritical, totalDocs: total
      }
    }
  };
}

// ============================================================================
// 3. Gap Detection (Rule-based, extensible config)
// ============================================================================

interface GapRule {
  triggerCategories: string[];
  triggerTags?: string[];
  suggestions: {
    key: string;
    label: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
  }[];
}

/**
 * Gap detection rules configuration.
 * Extensible: add new rules here without modifying logic.
 */
const GAP_RULES: GapRule[] = [
  {
    triggerCategories: ['insurance'],
    triggerTags: ['auto', 'car', 'vehicle'],
    suggestions: [
      { key: 'vehicle_registration', label: 'Vehicle Registration', description: 'Pair your car insurance with your vehicle registration for complete coverage tracking', priority: 'high' },
      { key: 'vehicle_title', label: 'Vehicle Title', description: 'Keep your vehicle title on file alongside insurance documentation', priority: 'medium' },
      { key: 'maintenance_records', label: 'Maintenance Records', description: 'Track maintenance history for warranty claims and resale value', priority: 'low' },
    ]
  },
  {
    triggerCategories: ['insurance'],
    triggerTags: ['home', 'property', 'homeowner', 'renter'],
    suggestions: [
      { key: 'property_deed', label: 'Property Deed', description: 'Store your property deed alongside your home insurance for complete records', priority: 'high' },
      { key: 'home_inventory', label: 'Home Inventory', description: 'Create a home inventory document for insurance claim purposes', priority: 'medium' },
    ]
  },
  {
    triggerCategories: ['insurance'],
    triggerTags: ['health', 'medical'],
    suggestions: [
      { key: 'medical_records', label: 'Medical Records', description: 'Keep medical records alongside your health insurance for easy reference', priority: 'medium' },
      { key: 'prescription_list', label: 'Prescription List', description: 'Maintain an up-to-date prescription list with your health coverage', priority: 'low' },
    ]
  },
  {
    triggerCategories: ['insurance'],
    suggestions: [
      { key: 'insurance_declarations', label: 'Insurance Declarations Page', description: 'Upload your declarations page for quick reference to coverage limits', priority: 'medium' },
    ]
  },
  {
    triggerCategories: ['lease'],
    suggestions: [
      { key: 'lease_addendum', label: 'Lease Addendum/Amendments', description: 'Keep all lease modifications together with the original lease', priority: 'high' },
      { key: 'move_in_checklist', label: 'Move-in Condition Report', description: 'Document condition at move-in to protect your security deposit', priority: 'medium' },
      { key: 'renter_insurance', label: "Renter's Insurance", description: "Most leases require renter's insurance - keep it on file", priority: 'high' },
    ]
  },
  {
    triggerCategories: ['employment'],
    suggestions: [
      { key: 'offer_letter', label: 'Offer Letter', description: 'Keep your offer letter for reference on compensation and benefits', priority: 'medium' },
      { key: 'benefits_summary', label: 'Benefits Summary', description: 'Store your benefits enrollment documentation', priority: 'medium' },
      { key: 'tax_w2', label: 'W-2 / Tax Forms', description: 'Keep annual tax documents organized with employment records', priority: 'high' },
      { key: 'nda_agreement', label: 'NDA / Non-Compete', description: 'Track any restrictive agreements alongside employment docs', priority: 'medium' },
    ]
  },
  {
    triggerCategories: ['contract'],
    suggestions: [
      { key: 'contract_amendment', label: 'Contract Amendments', description: 'Keep all contract modifications with the original agreement', priority: 'high' },
      { key: 'statement_of_work', label: 'Statement of Work', description: 'Store SOW documents alongside the master contract', priority: 'medium' },
    ]
  },
  {
    triggerCategories: ['warranty'],
    suggestions: [
      { key: 'purchase_receipt', label: 'Purchase Receipt', description: 'Keep the original purchase receipt for warranty claims', priority: 'high' },
      { key: 'product_manual', label: 'Product Manual', description: 'Store the product manual for troubleshooting and maintenance', priority: 'low' },
    ]
  },
];

/**
 * Detect missing documents based on what the user has uploaded.
 */
export function detectGaps(
  docs: DocumentForHealth[],
  dismissedKeys: Set<string>
): GapSuggestion[] {
  const suggestions: GapSuggestion[] = [];
  const seenKeys = new Set<string>();

  // Collect all categories and tags present
  const userCategories = new Set(docs.map(d => d.category));
  const userTags = new Set(docs.flatMap(d => (d.tags || []).map(t => t.toLowerCase())));

  for (const rule of GAP_RULES) {
    // Check if user has docs matching trigger categories
    const categoryMatch = rule.triggerCategories.some(c => userCategories.has(c));
    if (!categoryMatch) continue;

    // If rule has trigger tags, check at least one matches
    if (rule.triggerTags && rule.triggerTags.length > 0) {
      const tagMatch = rule.triggerTags.some(t => userTags.has(t));
      if (!tagMatch) continue;
    }

    // Add suggestions that aren't dismissed or already suggested
    for (const suggestion of rule.suggestions) {
      if (seenKeys.has(suggestion.key)) continue;
      if (dismissedKeys.has(suggestion.key)) continue;
      seenKeys.add(suggestion.key);
      suggestions.push({
        ...suggestion,
        sourceCategory: rule.triggerCategories[0],
      });
    }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions;
}

// ============================================================================
// 4. Review Cadence Suggestions
// ============================================================================

/**
 * Suggest default review cadence (in days) based on document category.
 */
export function suggestReviewCadence(category: string): number {
  const cadenceMap: Record<string, number> = {
    insurance: 365,    // Annual
    warranty: 365,     // Annual
    lease: 180,        // Every 6 months
    employment: 365,   // Annual
    contract: 180,     // Every 6 months
    other: 365,        // Default annual
  };
  return cadenceMap[category] || 365;
}

/**
 * Calculate next review due date.
 */
export function getNextReviewDate(doc: DocumentForHealth): Date | null {
  if (!doc.review_cadence_days) return null;

  const lastAction = doc.last_reviewed_at
    ? new Date(doc.last_reviewed_at)
    : new Date(doc.upload_date);

  return new Date(lastAction.getTime() + doc.review_cadence_days * 24 * 60 * 60 * 1000);
}

// ============================================================================
// 5. Time-Based Document Insights (Deterministic)
// ============================================================================

/**
 * Generate deterministic insights for a document based on current time.
 */
export function generateDocumentInsights(doc: DocumentForHealth, now: Date = new Date()): DocumentInsight[] {
  const insights: DocumentInsight[] = [];

  // Expiration insights
  if (doc.expiration_date) {
    const expDate = new Date(doc.expiration_date);
    const daysUntil = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) {
      insights.push({
        type: 'expiration_warning',
        title: 'Document Expired',
        description: `This document expired ${Math.abs(daysUntil)} days ago. You may need to renew it.`,
        severity: 'critical',
        actionLabel: 'Update Expiration',
        actionType: 'update_metadata',
      });
      insights.push({
        type: 'renewal_suggestion',
        title: 'Upload Renewed Document',
        description: 'If you have a renewed version, upload it to keep your vault current.',
        severity: 'info',
        actionLabel: 'Upload Renewal',
        actionType: 'upload_renewal',
      });
    } else if (daysUntil <= 14) {
      insights.push({
        type: 'expiration_warning',
        title: 'Expiring Very Soon',
        description: `This document expires in ${daysUntil} days. Take action now to avoid a lapse in coverage.`,
        severity: 'critical',
        actionLabel: 'Update Expiration',
        actionType: 'update_metadata',
      });
      insights.push({
        type: 'renewal_suggestion',
        title: 'Upload Renewed Document',
        description: 'If your renewal is ready, upload it now.',
        severity: 'info',
        actionLabel: 'Upload Renewal',
        actionType: 'upload_renewal',
      });
    } else if (daysUntil <= 30) {
      insights.push({
        type: 'renewal_approaching',
        title: 'Renewal Window',
        description: `This document expires in ${daysUntil} days. Now is a good time to review renewal options.`,
        severity: 'warning',
        actionLabel: 'Chat with Document',
        actionType: 'chat',
      });

      // Cancellation window hint for contracts/leases
      if (['contract', 'lease'].includes(doc.category)) {
        insights.push({
          type: 'cancellation_window',
          title: 'Review Cancellation Terms',
          description: 'If you plan to cancel or not renew, check for required notice periods.',
          severity: 'warning',
          actionLabel: 'Chat with Document',
          actionType: 'chat',
        });
      }
    } else if (daysUntil <= 90) {
      insights.push({
        type: 'renewal_approaching',
        title: 'Upcoming Renewal',
        description: `This document expires in ${daysUntil} days. Consider reviewing terms before renewal.`,
        severity: 'info',
      });
    }
  }

  // Review cadence insights
  if (doc.review_cadence_days) {
    const nextReview = getNextReviewDate(doc);
    if (nextReview) {
      const daysUntilReview = Math.ceil((nextReview.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilReview < 0) {
        insights.push({
          type: 'review_due',
          title: 'Review Overdue',
          description: `This document was due for review ${Math.abs(daysUntilReview)} days ago. Update details or chat to verify it's current.`,
          severity: 'warning',
          actionLabel: 'Update Details',
          actionType: 'update_metadata',
        });
      } else if (daysUntilReview <= 14) {
        insights.push({
          type: 'review_due',
          title: 'Review Due Soon',
          description: `Scheduled review is due in ${daysUntilReview} days. Update details or chat to verify it's current.`,
          severity: 'info',
          actionLabel: 'Update Details',
          actionType: 'update_metadata',
        });
      }
    }
  }

  // Metadata completeness insights
  const missing: string[] = [];
  if (!doc.tags || doc.tags.length === 0) missing.push('tags');
  if (!doc.issuer) missing.push('issuer');
  if (!doc.owner_name) missing.push('owner');
  if (!doc.expiration_date && !doc.review_cadence_days) missing.push('expiration date or review cadence');

  if (missing.length > 0) {
    insights.push({
      type: 'metadata_incomplete',
      title: 'Incomplete Information',
      description: `Missing: ${missing.join(', ')}. Complete metadata improves your preparedness score.`,
      severity: missing.length >= 3 ? 'warning' : 'info',
      actionLabel: 'Add Details',
      actionType: 'update_metadata',
    });
  }

  return insights;
}

// ============================================================================
// 6. Today Feed Generation
// ============================================================================

/**
 * Generate the Today Feed items for a user.
 */
export function generateTodayFeed(
  docs: DocumentForHealth[],
  healthMap: Map<string, HealthResult>,
  gapSuggestions: GapSuggestion[],
  now: Date = new Date()
): TodayFeedItem[] {
  const items: TodayFeedItem[] = [];

  // Top risks: closest expirations, overdue reviews, critical health
  const criticalDocs = docs
    .filter(d => healthMap.get(d.id)?.state === 'critical')
    .slice(0, 3);

  const riskDocs = docs
    .filter(d => healthMap.get(d.id)?.state === 'risk')
    .slice(0, 3);

  for (const doc of criticalDocs) {
    const health = healthMap.get(doc.id)!;
    items.push({
      type: 'risk',
      title: 'Critical Attention Needed',
      description: health.reasons[0] || 'This document needs immediate attention',
      severity: 'critical',
      documentId: doc.id,
      documentName: doc.name,
    });
  }

  for (const doc of riskDocs) {
    const health = healthMap.get(doc.id)!;
    if (items.length >= 5) break;
    items.push({
      type: 'risk',
      title: 'At Risk',
      description: health.reasons[0] || 'This document needs attention',
      severity: 'warning',
      documentId: doc.id,
      documentName: doc.name,
    });
  }

  // Suggested actions (micro-actions)
  const unreviewedDocs = docs
    .filter(d => {
      if (!d.review_cadence_days) return false;
      const nextReview = getNextReviewDate(d);
      return nextReview && nextReview <= now;
    })
    .slice(0, 3);

  for (const doc of unreviewedDocs) {
    if (items.length >= 8) break;
    items.push({
      type: 'action',
      title: 'Review Due',
      description: `"${doc.name}" is due for review. Update its details to confirm it's current.`,
      severity: 'info',
      documentId: doc.id,
      documentName: doc.name,
      actionType: 'update_metadata',
    });
  }

  // Docs missing metadata
  const incompleteDocs = docs
    .filter(d => (!d.tags || d.tags.length === 0) && !d.issuer)
    .slice(0, 2);

  for (const doc of incompleteDocs) {
    if (items.length >= 10) break;
    items.push({
      type: 'action',
      title: 'Add Missing Details',
      description: `"${doc.name}" is missing tags and issuer information.`,
      severity: 'info',
      documentId: doc.id,
      documentName: doc.name,
      actionType: 'update_metadata',
    });
  }

  // Gap suggestions (1-2)
  for (const gap of gapSuggestions.slice(0, 2)) {
    if (items.length >= 12) break;
    items.push({
      type: 'gap',
      title: `Suggested: ${gap.label}`,
      description: gap.description,
      severity: 'info',
      gapKey: gap.key,
    });
  }

  return items;
}

// ============================================================================
// 7. Weekly Audit Compilation
// ============================================================================

/**
 * Compile weekly audit data for a user.
 */
export function compileWeeklyAudit(
  docs: DocumentForHealth[],
  healthMap: Map<string, HealthResult>,
  gapSuggestions: GapSuggestion[],
  preparedness: PreparednessResult,
  now: Date = new Date()
): WeeklyAuditData {
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    missingExpirations: docs.filter(d => !d.expiration_date && ['insurance', 'lease', 'contract', 'warranty'].includes(d.category)),
    missingReviewCadence: docs.filter(d => !d.review_cadence_days && !d.expiration_date),
    nearingExpiration: docs.filter(d => {
      if (!d.expiration_date) return false;
      const exp = new Date(d.expiration_date);
      return exp <= thirtyDays && exp >= now;
    }).sort((a, b) => new Date(a.expiration_date!).getTime() - new Date(b.expiration_date!).getTime()),
    incompleteMetadata: docs.filter(d => {
      const missing = [
        !d.tags || d.tags.length === 0,
        !d.issuer,
        !d.owner_name,
        !d.expiration_date && !d.review_cadence_days,
      ].filter(Boolean).length;
      return missing >= 2;
    }),
    gapSuggestions,
    healthSummary: {
      healthy: docs.filter(d => healthMap.get(d.id)?.state === 'healthy').length,
      watch: docs.filter(d => healthMap.get(d.id)?.state === 'watch').length,
      risk: docs.filter(d => healthMap.get(d.id)?.state === 'risk').length,
      critical: docs.filter(d => healthMap.get(d.id)?.state === 'critical').length,
    },
    preparedness,
  };
}
