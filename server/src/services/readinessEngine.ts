/**
 * Readiness Engine — matching + scoring logic for Life Events.
 *
 * Pipeline: deterministic -> heuristic -> (optional) LLM
 * All results are persisted so we never re-run expensive passes needlessly.
 */

import { createClient } from '@supabase/supabase-js';
import {
  getTemplateById,
  EventRequirement,
  LifeEventTemplate,
} from '../config/lifeEventTemplates';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReqStatus =
  | 'pending'
  | 'satisfied'
  | 'missing'
  | 'needs_update'
  | 'expiring_soon'
  | 'incomplete_metadata'
  | 'not_applicable';

export interface MatchResult {
  requirementId: string;
  documentId: string;
  confidence: number;
  method: 'deterministic' | 'heuristic' | 'llm' | 'manual';
}

export interface RequirementStatus {
  requirementId: string;
  status: ReqStatus;
  matchedDocuments: {
    documentId: string;
    documentName: string;
    confidence: number;
    method: string;
    tags: string[];
    expirationDate: string | null;
  }[];
  suggestedAction: string | null;
}

export interface ReadinessResult {
  eventId: string;
  templateId: string;
  readinessScore: number;
  totalWeight: number;
  completedWeight: number;
  requirements: RequirementStatus[];
  nextBestAction: string | null;
}

// ---------------------------------------------------------------------------
// Document type used internally
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main entry: compute readiness for an event
// ---------------------------------------------------------------------------

export async function computeReadiness(
  eventId: string,
  userId: string
): Promise<ReadinessResult> {
  // 1. Load the event
  const { data: event, error: evErr } = await supabase
    .from('life_events')
    .select('*')
    .eq('id', eventId)
    .eq('user_id', userId)
    .single();

  if (evErr || !event) throw new Error('Life event not found');

  const template = getTemplateById(event.template_id);
  if (!template) throw new Error(`Template "${event.template_id}" not found`);

  // 2. Load user documents
  const { data: docs } = await supabase
    .from('documents')
    .select('id, name, category, type, tags, expiration_date, status, original_name')
    .eq('user_id', userId);

  const userDocs: UserDoc[] = (docs || []).map((d: any) => ({
    ...d,
    tags: d.tags || [],
  }));

  // 3. Load existing matches & statuses
  const { data: existingMatches } = await supabase
    .from('life_event_requirement_matches')
    .select('*')
    .eq('life_event_id', eventId);

  const { data: existingStatuses } = await supabase
    .from('life_event_requirement_status')
    .select('*')
    .eq('life_event_id', eventId);

  const manualMatches = new Map<string, any[]>();
  const naStatuses = new Map<string, string>();

  for (const m of existingMatches || []) {
    if (m.match_method === 'manual') {
      const arr = manualMatches.get(m.requirement_id) || [];
      arr.push(m);
      manualMatches.set(m.requirement_id, arr);
    }
  }
  for (const s of existingStatuses || []) {
    if (s.status === 'not_applicable') {
      naStatuses.set(s.requirement_id, s.not_applicable_reason || '');
    }
  }

  // 4. Filter applicable requirements based on intake answers
  const intakeAnswers: Record<string, string> = event.intake_answers || {};
  const applicableReqs = template.requirements.filter((req) => {
    if (naStatuses.has(req.id)) return false; // user marked N/A
    if (!req.notApplicableWhen) return true;
    for (const [qId, triggerVal] of Object.entries(req.notApplicableWhen)) {
      if (intakeAnswers[qId] === triggerVal) return false;
    }
    return true;
  });

  // 5. Run matching pipeline for each applicable requirement
  const allNewMatches: MatchResult[] = [];
  const reqResults: RequirementStatus[] = [];

  for (const req of applicableReqs) {
    // Check for manual overrides first
    const manual = manualMatches.get(req.id);
    if (manual && manual.length > 0) {
      const matchedDocs = manual.map((m: any) => {
        const doc = userDocs.find((d) => d.id === m.document_id);
        return {
          documentId: m.document_id,
          documentName: doc?.name || 'Unknown',
          confidence: Number(m.confidence),
          method: 'manual',
          tags: doc?.tags || [],
          expirationDate: doc?.expiration_date || null,
        };
      });
      const status = evaluateRequirementStatus(req, matchedDocs, userDocs);
      reqResults.push({ requirementId: req.id, status, matchedDocuments: matchedDocs, suggestedAction: getSuggestedAction(status, req) });
      continue;
    }

    // Deterministic pass
    let matches = deterministicMatch(req, userDocs);

    // Heuristic pass (only if deterministic found nothing)
    if (matches.length === 0) {
      matches = heuristicMatch(req, userDocs);
    }

    // Store new matches
    for (const m of matches) {
      allNewMatches.push(m);
    }

    const matchedDocs = matches.map((m) => {
      const doc = userDocs.find((d) => d.id === m.documentId)!;
      return {
        documentId: m.documentId,
        documentName: doc?.name || 'Unknown',
        confidence: m.confidence,
        method: m.method,
        tags: doc?.tags || [],
        expirationDate: doc?.expiration_date || null,
      };
    });

    const status = evaluateRequirementStatus(req, matchedDocs, userDocs);
    reqResults.push({
      requirementId: req.id,
      status,
      matchedDocuments: matchedDocs,
      suggestedAction: getSuggestedAction(status, req),
    });
  }

  // Add N/A requirements
  for (const req of template.requirements) {
    if (!applicableReqs.includes(req)) {
      reqResults.push({
        requirementId: req.id,
        status: 'not_applicable',
        matchedDocuments: [],
        suggestedAction: null,
      });
    }
  }

  // 6. Persist matches (upsert)
  if (allNewMatches.length > 0) {
    // Delete old non-manual matches first, then insert fresh ones
    await supabase
      .from('life_event_requirement_matches')
      .delete()
      .eq('life_event_id', eventId)
      .neq('match_method', 'manual');

    await supabase
      .from('life_event_requirement_matches')
      .insert(
        allNewMatches.map((m) => ({
          life_event_id: eventId,
          requirement_id: m.requirementId,
          document_id: m.documentId,
          confidence: m.confidence,
          match_method: m.method,
        }))
      );
  }

  // 7. Persist requirement statuses (upsert)
  for (const r of reqResults) {
    await supabase
      .from('life_event_requirement_status')
      .upsert(
        {
          life_event_id: eventId,
          requirement_id: r.requirementId,
          status: r.status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'life_event_id,requirement_id' }
      );
  }

  // 8. Include custom requirements
  const customResult = await loadCustomRequirements(eventId, userDocs);
  reqResults.push(...customResult.reqStatuses);

  // 9. Compute score (template + custom)
  const { totalWeight: tmplWeight, completedWeight: tmplCompleted } = computeScore(
    template.requirements,
    reqResults,
    applicableReqs
  );
  const totalWeight = tmplWeight + customResult.weightAdded;
  const completedWeight = tmplCompleted + customResult.completedAdded;
  const score = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100 * 100) / 100 : 0;

  // 10. Update event readiness score
  await supabase
    .from('life_events')
    .update({ readiness_score: score })
    .eq('id', eventId);

  // 11. Determine next best action
  const nextBestAction = findNextBestAction(reqResults, template.requirements);

  return {
    eventId,
    templateId: event.template_id,
    readinessScore: score,
    totalWeight,
    completedWeight,
    requirements: reqResults,
    nextBestAction,
  };
}

