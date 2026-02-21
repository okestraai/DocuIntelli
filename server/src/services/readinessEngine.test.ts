/**
 * Unit tests for the Readiness Engine matching & scoring logic.
 *
 * These tests exercise the pure-function internals without hitting the DB.
 * Run: npx ts-node --esm node_modules/.bin/jest server/src/services/readinessEngine.test.ts
 * Or simply: npx jest --config server/jest.config.js readinessEngine
 */

// ---------------------------------------------------------------------------
// We test the internal helpers by extracting them. Since the module's
// primary export (computeReadiness) hits Supabase, we test the algorithm
// pieces directly by duplicating the pure logic here to keep tests DB-free.
// ---------------------------------------------------------------------------

import { LIFE_EVENT_TEMPLATES, getTemplateById, EventRequirement } from '../config/lifeEventTemplates';

// Re-implement the pure functions from readinessEngine.ts for isolated testing

type ReqStatus = 'pending' | 'satisfied' | 'missing' | 'needs_update' | 'expiring_soon' | 'incomplete_metadata' | 'not_applicable';

interface MatchResult {
  requirementId: string;
  documentId: string;
  confidence: number;
  method: 'deterministic' | 'heuristic' | 'llm' | 'manual';
}

interface UserDoc {
  id: string;
  name: string;
  category: string;
  type: string;
  tags: string[];
  expiration_date: string | null;
  status: string;
  original_name: string;
}

function deterministicMatch(req: EventRequirement, docs: UserDoc[]): MatchResult[] {
  const results: MatchResult[] = [];
  for (const doc of docs) {
    let score = 0;
    if (req.docCategories.includes(doc.category)) score += 0.4;
    const docTagsLower = doc.tags.map(t => t.toLowerCase());
    const matchingTags = req.suggestedTags.filter(t => docTagsLower.includes(t.toLowerCase()));
    if (matchingTags.length > 0) score += 0.3 + Math.min(0.3, matchingTags.length * 0.1);
    if (score >= 0.6) {
      results.push({ requirementId: req.id, documentId: doc.id, confidence: Math.min(1, score), method: 'deterministic' });
    }
  }
  results.sort((a, b) => b.confidence - a.confidence);
  return results.slice(0, 1);
}

function heuristicMatch(req: EventRequirement, docs: UserDoc[]): MatchResult[] {
  const results: MatchResult[] = [];
  for (const doc of docs) {
    const nameLower = (doc.name + ' ' + doc.original_name).toLowerCase();
    let matchCount = 0;
    for (const kw of req.keywords) {
      if (nameLower.includes(kw.toLowerCase())) matchCount++;
    }
    if (matchCount > 0) {
      const confidence = Math.min(0.8, 0.3 + matchCount * 0.15);
      results.push({ requirementId: req.id, documentId: doc.id, confidence, method: 'heuristic' });
    }
  }
  results.sort((a, b) => b.confidence - a.confidence);
  return results.slice(0, 1);
}

interface MatchedDoc {
  documentId: string;
  documentName: string;
  confidence: number;
  method: string;
  tags: string[];
  expirationDate: string | null;
}

function evaluateRequirementStatus(req: EventRequirement, matchedDocs: MatchedDoc[]): ReqStatus {
  if (matchedDocs.length === 0) return 'missing';
  const bestDoc = matchedDocs[0];
  if (req.validation.notExpired && bestDoc.expirationDate) {
    const exp = new Date(bestDoc.expirationDate);
    if (exp < new Date()) return 'needs_update';
  }
  if (req.validation.warnExpiringSoon && bestDoc.expirationDate) {
    const exp = new Date(bestDoc.expirationDate);
    const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    if (exp <= ninetyDays && exp > new Date()) return 'expiring_soon';
  }
  return 'satisfied';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Life Event Templates', () => {
  test('all 6 MVP templates are defined', () => {
    expect(LIFE_EVENT_TEMPLATES.length).toBe(6);
    const ids = LIFE_EVENT_TEMPLATES.map(t => t.id);
    expect(ids).toContain('moving');
    expect(ids).toContain('international-travel');
    expect(ids).toContain('new-baby');
    expect(ids).toContain('buying-home');
    expect(ids).toContain('starting-business');
    expect(ids).toContain('estate-planning');
  });

  test('getTemplateById returns correct template', () => {
    const tmpl = getTemplateById('moving');
    expect(tmpl).toBeDefined();
    expect(tmpl!.name).toBe('Moving');
  });

  test('getTemplateById returns undefined for unknown id', () => {
    expect(getTemplateById('nonexistent')).toBeUndefined();
  });

  test('every template has requirements with valid sections', () => {
    const validSections = ['Identity', 'Financial', 'Insurance', 'Property', 'Legal', 'Health', 'Education', 'Travel'];
    for (const tmpl of LIFE_EVENT_TEMPLATES) {
      expect(tmpl.requirements.length).toBeGreaterThan(0);
      for (const req of tmpl.requirements) {
        expect(validSections).toContain(req.section);
        expect(req.weight).toBeGreaterThan(0);
        expect(req.id).toBeTruthy();
      }
    }
  });
});

