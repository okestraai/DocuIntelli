/**
 * Engagement Engine API Routes
 *
 * Endpoints:
 * - GET  /today-feed                     - Today feed items
 * - GET  /weekly-audit                   - Weekly audit data
 * - GET  /documents/:id/health           - Single document health + insights
 * - GET  /preparedness                   - User preparedness score
 * - POST /documents/:id/metadata         - Update document metadata (also sets last_reviewed_at)
 * - POST /documents/:id/cadence          - Set review cadence (also sets last_reviewed_at)
 * - POST /documents/:id/link-related     - Link related documents
 * - GET  /gap-suggestions                - Get gap suggestions
 * - POST /gap-suggestions/:key/dismiss   - Dismiss a gap suggestion
 * - GET  /documents/:id/relationships    - Get related documents
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  computeDocumentHealth,
  computeAllDocumentHealth,
  computePreparedness,
  detectGaps,
  generateDocumentInsights,
  generateTodayFeed,
  compileWeeklyAudit,
  suggestReviewCadence,
  getNextReviewDate,
  DocumentForHealth,
} from '../services/engagementEngine';

const router = Router();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Helper: Get authenticated user ID from token
async function getUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// Helper: Fetch all user documents with engagement fields
async function fetchUserDocuments(userId: string): Promise<DocumentForHealth[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, user_id, name, category, type, tags, expiration_date, upload_date, last_reviewed_at, review_cadence_days, issuer, owner_name, effective_date, status, processed, health_state, health_computed_at, insights_cache')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as DocumentForHealth[];
}

// Helper: Fetch dismissed gap keys
async function fetchDismissedGaps(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('gap_dismissals')
    .select('suggestion_key')
    .eq('user_id', userId);

  if (error) return new Set();
  return new Set((data || []).map(d => d.suggestion_key));
}

// Helper: Fetch previous preparedness score
async function fetchPreviousScore(userId: string): Promise<number | null> {
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);

  const { data, error } = await supabase
    .from('preparedness_snapshots')
    .select('score')
    .eq('user_id', userId)
    .lte('snapshot_date', lastWeek.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.score;
}

// ============================================================================
// GET /today-feed
// ============================================================================

router.get('/today-feed', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const docs = await fetchUserDocuments(userId);
    const now = new Date();
    const healthMap = computeAllDocumentHealth(docs, now);
    const dismissedGaps = await fetchDismissedGaps(userId);
    const gapSuggestions = detectGaps(docs, dismissedGaps);
    const previousScore = await fetchPreviousScore(userId);
    const preparedness = computePreparedness(docs, healthMap, previousScore, now);
    const feed = generateTodayFeed(docs, healthMap, gapSuggestions, now);

    res.json({
      success: true,
      feed,
      preparedness,
      healthSummary: {
        healthy: docs.filter(d => healthMap.get(d.id)?.state === 'healthy').length,
        watch: docs.filter(d => healthMap.get(d.id)?.state === 'watch').length,
        risk: docs.filter(d => healthMap.get(d.id)?.state === 'risk').length,
        critical: docs.filter(d => healthMap.get(d.id)?.state === 'critical').length,
        total: docs.length,
      },
    });
  } catch (error) {
    console.error('Today feed error:', error);
    res.status(500).json({ error: 'Failed to generate today feed' });
  }
});

// ============================================================================
// GET /weekly-audit
// ============================================================================

router.get('/weekly-audit', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const docs = await fetchUserDocuments(userId);
    const now = new Date();
    const healthMap = computeAllDocumentHealth(docs, now);
    const dismissedGaps = await fetchDismissedGaps(userId);
    const gapSuggestions = detectGaps(docs, dismissedGaps);
    const previousScore = await fetchPreviousScore(userId);
    const preparedness = computePreparedness(docs, healthMap, previousScore, now);
    const audit = compileWeeklyAudit(docs, healthMap, gapSuggestions, preparedness, now);

    res.json({ success: true, audit });
  } catch (error) {
    console.error('Weekly audit error:', error);
    res.status(500).json({ error: 'Failed to compile weekly audit' });
  }
});

// ============================================================================
// GET /preparedness
// ============================================================================

router.get('/preparedness', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const docs = await fetchUserDocuments(userId);
    const now = new Date();
    const healthMap = computeAllDocumentHealth(docs, now);
    const previousScore = await fetchPreviousScore(userId);
    const preparedness = computePreparedness(docs, healthMap, previousScore, now);

    // Save today's snapshot (upsert)
    await supabase
      .from('preparedness_snapshots')
      .upsert({
        user_id: userId,
        score: preparedness.score,
        factors: preparedness.factors,
        snapshot_date: now.toISOString().split('T')[0],
      }, { onConflict: 'user_id,snapshot_date' });

    res.json({ success: true, preparedness });
  } catch (error) {
    console.error('Preparedness error:', error);
    res.status(500).json({ error: 'Failed to compute preparedness' });
  }
});

// ============================================================================
// GET /documents/:id/health
// ============================================================================

router.get('/documents/:id/health', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { id } = req.params;
    const { data: doc, error } = await supabase
      .from('documents')
      .select('id, user_id, name, category, type, tags, expiration_date, upload_date, last_reviewed_at, review_cadence_days, issuer, owner_name, effective_date, status, processed, health_state, health_computed_at, insights_cache')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !doc) { res.status(404).json({ error: 'Document not found' }); return; }

    const now = new Date();
    const health = computeDocumentHealth(doc as DocumentForHealth, now);
    const insights = generateDocumentInsights(doc as DocumentForHealth, now);
    const nextReview = getNextReviewDate(doc as DocumentForHealth);
    const suggestedCadence = suggestReviewCadence(doc.category);

    // Get related documents
    const { data: relationships } = await supabase
      .from('document_relationships')
      .select('related_document_id, relationship_type, documents!document_relationships_related_document_id_fkey(id, name, category)')
      .eq('source_document_id', id)
      .eq('user_id', userId);

    const { data: reverseRelationships } = await supabase
      .from('document_relationships')
      .select('source_document_id, relationship_type, documents!document_relationships_source_document_id_fkey(id, name, category)')
      .eq('related_document_id', id)
      .eq('user_id', userId);

    // Update health snapshot in DB (non-blocking)
    supabase
      .from('documents')
      .update({ health_state: health.state, health_computed_at: now.toISOString() })
      .eq('id', id)
      .then(() => {});

    res.json({
      success: true,
      health,
      insights,
      nextReviewDate: nextReview?.toISOString() || null,
      suggestedCadenceDays: suggestedCadence,
      relationships: relationships || [],
      reverseRelationships: reverseRelationships || [],
      metadata: {
        issuer: doc.issuer || '',
        ownerName: doc.owner_name || '',
        expirationDate: doc.expiration_date || '',
      },
    });
  } catch (error) {
    console.error('Document health error:', error);
    res.status(500).json({ error: 'Failed to compute document health' });
  }
});

// ============================================================================
// POST /documents/:id/metadata
// ============================================================================

router.post('/documents/:id/metadata', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { id } = req.params;
    const { tags, issuer, ownerName, effectiveDate, expirationDate } = req.body;
    const now = new Date();

    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (docError || !doc) { res.status(404).json({ error: 'Document not found' }); return; }

    const updates: Record<string, any> = {};
    if (tags !== undefined) updates.tags = tags;
    if (issuer !== undefined) updates.issuer = issuer;
    if (ownerName !== undefined) updates.owner_name = ownerName;
    if (effectiveDate !== undefined) updates.effective_date = effectiveDate;
    if (expirationDate !== undefined) updates.expiration_date = expirationDate;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No metadata fields provided' });
      return;
    }

    // Active data input counts as a review
    updates.last_reviewed_at = now.toISOString();

    const { error: updateError } = await supabase
      .from('documents')
      .update(updates)
      .eq('id', id);

    if (updateError) throw updateError;

    await supabase
      .from('review_events')
      .insert({
        document_id: id,
        user_id: userId,
        action: 'updated_metadata',
        metadata: { fields: Object.keys(updates), timestamp: now.toISOString() },
      });

    res.json({ success: true, message: 'Metadata updated', updatedFields: Object.keys(updates) });
  } catch (error) {
    console.error('Metadata update error:', error);
    res.status(500).json({ error: 'Failed to update metadata' });
  }
});

// ============================================================================
// POST /documents/:id/cadence
// ============================================================================

router.post('/documents/:id/cadence', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { id } = req.params;
    const { cadenceDays } = req.body;

    if (typeof cadenceDays !== 'number' || cadenceDays < 1) {
      res.status(400).json({ error: 'cadenceDays must be a positive number' });
      return;
    }

    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (docError || !doc) { res.status(404).json({ error: 'Document not found' }); return; }

    // Setting a cadence counts as a review
    const { error: updateError } = await supabase
      .from('documents')
      .update({ review_cadence_days: cadenceDays, last_reviewed_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) throw updateError;

    await supabase
      .from('review_events')
      .insert({
        document_id: id,
        user_id: userId,
        action: 'set_cadence',
        metadata: { cadenceDays },
      });

    res.json({ success: true, message: `Review cadence set to ${cadenceDays} days` });
  } catch (error) {
    console.error('Cadence update error:', error);
    res.status(500).json({ error: 'Failed to set cadence' });
  }
});

// ============================================================================
// POST /documents/:id/link-related
// ============================================================================

router.post('/documents/:id/link-related', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { id } = req.params;
    const { relatedDocumentId, relationshipType } = req.body;

    if (!relatedDocumentId) {
      res.status(400).json({ error: 'relatedDocumentId is required' });
      return;
    }

    // Verify both documents belong to user
    const { data: docs, error: docsError } = await supabase
      .from('documents')
      .select('id')
      .eq('user_id', userId)
      .in('id', [id, relatedDocumentId]);

    if (docsError || !docs || docs.length !== 2) {
      res.status(404).json({ error: 'One or both documents not found' });
      return;
    }

    const { error: insertError } = await supabase
      .from('document_relationships')
      .insert({
        user_id: userId,
        source_document_id: id,
        related_document_id: relatedDocumentId,
        relationship_type: relationshipType || 'related',
      });

    if (insertError) {
      if (insertError.code === '23505') {
        res.status(409).json({ error: 'Relationship already exists' });
        return;
      }
      throw insertError;
    }

    await supabase
      .from('review_events')
      .insert({
        document_id: id,
        user_id: userId,
        action: 'linked_document',
        metadata: { relatedDocumentId, relationshipType },
      });

    res.json({ success: true, message: 'Documents linked' });
  } catch (error) {
    console.error('Link related error:', error);
    res.status(500).json({ error: 'Failed to link documents' });
  }
});

// ============================================================================
// GET /gap-suggestions
// ============================================================================

router.get('/gap-suggestions', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const docs = await fetchUserDocuments(userId);
    const dismissedGaps = await fetchDismissedGaps(userId);
    const suggestions = detectGaps(docs, dismissedGaps);

    res.json({ success: true, suggestions });
  } catch (error) {
    console.error('Gap suggestions error:', error);
    res.status(500).json({ error: 'Failed to get gap suggestions' });
  }
});

// ============================================================================
// POST /gap-suggestions/:key/dismiss
// ============================================================================

router.post('/gap-suggestions/:key/dismiss', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { key } = req.params;
    const { markedAsUploaded } = req.body;

    const { error } = await supabase
      .from('gap_dismissals')
      .upsert({
        user_id: userId,
        suggestion_key: key,
        source_category: req.body.sourceCategory || 'unknown',
        marked_as_uploaded: markedAsUploaded || false,
      }, { onConflict: 'user_id,suggestion_key' });

    if (error) throw error;

    res.json({ success: true, message: markedAsUploaded ? 'Marked as uploaded' : 'Suggestion dismissed' });
  } catch (error) {
    console.error('Gap dismiss error:', error);
    res.status(500).json({ error: 'Failed to dismiss suggestion' });
  }
});

// ============================================================================
// GET /documents/:id/relationships
// ============================================================================

router.get('/documents/:id/relationships', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { id } = req.params;

    const { data: outgoing } = await supabase
      .from('document_relationships')
      .select('id, related_document_id, relationship_type')
      .eq('source_document_id', id)
      .eq('user_id', userId);

    const { data: incoming } = await supabase
      .from('document_relationships')
      .select('id, source_document_id, relationship_type')
      .eq('related_document_id', id)
      .eq('user_id', userId);

    // Fetch names for related docs
    const relatedIds = [
      ...(outgoing || []).map(r => r.related_document_id),
      ...(incoming || []).map(r => r.source_document_id),
    ];

    let relatedDocs: Record<string, { name: string; category: string }> = {};
    if (relatedIds.length > 0) {
      const { data } = await supabase
        .from('documents')
        .select('id, name, category')
        .in('id', relatedIds);
      if (data) {
        for (const d of data) {
          relatedDocs[d.id] = { name: d.name, category: d.category };
        }
      }
    }

    res.json({
      success: true,
      outgoing: (outgoing || []).map(r => ({
        ...r,
        documentName: relatedDocs[r.related_document_id]?.name,
        documentCategory: relatedDocs[r.related_document_id]?.category,
      })),
      incoming: (incoming || []).map(r => ({
        ...r,
        documentName: relatedDocs[r.source_document_id]?.name,
        documentCategory: relatedDocs[r.source_document_id]?.category,
      })),
    });
  } catch (error) {
    console.error('Relationships error:', error);
    res.status(500).json({ error: 'Failed to get relationships' });
  }
});

export default router;
