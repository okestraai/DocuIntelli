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
import { loadSubscription } from '../middleware/subscriptionGuard';
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
import { query } from '../services/db';

const router = Router();

// Use standard loadSubscription middleware instead of manual auth extraction
router.use(loadSubscription);

// Helper: Fetch all user documents with engagement fields
async function fetchUserDocuments(userId: string): Promise<DocumentForHealth[]> {
  const result = await query(
    'SELECT id, user_id, name, category, type, tags, expiration_date, upload_date, last_reviewed_at, review_cadence_days, issuer, owner_name, effective_date, status, processed, health_state, health_computed_at, insights_cache FROM documents WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );

  return (result.rows || []) as DocumentForHealth[];
}

// Helper: Fetch dismissed gap keys
async function fetchDismissedGaps(userId: string): Promise<Set<string>> {
  const result = await query(
    'SELECT suggestion_key FROM gap_dismissals WHERE user_id = $1',
    [userId]
  );

  return new Set((result.rows || []).map(d => d.suggestion_key));
}

// Helper: Fetch previous preparedness score
async function fetchPreviousScore(userId: string): Promise<number | null> {
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);

  const result = await query(
    'SELECT score FROM preparedness_snapshots WHERE user_id = $1 AND snapshot_date <= $2 ORDER BY snapshot_date DESC LIMIT 1',
    [userId, lastWeek.toISOString().split('T')[0]]
  );

  if (!result.rows[0]) return null;
  return result.rows[0].score;
}

// ============================================================================
// GET /today-feed
// ============================================================================