// ---------------------------------------------------------------------------
// Deterministic matching: category + tag
// ---------------------------------------------------------------------------

function deterministicMatch(
  req: EventRequirement,
  docs: UserDoc[]
): MatchResult[] {
  const results: MatchResult[] = [];

  for (const doc of docs) {
    let score = 0;

    // Category match
    if (req.docCategories.includes(doc.category)) {
      score += 0.4;
    }

    // Tag match
    const docTagsLower = doc.tags.map((t) => t.toLowerCase());
    const matchingTags = req.suggestedTags.filter((t) =>
      docTagsLower.includes(t.toLowerCase())
    );
    if (matchingTags.length > 0) {
      score += 0.3 + Math.min(0.3, matchingTags.length * 0.1);
    }

    if (score >= 0.6) {
      results.push({
        requirementId: req.id,
        documentId: doc.id,
        confidence: Math.min(1, score),
        method: 'deterministic',
      });
    }
  }

  // Return best match only (highest confidence)
  results.sort((a, b) => b.confidence - a.confidence);
  return results.slice(0, 1);
}

// ---------------------------------------------------------------------------
// Heuristic matching: filename + keyword
// ---------------------------------------------------------------------------

function heuristicMatch(
  req: EventRequirement,
  docs: UserDoc[]
): MatchResult[] {
  const results: MatchResult[] = [];

  for (const doc of docs) {
    const nameLower = (doc.name + ' ' + doc.original_name).toLowerCase();
    let matchCount = 0;

    for (const kw of req.keywords) {
      if (nameLower.includes(kw.toLowerCase())) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      const confidence = Math.min(0.8, 0.3 + matchCount * 0.15);
      results.push({
        requirementId: req.id,
        documentId: doc.id,
        confidence,
        method: 'heuristic',
      });
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results.slice(0, 1);
}

// ---------------------------------------------------------------------------
// Evaluate requirement status from matched docs
// ---------------------------------------------------------------------------

function evaluateRequirementStatus(
  req: EventRequirement,
  matchedDocs: RequirementStatus['matchedDocuments'],
  _allDocs: UserDoc[]
): ReqStatus {
  if (matchedDocs.length === 0) return 'missing';

  const bestDoc = matchedDocs[0];

  // Check expiration
  if (req.validation.notExpired && bestDoc.expirationDate) {
    const exp = new Date(bestDoc.expirationDate);
    const now = new Date();
    if (exp < now) return 'needs_update';
  }

  // Check expiring soon (90 days)
  if (req.validation.warnExpiringSoon && bestDoc.expirationDate) {
    const exp = new Date(bestDoc.expirationDate);
    const now = new Date();
    const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    if (exp <= ninetyDays && exp > now) return 'expiring_soon';
  }

  // Check required metadata
  if (
    req.validation.requiredMetadata &&
    req.validation.requiredMetadata.length > 0
  ) {
    // For now, we check if expiration_date is set when required
    if (
      req.validation.requiredMetadata.includes('expiration') &&
      !bestDoc.expirationDate
    ) {
      return 'incomplete_metadata';
    }
  }

  return 'satisfied';
}

// ---------------------------------------------------------------------------
// Compute weighted score
// ---------------------------------------------------------------------------

function computeScore(
  allReqs: EventRequirement[],
  statuses: RequirementStatus[],
  applicableReqs: EventRequirement[]
): { score: number; totalWeight: number; completedWeight: number } {
  let totalWeight = 0;
  let completedWeight = 0;

  for (const req of applicableReqs) {
    totalWeight += req.weight;
    const rs = statuses.find((s) => s.requirementId === req.id);
    if (rs && rs.status === 'satisfied') {
      completedWeight += req.weight;
    } else if (rs && rs.status === 'expiring_soon') {
      // Expiring soon counts as 75% complete
      completedWeight += req.weight * 0.75;
    }
  }

  const score = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100 * 100) / 100 : 0;

  return { score, totalWeight, completedWeight };
}

// ---------------------------------------------------------------------------
// Suggested actions
// ---------------------------------------------------------------------------

function getSuggestedAction(status: ReqStatus, req: EventRequirement): string | null {
  switch (status) {
    case 'missing':
      return `Upload your ${req.title}`;
    case 'needs_update':
      return `Your ${req.title} has expired — upload a renewed copy`;
    case 'expiring_soon':
      return `Your ${req.title} is expiring soon — plan to renew`;
    case 'incomplete_metadata':
      return `Set the expiration date on your ${req.title}`;
    case 'satisfied':
    case 'not_applicable':
      return null;
    default:
      return `Review your ${req.title}`;
  }
}

function findNextBestAction(
  statuses: RequirementStatus[],
  allReqs: EventRequirement[]
): string | null {
  // Priority: needs_update > incomplete_metadata > expiring_soon > missing
  const priority: ReqStatus[] = [
    'needs_update',
    'incomplete_metadata',
    'expiring_soon',
    'missing',
  ];

  for (const p of priority) {
    const match = statuses.find((s) => s.status === p);
    if (match) {
      const req = allReqs.find((r) => r.id === match.requirementId);
      return match.suggestedAction || (req ? `Address ${req.title}` : null);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Custom requirements helper
// ---------------------------------------------------------------------------

async function loadCustomRequirements(
  eventId: string,
  userDocs: UserDoc[]
): Promise<{ reqStatuses: RequirementStatus[]; weightAdded: number; completedAdded: number }> {
  const { data: customReqs } = await supabase
    .from('life_event_custom_requirements')
    .select('*')
    .eq('life_event_id', eventId)
    .order('created_at', { ascending: true });

  const reqStatuses: RequirementStatus[] = [];
  let weightAdded = 0;
  let completedAdded = 0;

  for (const cr of customReqs || []) {
    weightAdded += 1;
    const doc = cr.document_id ? userDocs.find((d) => d.id === cr.document_id) : null;
    const status: ReqStatus = doc ? 'satisfied' : 'missing';
    if (status === 'satisfied') completedAdded += 1;

    reqStatuses.push({
      requirementId: `custom-${cr.id}`,
      status,
      matchedDocuments: doc
        ? [
            {
              documentId: doc.id,
              documentName: doc.name,
              confidence: 1.0,
              method: 'manual',
              tags: doc.tags || [],
              expirationDate: doc.expiration_date || null,
            },
          ]
        : [],
      suggestedAction: status === 'missing' ? `Attach your ${cr.title}` : null,
    });
  }

  return { reqStatuses, weightAdded, completedAdded };
}

// ---------------------------------------------------------------------------
// Read-only snapshot: returns current readiness from DB without re-matching
// ---------------------------------------------------------------------------

export async function getReadinessSnapshot(
  eventId: string,
  userId: string
): Promise<ReadinessResult> {
  const { data: event, error: evErr } = await supabase
    .from('life_events')
    .select('*')
    .eq('id', eventId)
    .eq('user_id', userId)
    .single();

  if (evErr || !event) throw new Error('Life event not found');

  const template = getTemplateById(event.template_id);
  if (!template) throw new Error(`Template "${event.template_id}" not found`);

  // Load user docs (for names, tags, expiration)
  const { data: docs } = await supabase
    .from('documents')
    .select('id, name, category, type, tags, expiration_date, status, original_name')
    .eq('user_id', userId);
  const userDocs: UserDoc[] = (docs || []).map((d: any) => ({ ...d, tags: d.tags || [] }));

  // Load current matches & statuses from DB
  const { data: existingMatches } = await supabase
    .from('life_event_requirement_matches')
    .select('*')
    .eq('life_event_id', eventId);

  const { data: existingStatuses } = await supabase
    .from('life_event_requirement_status')
    .select('*')
    .eq('life_event_id', eventId);

  const intakeAnswers: Record<string, string> = event.intake_answers || {};
  const naStatuses = new Set<string>();
  for (const s of existingStatuses || []) {
    if (s.status === 'not_applicable') naStatuses.add(s.requirement_id);
  }

  const applicableReqs = template.requirements.filter((req) => {
    if (naStatuses.has(req.id)) return false;
    if (!req.notApplicableWhen) return true;
    for (const [qId, triggerVal] of Object.entries(req.notApplicableWhen)) {
      if (intakeAnswers[qId] === triggerVal) return false;
    }
    return true;
  });

  // Build requirement statuses from current DB state
  const matchesByReq = new Map<string, any[]>();
  for (const m of existingMatches || []) {
    const arr = matchesByReq.get(m.requirement_id) || [];
    arr.push(m);
    matchesByReq.set(m.requirement_id, arr);
  }

  const reqResults: RequirementStatus[] = [];

  for (const req of applicableReqs) {
    const matches = matchesByReq.get(req.id) || [];
    const matchedDocs = matches.map((m: any) => {
      const doc = userDocs.find((d) => d.id === m.document_id);
      return {
        documentId: m.document_id,
        documentName: doc?.name || 'Unknown',
        confidence: Number(m.confidence),
        method: m.match_method,
        tags: doc?.tags || [],
        expirationDate: doc?.expiration_date || null,
      };
    });
    const status = evaluateRequirementStatus(req, matchedDocs, userDocs);
    reqResults.push({
      requirementId: req.id,
      status,
      matchedDocuments: matchedDocs,
      suggestedAction: getSuggestedAction(status, req),
    });
  }

  // Add N/A requirements
  for (const req of template.requirements) {
    if (!applicableReqs.includes(req)) {
      reqResults.push({
        requirementId: req.id,
        status: 'not_applicable',
        matchedDocuments: [],
        suggestedAction: null,
      });
    }
  }

  // Include custom requirements
  const customResult = await loadCustomRequirements(eventId, userDocs);
  reqResults.push(...customResult.reqStatuses);

  const { totalWeight: tmplWeight, completedWeight: tmplCompleted } = computeScore(
    template.requirements,
    reqResults,
    applicableReqs
  );
  const totalWeight = tmplWeight + customResult.weightAdded;
  const completedWeight = tmplCompleted + customResult.completedAdded;
  const score = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100 * 100) / 100 : 0;

  // Update the stored score
  await supabase
    .from('life_events')
    .update({ readiness_score: score })
    .eq('id', eventId);

  return {
    eventId,
    templateId: event.template_id,
    readinessScore: score,
    totalWeight,
    completedWeight,
    requirements: reqResults,
    nextBestAction: findNextBestAction(reqResults, template.requirements),
  };
}