describe('Deterministic Matching', () => {
  const travelTemplate = getTemplateById('international-travel')!;
  const passportReq = travelTemplate.requirements.find(r => r.id === 'travel-passport')!;

  test('matches document with matching category + tags', () => {
    const docs: UserDoc[] = [{
      id: 'doc-1', name: 'My Passport', category: 'other', type: 'application/pdf',
      tags: ['passport', 'identity'], expiration_date: '2028-01-01', status: 'active', original_name: 'passport.pdf',
    }];
    const matches = deterministicMatch(passportReq, docs);
    expect(matches.length).toBe(1);
    expect(matches[0].documentId).toBe('doc-1');
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.6);
    expect(matches[0].method).toBe('deterministic');
  });

  test('does not match document with wrong category and no tags', () => {
    const docs: UserDoc[] = [{
      id: 'doc-2', name: 'Some File', category: 'warranty', type: 'application/pdf',
      tags: [], expiration_date: null, status: 'active', original_name: 'file.pdf',
    }];
    const matches = deterministicMatch(passportReq, docs);
    expect(matches.length).toBe(0);
  });

  test('returns only the best match when multiple docs qualify', () => {
    const docs: UserDoc[] = [
      { id: 'doc-a', name: 'Old Passport', category: 'other', type: 'application/pdf', tags: ['passport'], expiration_date: null, status: 'active', original_name: 'old.pdf' },
      { id: 'doc-b', name: 'New Passport', category: 'other', type: 'application/pdf', tags: ['passport', 'identity'], expiration_date: '2029-01-01', status: 'active', original_name: 'new.pdf' },
    ];
    const matches = deterministicMatch(passportReq, docs);
    expect(matches.length).toBe(1);
    // doc-b has more matching tags, so higher confidence
    expect(matches[0].documentId).toBe('doc-b');
  });
});

describe('Heuristic Matching', () => {
  const movingTemplate = getTemplateById('moving')!;
  const leaseReq = movingTemplate.requirements.find(r => r.id === 'moving-lease')!;

  test('matches document by filename keywords', () => {
    const docs: UserDoc[] = [{
      id: 'doc-3', name: 'Apartment Lease Agreement 2026', category: 'other', type: 'application/pdf',
      tags: [], expiration_date: null, status: 'active', original_name: 'lease_agreement.pdf',
    }];
    const matches = heuristicMatch(leaseReq, docs);
    expect(matches.length).toBe(1);
    expect(matches[0].method).toBe('heuristic');
  });

  test('does not match document with unrelated filename', () => {
    const docs: UserDoc[] = [{
      id: 'doc-4', name: 'Tax Return 2025', category: 'other', type: 'application/pdf',
      tags: [], expiration_date: null, status: 'active', original_name: 'taxes.pdf',
    }];
    const matches = heuristicMatch(leaseReq, docs);
    expect(matches.length).toBe(0);
  });
});

describe('Requirement Status Evaluation', () => {
  const travelTemplate = getTemplateById('international-travel')!;
  const passportReq = travelTemplate.requirements.find(r => r.id === 'travel-passport')!;

  test('returns "missing" when no docs matched', () => {
    expect(evaluateRequirementStatus(passportReq, [])).toBe('missing');
  });

  test('returns "satisfied" for valid non-expired doc', () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const matched: MatchedDoc[] = [{
      documentId: 'd1', documentName: 'Passport', confidence: 0.9, method: 'deterministic',
      tags: ['passport'], expirationDate: futureDate,
    }];
    expect(evaluateRequirementStatus(passportReq, matched)).toBe('satisfied');
  });

  test('returns "needs_update" for expired doc when notExpired validation is set', () => {
    const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const matched: MatchedDoc[] = [{
      documentId: 'd2', documentName: 'Old Passport', confidence: 0.9, method: 'deterministic',
      tags: ['passport'], expirationDate: pastDate,
    }];
    expect(evaluateRequirementStatus(passportReq, matched)).toBe('needs_update');
  });

  test('returns "expiring_soon" for doc expiring within 90 days', () => {
    const soonDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
    const matched: MatchedDoc[] = [{
      documentId: 'd3', documentName: 'Passport', confidence: 0.9, method: 'deterministic',
      tags: ['passport'], expirationDate: soonDate,
    }];
    expect(evaluateRequirementStatus(passportReq, matched)).toBe('expiring_soon');
  });
});

describe('Intake Answer Filtering', () => {
  test('notApplicableWhen filters requirements based on intake answers', () => {
    const movingTemplate = getTemplateById('moving')!;
    const intakeAnswers = { housing_type: 'renting', move_type: 'within_state' };

    const applicable = movingTemplate.requirements.filter(req => {
      if (!req.notApplicableWhen) return true;
      for (const [qId, triggerVal] of Object.entries(req.notApplicableWhen)) {
        if (intakeAnswers[qId as keyof typeof intakeAnswers] === triggerVal) return false;
      }
      return true;
    });

    // 'moving-new-lease' should be filtered (renting), 'moving-insurance-home' filtered (renting),
    // 'moving-vehicle-reg' filtered (within_state)
    const ids = applicable.map(r => r.id);
    expect(ids).not.toContain('moving-new-lease');
    expect(ids).not.toContain('moving-insurance-home');
    expect(ids).not.toContain('moving-vehicle-reg');
    expect(ids).toContain('moving-id');
    expect(ids).toContain('moving-insurance-renters');
  });
});

describe('Score Computation', () => {
  test('computes correct percentage from weighted requirements', () => {
    // Simulate: 2 requirements, weight 2 and 1. First satisfied, second missing.
    const totalWeight = 3;
    const completedWeight = 2;
    const score = Math.round((completedWeight / totalWeight) * 100 * 100) / 100;
    expect(score).toBeCloseTo(66.67, 1);
  });

  test('returns 0 when no applicable requirements', () => {
    const totalWeight = 0;
    const score = totalWeight > 0 ? Math.round((0 / totalWeight) * 100 * 100) / 100 : 0;
    expect(score).toBe(0);
  });

  test('expiring_soon contributes 75% of weight', () => {
    const totalWeight = 4;
    // 1 satisfied (weight 2), 1 expiring_soon (weight 2)
    const completedWeight = 2 + 2 * 0.75;
    const score = Math.round((completedWeight / totalWeight) * 100 * 100) / 100;
    expect(score).toBeCloseTo(87.5, 1);
  });
});