router.get('/today-feed', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

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
    const userId = req.userId!;

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
    const userId = req.userId!;

    const docs = await fetchUserDocuments(userId);
    const now = new Date();
    const healthMap = computeAllDocumentHealth(docs, now);
    const previousScore = await fetchPreviousScore(userId);
    const preparedness = computePreparedness(docs, healthMap, previousScore, now);

    // Save today's snapshot (upsert)
    await query(
      `INSERT INTO preparedness_snapshots (user_id, score, factors, snapshot_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
         score = EXCLUDED.score,
         factors = EXCLUDED.factors`,
      [userId, preparedness.score, JSON.stringify(preparedness.factors), now.toISOString().split('T')[0]]
    );

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
    const userId = req.userId!;
    const { id } = req.params;

    const docResult = await query(
      'SELECT id, user_id, name, category, type, tags, expiration_date, upload_date, last_reviewed_at, review_cadence_days, issuer, owner_name, effective_date, status, processed, health_state, health_computed_at, insights_cache, policy_number, address, metadata_confirmed FROM documents WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    const doc = docResult.rows[0];

    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }

    const now = new Date();
    const health = computeDocumentHealth(doc as DocumentForHealth, now);
    const insights = generateDocumentInsights(doc as DocumentForHealth, now);
    const nextReview = getNextReviewDate(doc as DocumentForHealth);
    const suggestedCadence = suggestReviewCadence(doc.category);

    // Get related documents (forward direction)
    const relationshipsResult = await query(
      `SELECT dr.related_document_id, dr.relationship_type, d.id, d.name, d.category
       FROM document_relationships dr
       JOIN documents d ON d.id = dr.related_document_id
       WHERE dr.source_document_id = $1 AND dr.user_id = $2`,
      [id, userId]
    );

    // Get related documents (reverse direction)
    const reverseRelationshipsResult = await query(
      `SELECT dr.source_document_id, dr.relationship_type, d.id, d.name, d.category
       FROM document_relationships dr
       JOIN documents d ON d.id = dr.source_document_id
       WHERE dr.related_document_id = $1 AND dr.user_id = $2`,
      [id, userId]
    );

    // Update health snapshot in DB (non-blocking)
    query(
      'UPDATE documents SET health_state = $1, health_computed_at = $2 WHERE id = $3',
      [health.state, now.toISOString(), id]
    ).catch(() => {});

    res.json({
      success: true,
      health,
      insights,
      nextReviewDate: nextReview?.toISOString() || null,
      suggestedCadenceDays: suggestedCadence,
      relationships: relationshipsResult.rows || [],
      reverseRelationships: reverseRelationshipsResult.rows || [],
      metadata: {
        issuer: doc.issuer || '',
        ownerName: doc.owner_name || '',
        expirationDate: doc.expiration_date || '',
        effectiveDate: doc.effective_date || '',
        policyNumber: doc.policy_number || '',
        address: doc.address || '',
        metadataConfirmed: doc.metadata_confirmed || false,
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
    const userId = req.userId!;
    const { id } = req.params;
    const { tags, issuer, ownerName, effectiveDate, expirationDate, policyNumber, address, metadataConfirmed } = req.body;
    const now = new Date();

    const docResult = await query(
      'SELECT id, user_id FROM documents WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (!docResult.rows[0]) { res.status(404).json({ error: 'Document not found' }); return; }

    // Build dynamic UPDATE
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;
    const updatedFields: string[] = [];

    if (tags !== undefined) {
      setClauses.push(`tags = $${paramIdx}`);
      params.push(tags);
      paramIdx++;
      updatedFields.push('tags');
    }
    if (issuer !== undefined) {
      setClauses.push(`issuer = $${paramIdx}`);
      params.push(issuer);
      paramIdx++;
      updatedFields.push('issuer');
    }
    if (ownerName !== undefined) {
      setClauses.push(`owner_name = $${paramIdx}`);
      params.push(ownerName);
      paramIdx++;
      updatedFields.push('owner_name');
    }
    if (effectiveDate !== undefined) {
      setClauses.push(`effective_date = $${paramIdx}`);
      params.push(effectiveDate);
      paramIdx++;
      updatedFields.push('effective_date');
    }
    if (expirationDate !== undefined) {
      setClauses.push(`expiration_date = $${paramIdx}`);
      params.push(expirationDate);
      paramIdx++;
      updatedFields.push('expiration_date');
    }
    if (policyNumber !== undefined) {
      setClauses.push(`policy_number = $${paramIdx}`);
      params.push(policyNumber);
      paramIdx++;
      updatedFields.push('policy_number');
    }
    if (address !== undefined) {
      setClauses.push(`address = $${paramIdx}`);
      params.push(address);
      paramIdx++;
      updatedFields.push('address');
    }
    if (metadataConfirmed !== undefined) {
      setClauses.push(`metadata_confirmed = $${paramIdx}`);
      params.push(metadataConfirmed);
      paramIdx++;
      updatedFields.push('metadata_confirmed');
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No metadata fields provided' });
      return;
    }

    // Active data input counts as a review
    setClauses.push(`last_reviewed_at = $${paramIdx}`);
    params.push(now.toISOString());
    paramIdx++;
    updatedFields.push('last_reviewed_at');

    params.push(id);
    await query(
      `UPDATE documents SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
      params
    );

    await query(
      'INSERT INTO review_events (document_id, user_id, action, metadata) VALUES ($1, $2, $3, $4)',
      [id, userId, 'updated_metadata', JSON.stringify({ fields: updatedFields, timestamp: now.toISOString() })]
    );

    res.json({ success: true, message: 'Metadata updated', updatedFields });
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
    const userId = req.userId!;
    const { id } = req.params;
    const { cadenceDays } = req.body;

    if (typeof cadenceDays !== 'number' || cadenceDays < 1) {
      res.status(400).json({ error: 'cadenceDays must be a positive number' });
      return;
    }

    const docResult = await query(
      'SELECT id, user_id FROM documents WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (!docResult.rows[0]) { res.status(404).json({ error: 'Document not found' }); return; }

    // Setting a cadence counts as a review
    await query(
      'UPDATE documents SET review_cadence_days = $1, last_reviewed_at = $2 WHERE id = $3',
      [cadenceDays, new Date().toISOString(), id]
    );

    await query(
      'INSERT INTO review_events (document_id, user_id, action, metadata) VALUES ($1, $2, $3, $4)',
      [id, userId, 'set_cadence', JSON.stringify({ cadenceDays })]
    );

    // Clear stale threshold notifications for this document (new cadence cycle starts fresh)
    await query(
      `DELETE FROM notification_logs
       WHERE user_id = $1
         AND notification_type IN ('email:document_review_due_soon', 'email:document_review_overdue')
         AND metadata->>'documentId' = $2`,
      [userId, id]
    );

    // Mark existing in-app review notifications for this document as read
    await query(
      `UPDATE in_app_notifications
       SET read = true
       WHERE user_id = $1
         AND type IN ('review_due_soon', 'review_overdue')
         AND metadata->>'documentId' = $2
         AND read = false`,
      [userId, id]
    );

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
    const userId = req.userId!;
    const { id } = req.params;
    const { relatedDocumentId, relationshipType } = req.body;

    if (!relatedDocumentId) {
      res.status(400).json({ error: 'relatedDocumentId is required' });
      return;
    }

    // Verify both documents belong to user
    const docsResult = await query(
      'SELECT id FROM documents WHERE user_id = $1 AND id = ANY($2)',
      [userId, [id, relatedDocumentId]]
    );

    if (!docsResult.rows || docsResult.rows.length !== 2) {
      res.status(404).json({ error: 'One or both documents not found' });
      return;
    }

    try {
      await query(
        'INSERT INTO document_relationships (user_id, source_document_id, related_document_id, relationship_type) VALUES ($1, $2, $3, $4)',
        [userId, id, relatedDocumentId, relationshipType || 'related']
      );
    } catch (insertErr: any) {
      if (insertErr.code === '23505') {
        res.status(409).json({ error: 'Relationship already exists' });
        return;
      }
      throw insertErr;
    }

    await query(
      'INSERT INTO review_events (document_id, user_id, action, metadata) VALUES ($1, $2, $3, $4)',
      [id, userId, 'linked_document', JSON.stringify({ relatedDocumentId, relationshipType })]
    );

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
    const userId = req.userId!;

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
    const userId = req.userId!;
    const { key } = req.params;
    const { markedAsUploaded } = req.body;

    await query(
      `INSERT INTO gap_dismissals (user_id, suggestion_key, source_category, marked_as_uploaded)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, suggestion_key) DO UPDATE SET
         source_category = EXCLUDED.source_category,
         marked_as_uploaded = EXCLUDED.marked_as_uploaded`,
      [userId, key, req.body.sourceCategory || 'unknown', markedAsUploaded || false]
    );

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
    const userId = req.userId!;
    const { id } = req.params;

    const outgoingResult = await query(
      'SELECT id, related_document_id, relationship_type FROM document_relationships WHERE source_document_id = $1 AND user_id = $2',
      [id, userId]
    );

    const incomingResult = await query(
      'SELECT id, source_document_id, relationship_type FROM document_relationships WHERE related_document_id = $1 AND user_id = $2',
      [id, userId]
    );

    // Fetch names for related docs
    const relatedIds = [
      ...(outgoingResult.rows || []).map(r => r.related_document_id),
      ...(incomingResult.rows || []).map(r => r.source_document_id),
    ];

    let relatedDocs: Record<string, { name: string; category: string }> = {};
    if (relatedIds.length > 0) {
      const docsResult = await query(
        'SELECT id, name, category FROM documents WHERE id = ANY($1)',
        [relatedIds]
      );
      for (const d of docsResult.rows || []) {
        relatedDocs[d.id] = { name: d.name, category: d.category };
      }
    }

    res.json({
      success: true,
      outgoing: (outgoingResult.rows || []).map(r => ({
        ...r,
        documentName: relatedDocs[r.related_document_id]?.name,
        documentCategory: relatedDocs[r.related_document_id]?.category,
      })),
      incoming: (incomingResult.rows || []).map(r => ({
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
