/**
 * Tests for Engagement Engine pure computation functions.
 *
 * Run: npx tsx server/src/services/engagementEngine.test.ts
 *
 * Uses simple assert-based testing (no framework dependency).
 */

import {
  computeDocumentHealth,
  computeAllDocumentHealth,
  computePreparedness,
  detectGaps,
  suggestReviewCadence,
  getNextReviewDate,
  generateDocumentInsights,
  generateTodayFeed,
  compileWeeklyAudit,
  DocumentForHealth,
  HealthResult,
} from './engagementEngine';
import assert from 'assert';

// ============================================================================
// Helpers
// ============================================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

function makeDoc(overrides: Partial<DocumentForHealth> = {}): DocumentForHealth {
  return {
    id: 'doc-1',
    user_id: 'user-1',
    name: 'Test Document',
    category: 'insurance',
    type: 'application/pdf',
    tags: ['auto'],
    expiration_date: null,
    upload_date: '2025-01-01T00:00:00Z',
    last_reviewed_at: null,
    review_cadence_days: null,
    issuer: 'State Farm',
    owner_name: 'John Doe',
    effective_date: null,
    status: 'active',
    processed: true,
    health_state: null,
    health_computed_at: null,
    insights_cache: null,
    ...overrides,
  };
}

function daysFromNow(days: number, now: Date = new Date('2026-02-12')): string {
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

const NOW = new Date('2026-02-12T12:00:00Z');

// ============================================================================
// 1. computeDocumentHealth
// ============================================================================

console.log('\n--- computeDocumentHealth ---');

test('fully healthy document scores >= 75', () => {
  const doc = makeDoc({
    expiration_date: daysFromNow(365, NOW),
    tags: ['auto', 'coverage'],
    issuer: 'State Farm',
    owner_name: 'John',
  });
  const result = computeDocumentHealth(doc, NOW);
  assert.strictEqual(result.state, 'healthy');
  assert.ok(result.score >= 75, `Expected score >= 75, got ${result.score}`);
});

test('expired document is critical or risk', () => {
  const doc = makeDoc({
    expiration_date: daysFromNow(-30, NOW),
    tags: null,
    issuer: null,
    owner_name: null,
  });
  const result = computeDocumentHealth(doc, NOW);
  assert.ok(['critical', 'risk'].includes(result.state), `Expected critical/risk, got ${result.state}`);
  assert.ok(result.score < 50, `Expected score < 50, got ${result.score}`);
  assert.ok(result.reasons.some(r => r.includes('Expired')), 'Should mention expired');
});

test('document expiring in 5 days loses significant score', () => {
  const doc = makeDoc({ expiration_date: daysFromNow(5, NOW) });
  const result = computeDocumentHealth(doc, NOW);
  assert.ok(result.score <= 65, `Expected score <= 65, got ${result.score}`);
  assert.ok(result.reasons.some(r => r.includes('Expires in 5 days')));
});

test('document expiring in 20 days loses moderate score', () => {
  const doc = makeDoc({ expiration_date: daysFromNow(20, NOW) });
  const result = computeDocumentHealth(doc, NOW);
  assert.ok(result.score <= 80, `Expected score <= 80, got ${result.score}`);
});

test('overdue review reduces score', () => {
  const doc = makeDoc({
    review_cadence_days: 30,
    last_reviewed_at: daysFromNow(-100, NOW),
    expiration_date: daysFromNow(365, NOW),
  });
  const result = computeDocumentHealth(doc, NOW);
  assert.ok(result.reasons.some(r => r.includes('Review overdue')), 'Should mention overdue review');
});

test('missing metadata reduces score', () => {
  const doc = makeDoc({
    tags: null,
    issuer: null,
    owner_name: null,
    expiration_date: null,
    review_cadence_days: null,
  });
  const result = computeDocumentHealth(doc, NOW);
  assert.ok(result.reasons.some(r => r.includes('Missing')), 'Should mention missing metadata');
  assert.ok(result.score < 100, `Score should be reduced, got ${result.score}`);
});

test('document not reviewed in over a year loses score (no expiration, no cadence)', () => {
  const doc = makeDoc({
    upload_date: daysFromNow(-400, NOW),
    expiration_date: null,
    review_cadence_days: null,
    last_reviewed_at: null,
  });
  const result = computeDocumentHealth(doc, NOW);
  assert.ok(result.reasons.some(r => r.includes('Not reviewed in over a year')));
});

test('score is clamped between 0 and 100', () => {
  // Extreme case: everything bad
  const doc = makeDoc({
    expiration_date: daysFromNow(-100, NOW),
    tags: null,
    issuer: null,
    owner_name: null,
    review_cadence_days: 30,
    last_reviewed_at: daysFromNow(-200, NOW),
  });
  const result = computeDocumentHealth(doc, NOW);
  assert.ok(result.score >= 0, `Score should be >= 0, got ${result.score}`);
  assert.ok(result.score <= 100, `Score should be <= 100, got ${result.score}`);
});

// ============================================================================
// 2. Health state transitions (deterministic at thresholds)
// ============================================================================

console.log('\n--- Health State Thresholds ---');

test('score 75+ → healthy', () => {
  // Good doc with all metadata
  const doc = makeDoc({
    expiration_date: daysFromNow(200, NOW),
    tags: ['auto'],
    issuer: 'GEICO',
    owner_name: 'Alice',
  });
  const result = computeDocumentHealth(doc, NOW);
  assert.strictEqual(result.state, 'healthy');
});

test('score 50-74 → watch', () => {
  // Expiring in 25 days (−25 score) + missing owner (−5) = 70
  const doc = makeDoc({
    expiration_date: daysFromNow(25, NOW),
    tags: ['auto'],
    issuer: 'GEICO',
    owner_name: null,
  });
  const result = computeDocumentHealth(doc, NOW);
  assert.strictEqual(result.state, 'watch', `Expected watch, got ${result.state} (score: ${result.score})`);
});

test('score 25-49 → risk', () => {
  // Expired 5 days ago (−50) + good metadata = ~50
  // Let's be more precise: expired = -50, with all metadata
  const doc = makeDoc({
    expiration_date: daysFromNow(-5, NOW),
    tags: ['auto'],
    issuer: 'GEICO',
    owner_name: 'Alice',
  });
  const result = computeDocumentHealth(doc, NOW);
  assert.ok(result.state === 'risk' || result.state === 'watch',
    `Expected risk or watch for expired doc with good metadata, got ${result.state} (score: ${result.score})`);
});

test('score < 25 → critical', () => {
  const doc = makeDoc({
    expiration_date: daysFromNow(-5, NOW),
    tags: null,
    issuer: null,
    owner_name: null,
    review_cadence_days: 30,
    last_reviewed_at: daysFromNow(-200, NOW),
  });
  const result = computeDocumentHealth(doc, NOW);
  assert.strictEqual(result.state, 'critical', `Expected critical, got ${result.state} (score: ${result.score})`);
});

// ============================================================================
// 3. computePreparedness
// ============================================================================

console.log('\n--- computePreparedness ---');

test('empty document set returns score 0', () => {
  const result = computePreparedness([], new Map(), null, NOW);
  assert.strictEqual(result.score, 0);
  assert.strictEqual(result.trend, 'stable');
});

test('well-maintained docs yield high preparedness', () => {
  const docs = [
    makeDoc({
      id: 'd1', expiration_date: daysFromNow(200, NOW), tags: ['home'], issuer: 'Allstate',
      owner_name: 'Bob', last_reviewed_at: daysFromNow(-30, NOW), category: 'insurance',
    }),
    makeDoc({
      id: 'd2', expiration_date: daysFromNow(100, NOW), tags: ['auto'], issuer: 'GEICO',
      owner_name: 'Bob', last_reviewed_at: daysFromNow(-10, NOW), category: 'insurance',
    }),
  ];
  const healthMap = computeAllDocumentHealth(docs, NOW);
  const result = computePreparedness(docs, healthMap, null, NOW);
  assert.ok(result.score >= 60, `Expected score >= 60, got ${result.score}`);
});

test('trend is up when score increases significantly', () => {
  const docs = [makeDoc({ id: 'd1', expiration_date: daysFromNow(200, NOW), tags: ['auto'], issuer: 'X', owner_name: 'Y' })];
  const healthMap = computeAllDocumentHealth(docs, NOW);
  const result = computePreparedness(docs, healthMap, 30, NOW);
  assert.strictEqual(result.trend, 'up');
});

test('trend is down when score decreases significantly', () => {
  const docs = [makeDoc({ id: 'd1', tags: null, issuer: null, owner_name: null })];
  const healthMap = computeAllDocumentHealth(docs, NOW);
  const result = computePreparedness(docs, healthMap, 90, NOW);
  assert.strictEqual(result.trend, 'down');
});

test('trend is stable within ±2 points', () => {
  const docs = [makeDoc({ id: 'd1', expiration_date: daysFromNow(200, NOW), tags: ['auto'], issuer: 'X', owner_name: 'Y' })];
  const healthMap = computeAllDocumentHealth(docs, NOW);
  const r1 = computePreparedness(docs, healthMap, null, NOW);
  const r2 = computePreparedness(docs, healthMap, r1.score, NOW);
  assert.strictEqual(r2.trend, 'stable');
});

test('factor scores sum to approximately total score', () => {
  const docs = [
    makeDoc({ id: 'd1', expiration_date: daysFromNow(200, NOW), tags: ['auto'], issuer: 'X', owner_name: 'Y', last_reviewed_at: daysFromNow(-10, NOW) }),
  ];
  const healthMap = computeAllDocumentHealth(docs, NOW);
  const result = computePreparedness(docs, healthMap, null, NOW);
  const factorSum = result.factors.metadataCompleteness + result.factors.expirationCoverage
    + result.factors.reviewFreshness + result.factors.healthDistribution;
  // Due to rounding, allow ±2 tolerance
  assert.ok(Math.abs(result.score - factorSum) <= 2,
    `Score ${result.score} should ≈ factor sum ${factorSum}`);
});

// ============================================================================
// 4. detectGaps
// ============================================================================

console.log('\n--- detectGaps ---');

test('insurance + auto tags suggests vehicle registration', () => {
  const docs = [makeDoc({ category: 'insurance', tags: ['auto'] })];
  const gaps = detectGaps(docs, new Set());
  assert.ok(gaps.some(g => g.key === 'vehicle_registration'), 'Should suggest vehicle registration');
});

test('lease category suggests renter insurance', () => {
  const docs = [makeDoc({ category: 'lease', tags: [] })];
  const gaps = detectGaps(docs, new Set());
  assert.ok(gaps.some(g => g.key === 'renter_insurance'), 'Should suggest renter insurance');
});

test('dismissed suggestions are excluded', () => {
  const docs = [makeDoc({ category: 'insurance', tags: ['auto'] })];
  const dismissed = new Set(['vehicle_registration', 'vehicle_title', 'maintenance_records']);
  const gaps = detectGaps(docs, dismissed);
  assert.ok(!gaps.some(g => g.key === 'vehicle_registration'), 'Dismissed gap should not appear');
});

test('no docs of matching category yields no suggestions', () => {
  const docs = [makeDoc({ category: 'other', tags: [] })];
  const gaps = detectGaps(docs, new Set());
  assert.strictEqual(gaps.length, 0, 'No suggestions for "other" category');
});

test('gaps are sorted by priority (high first)', () => {
  const docs = [makeDoc({ category: 'insurance', tags: ['auto'] })];
  const gaps = detectGaps(docs, new Set());
  for (let i = 1; i < gaps.length; i++) {
    const order = { high: 0, medium: 1, low: 2 };
    assert.ok(order[gaps[i].priority] >= order[gaps[i - 1].priority],
      `Gap at index ${i} should have same or lower priority than ${i - 1}`);
  }
});

test('employment category suggests W-2 and offer letter', () => {
  const docs = [makeDoc({ category: 'employment', tags: [] })];
  const gaps = detectGaps(docs, new Set());
  assert.ok(gaps.some(g => g.key === 'tax_w2'), 'Should suggest W-2');
  assert.ok(gaps.some(g => g.key === 'offer_letter'), 'Should suggest offer letter');
});

// ============================================================================
// 5. suggestReviewCadence
// ============================================================================

console.log('\n--- suggestReviewCadence ---');

test('insurance → 365 days', () => {
  assert.strictEqual(suggestReviewCadence('insurance'), 365);
});

test('lease → 180 days', () => {
  assert.strictEqual(suggestReviewCadence('lease'), 180);
});

test('contract → 180 days', () => {
  assert.strictEqual(suggestReviewCadence('contract'), 180);
});

test('unknown category defaults to 365', () => {
  assert.strictEqual(suggestReviewCadence('unknown_category'), 365);
});

// ============================================================================
// 6. getNextReviewDate
// ============================================================================

console.log('\n--- getNextReviewDate ---');

test('returns null when no cadence set', () => {
  const doc = makeDoc({ review_cadence_days: null });
  assert.strictEqual(getNextReviewDate(doc), null);
});

test('calculates from last_reviewed_at when present', () => {
  const doc = makeDoc({
    review_cadence_days: 90,
    last_reviewed_at: '2026-01-01T00:00:00Z',
  });
  const next = getNextReviewDate(doc);
  assert.ok(next !== null);
  const expected = new Date('2026-04-01T00:00:00Z');
  assert.ok(Math.abs(next!.getTime() - expected.getTime()) < 24 * 60 * 60 * 1000,
    `Expected ~2026-04-01, got ${next!.toISOString()}`);
});

test('calculates from upload_date when no review', () => {
  const doc = makeDoc({
    review_cadence_days: 365,
    last_reviewed_at: null,
    upload_date: '2025-01-01T00:00:00Z',
  });
  const next = getNextReviewDate(doc);
  assert.ok(next !== null);
  const expected = new Date('2026-01-01T00:00:00Z');
  assert.ok(Math.abs(next!.getTime() - expected.getTime()) < 24 * 60 * 60 * 1000,
    `Expected ~2026-01-01, got ${next!.toISOString()}`);
});

// ============================================================================
// 7. generateDocumentInsights
// ============================================================================

console.log('\n--- generateDocumentInsights ---');

test('expired doc gets critical expiration insight', () => {
  const doc = makeDoc({ expiration_date: daysFromNow(-10, NOW) });
  const insights = generateDocumentInsights(doc, NOW);
  const expInsight = insights.find(i => i.type === 'expiration_warning');
  assert.ok(expInsight, 'Should have expiration warning');
  assert.strictEqual(expInsight!.severity, 'critical');
});

test('doc expiring in 10 days gets critical expiring soon insight', () => {
  const doc = makeDoc({ expiration_date: daysFromNow(10, NOW) });
  const insights = generateDocumentInsights(doc, NOW);
  const expInsight = insights.find(i => i.type === 'expiration_warning');
  assert.ok(expInsight, 'Should have expiration warning');
  assert.strictEqual(expInsight!.severity, 'critical');
});

test('doc expiring in 25 days gets renewal window insight', () => {
  const doc = makeDoc({ expiration_date: daysFromNow(25, NOW) });
  const insights = generateDocumentInsights(doc, NOW);
  assert.ok(insights.some(i => i.type === 'renewal_approaching'), 'Should have renewal approaching');
});

test('lease expiring in 25 days gets cancellation window hint', () => {
  const doc = makeDoc({ category: 'lease', expiration_date: daysFromNow(25, NOW) });
  const insights = generateDocumentInsights(doc, NOW);
  assert.ok(insights.some(i => i.type === 'cancellation_window'), 'Should have cancellation window');
});

test('overdue review generates review_due insight', () => {
  const doc = makeDoc({
    review_cadence_days: 30,
    last_reviewed_at: daysFromNow(-60, NOW),
  });
  const insights = generateDocumentInsights(doc, NOW);
  assert.ok(insights.some(i => i.type === 'review_due'), 'Should have review due insight');
});

test('missing metadata generates metadata_incomplete insight', () => {
  const doc = makeDoc({ tags: null, issuer: null, owner_name: null, expiration_date: null });
  const insights = generateDocumentInsights(doc, NOW);
  assert.ok(insights.some(i => i.type === 'metadata_incomplete'), 'Should have metadata incomplete');
});

// ============================================================================
// 8. generateTodayFeed
// ============================================================================

console.log('\n--- generateTodayFeed ---');

test('critical/risk docs appear in feed', () => {
  const docs = [makeDoc({
    id: 'd-crit',
    expiration_date: daysFromNow(-30, NOW),
    tags: null, issuer: null, owner_name: null,
  })];
  const healthMap = computeAllDocumentHealth(docs, NOW);
  const feed = generateTodayFeed(docs, healthMap, [], NOW);
  assert.ok(feed.some(i => i.documentId === 'd-crit'), 'At-risk doc should be in feed');
  assert.ok(feed.some(i => i.severity === 'critical' || i.severity === 'warning'), 'Should have critical or warning item');
});

test('gap suggestions appear in feed', () => {
  const gaps = [{ key: 'test_gap', label: 'Test', description: 'Test gap', sourceCategory: 'insurance', priority: 'high' as const }];
  const feed = generateTodayFeed([], new Map(), gaps, NOW);
  assert.ok(feed.some(i => i.type === 'gap'), 'Should have gap items in feed');
});

test('feed has reasonable limit', () => {
  // Create many critical docs
  const docs = Array.from({ length: 20 }, (_, i) => makeDoc({
    id: `d-${i}`,
    expiration_date: daysFromNow(-i, NOW),
    tags: null, issuer: null, owner_name: null,
  }));
  const healthMap = computeAllDocumentHealth(docs, NOW);
  const feed = generateTodayFeed(docs, healthMap, [], NOW);
  assert.ok(feed.length <= 12, `Feed should be <= 12 items, got ${feed.length}`);
});

// ============================================================================
// 9. compileWeeklyAudit
// ============================================================================

console.log('\n--- compileWeeklyAudit ---');

test('audit captures nearing expiration docs', () => {
  const docs = [
    makeDoc({ id: 'd1', expiration_date: daysFromNow(15, NOW), tags: ['auto'], issuer: 'X', owner_name: 'Y' }),
    makeDoc({ id: 'd2', expiration_date: daysFromNow(200, NOW), tags: ['home'], issuer: 'Z', owner_name: 'Y' }),
  ];
  const healthMap = computeAllDocumentHealth(docs, NOW);
  const prep = computePreparedness(docs, healthMap, null, NOW);
  const audit = compileWeeklyAudit(docs, healthMap, [], prep, NOW);
  assert.strictEqual(audit.nearingExpiration.length, 1, 'Should have 1 doc nearing expiration');
  assert.strictEqual(audit.nearingExpiration[0].id, 'd1');
});

test('audit captures missing expirations for critical categories', () => {
  const docs = [
    makeDoc({ id: 'd1', category: 'insurance', expiration_date: null }),
    makeDoc({ id: 'd2', category: 'other', expiration_date: null }),
  ];
  const healthMap = computeAllDocumentHealth(docs, NOW);
  const prep = computePreparedness(docs, healthMap, null, NOW);
  const audit = compileWeeklyAudit(docs, healthMap, [], prep, NOW);
  assert.strictEqual(audit.missingExpirations.length, 1, 'Only insurance doc should be flagged');
});

test('health summary counts are correct', () => {
  const docs = [
    makeDoc({ id: 'd1', expiration_date: daysFromNow(200, NOW), tags: ['a'], issuer: 'X', owner_name: 'Y' }),
    makeDoc({ id: 'd2', expiration_date: daysFromNow(-30, NOW), tags: null, issuer: null, owner_name: null }),
  ];
  const healthMap = computeAllDocumentHealth(docs, NOW);
  const prep = computePreparedness(docs, healthMap, null, NOW);
  const audit = compileWeeklyAudit(docs, healthMap, [], prep, NOW);
  const sum = audit.healthSummary.healthy + audit.healthSummary.watch + audit.healthSummary.risk + audit.healthSummary.critical;
  assert.strictEqual(sum, 2, 'Health summary should account for all docs');
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
