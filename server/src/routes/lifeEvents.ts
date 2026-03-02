/**
 * Life Events API routes
 */

import { Router, Request, Response } from 'express';
import { loadSubscription } from '../middleware/subscriptionGuard';
import {
  LIFE_EVENT_TEMPLATES,
  getTemplateById,
} from '../config/lifeEventTemplates';
import { computeReadiness, getReadinessSnapshot } from '../services/readinessEngine';
import { sendNotificationEmail, resolveUserInfo } from '../services/emailService';
import { query } from '../services/db';

const router = Router();
router.use(loadSubscription);

// ---------------------------------------------------------------------------
// GET /life-events/templates — list all available templates
// ---------------------------------------------------------------------------
router.get('/templates', (_req: Request, res: Response) => {
  const templates = LIFE_EVENT_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    icon: t.icon,
    intakeQuestions: t.intakeQuestions,
    requirementCount: t.requirements.length,
    sections: [...new Set(t.requirements.map((r) => r.section))],
  }));
  res.json({ success: true, templates });
});

// ---------------------------------------------------------------------------
// GET /life-events/templates/:id — single template detail
// ---------------------------------------------------------------------------
router.get('/templates/:id', (req: Request, res: Response) => {
  const template = getTemplateById(req.params.id);
  if (!template) {
    res.status(404).json({ success: false, error: 'Template not found' });
    return;
  }
  res.json({ success: true, template });
});

// ---------------------------------------------------------------------------
// POST /life-events — create a new life event
// ---------------------------------------------------------------------------
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { template_id, intake_answers } = req.body;

    if (!template_id) {
      res.status(400).json({ success: false, error: 'template_id is required' });
      return;
    }

    const template = getTemplateById(template_id);
    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    const eventResult = await query(
      `INSERT INTO life_events (user_id, template_id, title, intake_answers)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, template_id, template.name, JSON.stringify(intake_answers || {})]
    );
    const event = eventResult.rows[0];

    // Run initial matching
    const readiness = await computeReadiness(event.id, userId);

    // Send life event created email (non-blocking)
    resolveUserInfo(userId).then(userInfo => {
      if (userInfo) {
        const matchedCount = readiness.requirements?.filter(
          (r: any) => r.status === 'met' || r.status === 'needs_update'
        ).length || 0;

        sendNotificationEmail(userId, 'life_event_created', {
          userName: userInfo.userName,
          eventTitle: template.name,
          templateName: template.name,
          requirementsCount: template.requirements.length,
          readinessScore: readiness.readinessScore || 0,
          matchedDocuments: matchedCount,
        }).catch(emailErr => console.error('Life event email failed:', emailErr));
      }
    });

    res.json({ success: true, event, readiness });
  } catch (err: any) {
    console.error('Create life event error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /life-events — list user's events
// ---------------------------------------------------------------------------
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const status = (req.query.status as string) || 'active';

    const eventsResult = await query(
      'SELECT * FROM life_events WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC',
      [userId, status]
    );
    const events = eventsResult.rows || [];

    // Enrich with template metadata
    const enriched = events.map((ev: any) => {
      const tmpl = getTemplateById(ev.template_id);
      return {
        ...ev,
        templateName: tmpl?.name || ev.template_id,
        templateIcon: tmpl?.icon || 'FileText',
        requirementCount: tmpl?.requirements.length || 0,
      };
    });

    res.json({ success: true, events: enriched });
  } catch (err: any) {
    console.error('List life events error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /life-events/:id — event detail with full readiness
// ---------------------------------------------------------------------------
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const eventId = req.params.id;

    const eventResult = await query(
      'SELECT * FROM life_events WHERE id = $1 AND user_id = $2',
      [eventId, userId]
    );
    const event = eventResult.rows[0];

    if (!event) {
      res.status(404).json({ success: false, error: 'Life event not found' });
      return;
    }

    const template = getTemplateById(event.template_id);
    const readiness = await computeReadiness(eventId, userId);

    // Enrich template with custom requirements so frontend can group by section
    const customReqsResult = await query(
      'SELECT * FROM life_event_custom_requirements WHERE life_event_id = $1 ORDER BY created_at ASC',
      [eventId]
    );
    const customReqs = customReqsResult.rows || [];

    const enrichedTemplate = template ? {
      ...template,
      requirements: [
        ...template.requirements,
        ...customReqs.map((cr: any) => ({
          id: `custom-${cr.id}`,
          title: cr.title,
          description: cr.description || '',
          section: cr.section || 'Custom',
          docCategories: [],
          suggestedTags: [],
          keywords: [],
          validation: {},
          weight: 1,
        })),
      ],
    } : template;

    res.json({
      success: true,
      event: {
        ...event,
        templateName: template?.name,
        templateIcon: template?.icon,
      },
      template: enrichedTemplate,
      readiness,
    });
  } catch (err: any) {
    console.error('Get life event error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /life-events/:id/recompute — re-run matching & scoring
// ---------------------------------------------------------------------------
router.post('/:id/recompute', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const readiness = await computeReadiness(req.params.id, userId);
    res.json({ success: true, readiness });
  } catch (err: any) {
    console.error('Recompute error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /life-events/:id/requirements/:rid/not-applicable
// ---------------------------------------------------------------------------
router.post(
  '/:id/requirements/:rid/not-applicable',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { id: eventId, rid } = req.params;
      const { reason } = req.body;

      // Verify ownership
      const eventResult = await query(
        'SELECT id FROM life_events WHERE id = $1 AND user_id = $2',
        [eventId, userId]
      );

      if (!eventResult.rows[0]) {
        res.status(404).json({ success: false, error: 'Event not found' });
        return;
      }

      await query(
        `INSERT INTO life_event_requirement_status (life_event_id, requirement_id, status, not_applicable_reason, updated_at)
         VALUES ($1, $2, 'not_applicable', $3, $4)
         ON CONFLICT (life_event_id, requirement_id) DO UPDATE SET
           status = 'not_applicable',
           not_applicable_reason = EXCLUDED.not_applicable_reason,
           updated_at = EXCLUDED.updated_at`,
        [eventId, rid, reason || null, new Date().toISOString()]
      );

      // Recompute
      const readiness = await computeReadiness(eventId, userId);
      res.json({ success: true, readiness });
    } catch (err: any) {
      console.error('Not-applicable error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /life-events/:id/requirements/:rid/match — manual match
// ---------------------------------------------------------------------------
router.post(
  '/:id/requirements/:rid/match',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { id: eventId, rid } = req.params;
      const { document_id } = req.body;

      if (!document_id) {
        res.status(400).json({ success: false, error: 'document_id is required' });
        return;
      }

      // Verify ownership of event
      const eventResult = await query(
        'SELECT id FROM life_events WHERE id = $1 AND user_id = $2',
        [eventId, userId]
      );

      if (!eventResult.rows[0]) {
        res.status(404).json({ success: false, error: 'Event not found' });
        return;
      }

      // Verify ownership of document
      const docResult = await query(
        'SELECT id FROM documents WHERE id = $1 AND user_id = $2',
        [document_id, userId]
      );

      if (!docResult.rows[0]) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      // Remove existing non-manual matches for this requirement
      await query(
        `DELETE FROM life_event_requirement_matches
         WHERE life_event_id = $1 AND requirement_id = $2 AND match_method != 'manual'`,
        [eventId, rid]
      );

      // Insert manual match
      await query(
        `INSERT INTO life_event_requirement_matches (life_event_id, requirement_id, document_id, confidence, match_method)
         VALUES ($1, $2, $3, 1.0, 'manual')
         ON CONFLICT (life_event_id, requirement_id, document_id) DO UPDATE SET
           confidence = 1.0,
           match_method = 'manual'`,
        [eventId, rid, document_id]
      );

      const readiness = await computeReadiness(eventId, userId);
      res.json({ success: true, readiness });
    } catch (err: any) {
      console.error('Manual match error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /life-events/:id/requirements/:rid/unmatch — remove manual match
// ---------------------------------------------------------------------------
router.post(
  '/:id/requirements/:rid/unmatch',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { id: eventId, rid } = req.params;

      // Delete ALL matches for this requirement (manual, deterministic, heuristic)
      await query(
        'DELETE FROM life_event_requirement_matches WHERE life_event_id = $1 AND requirement_id = $2',
        [eventId, rid]
      );

      // Set status to missing
      await query(
        `INSERT INTO life_event_requirement_status (life_event_id, requirement_id, status, updated_at)
         VALUES ($1, $2, 'missing', $3)
         ON CONFLICT (life_event_id, requirement_id) DO UPDATE SET
           status = 'missing',
           updated_at = EXCLUDED.updated_at`,
        [eventId, rid, new Date().toISOString()]
      );

      // Return a snapshot (no re-matching) so the removed doc stays removed
      const readiness = await getReadinessSnapshot(eventId, userId);
      res.json({ success: true, readiness });
    } catch (err: any) {
      console.error('Unmatch error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /life-events/:id/archive — archive an event
// ---------------------------------------------------------------------------
router.post('/:id/archive', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const eventId = req.params.id;

    // Get event details before archiving
    const eventResult = await query(
      'SELECT * FROM life_events WHERE id = $1 AND user_id = $2',
      [eventId, userId]
    );
    const event = eventResult.rows[0];

    await query(
      `UPDATE life_events SET status = 'archived' WHERE id = $1 AND user_id = $2`,
      [eventId, userId]
    );

    // Send archive email (non-blocking)
    if (event) {
      const template = getTemplateById(event.template_id);
      const readiness = await computeReadiness(eventId, userId);
      const totalReqs = template?.requirements.length || 0;
      const metReqs = readiness.requirements?.filter(
        (r: any) => r.status === 'met' || r.status === 'needs_update'
      ).length || 0;

      resolveUserInfo(userId).then(userInfo => {
        if (userInfo) {
          sendNotificationEmail(userId, 'life_event_archived', {
            userName: userInfo.userName,
            eventTitle: event.title,
            completionStatus: readiness.readinessScore >= 100 ? 'completed' : 'archived',
            finalScore: readiness.readinessScore || 0,
            requirementsMet: metReqs,
            totalRequirements: totalReqs,
          }).catch(() => {});
        }
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('Archive error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /life-events/:id/unarchive — restore an archived event
// ---------------------------------------------------------------------------
router.post('/:id/unarchive', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    await query(
      `UPDATE life_events SET status = 'active' WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error('Unarchive error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /life-events/:id/export — printable summary
// ---------------------------------------------------------------------------
router.get('/:id/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const eventId = req.params.id;

    const eventResult = await query(
      'SELECT * FROM life_events WHERE id = $1 AND user_id = $2',
      [eventId, userId]
    );
    const event = eventResult.rows[0];

    if (!event) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }

    const template = getTemplateById(event.template_id);
    const readiness = await computeReadiness(eventId, userId);

    // Load custom requirements for export lookup
    const customReqsResult = await query(
      'SELECT * FROM life_event_custom_requirements WHERE life_event_id = $1',
      [eventId]
    );
    const customReqs = customReqsResult.rows || [];

    const allReqs = [
      ...(template?.requirements || []),
      ...customReqs.map((cr: any) => ({
        id: `custom-${cr.id}`,
        title: cr.title,
        section: cr.section || 'Custom',
      })),
    ];

    // Build a simple structured export
    const exportData = {
      title: event.title,
      templateName: template?.name || event.template_id,
      dateStarted: event.created_at,
      readinessScore: readiness.readinessScore,
      sections: {} as Record<string, any[]>,
    };

    for (const req of readiness.requirements) {
      const tmplReq = allReqs.find((r) => r.id === req.requirementId);
      if (!tmplReq) continue;
      const section = tmplReq.section;
      if (!exportData.sections[section]) exportData.sections[section] = [];
      exportData.sections[section].push({
        title: tmplReq.title,
        status: req.status,
        matchedDocument: req.matchedDocuments[0]?.documentName || null,
        suggestedAction: req.suggestedAction,
      });
    }

    res.json({ success: true, export: exportData });
  } catch (err: any) {
    console.error('Export error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /life-events/:id/custom-requirements — add a custom requirement
// ---------------------------------------------------------------------------
router.post('/:id/custom-requirements', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id: eventId } = req.params;
    const { title } = req.body;

    if (!title || !title.trim()) {
      res.status(400).json({ success: false, error: 'Title is required' });
      return;
    }

    const eventResult = await query(
      'SELECT id FROM life_events WHERE id = $1 AND user_id = $2',
      [eventId, userId]
    );

    if (!eventResult.rows[0]) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }

    const section = req.body.section?.trim() || 'Custom';

    await query(
      'INSERT INTO life_event_custom_requirements (life_event_id, title, section) VALUES ($1, $2, $3)',
      [eventId, title.trim(), section]
    );

    const readiness = await getReadinessSnapshot(eventId, userId);
    res.json({ success: true, readiness });
  } catch (err: any) {
    console.error('Add custom requirement error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /life-events/:id/custom-requirements/:crid — edit title/section
// ---------------------------------------------------------------------------
router.put('/:id/custom-requirements/:crid', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id: eventId, crid } = req.params;
    const { title, section } = req.body;

    const eventResult = await query(
      'SELECT id FROM life_events WHERE id = $1 AND user_id = $2',
      [eventId, userId]
    );

    if (!eventResult.rows[0]) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (title !== undefined) {
      setClauses.push(`title = $${paramIdx}`);
      params.push(title.trim());
      paramIdx++;
    }
    if (section !== undefined) {
      setClauses.push(`section = $${paramIdx}`);
      params.push(section.trim());
      paramIdx++;
    }

    if (setClauses.length === 0) {
      res.status(400).json({ success: false, error: 'Nothing to update' });
      return;
    }

    params.push(crid, eventId);
    await query(
      `UPDATE life_event_custom_requirements SET ${setClauses.join(', ')} WHERE id = $${paramIdx} AND life_event_id = $${paramIdx + 1}`,
      params
    );

    const readiness = await getReadinessSnapshot(eventId, userId);
    res.json({ success: true, readiness });
  } catch (err: any) {
    console.error('Update custom requirement error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /life-events/:id/custom-requirements/:crid
// ---------------------------------------------------------------------------
router.delete('/:id/custom-requirements/:crid', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id: eventId, crid } = req.params;

    const eventResult = await query(
      'SELECT id FROM life_events WHERE id = $1 AND user_id = $2',
      [eventId, userId]
    );

    if (!eventResult.rows[0]) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }

    await query(
      'DELETE FROM life_event_custom_requirements WHERE id = $1 AND life_event_id = $2',
      [crid, eventId]
    );

    const readiness = await getReadinessSnapshot(eventId, userId);
    res.json({ success: true, readiness });
  } catch (err: any) {
    console.error('Delete custom requirement error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /life-events/:id/custom-requirements/:crid/match
// ---------------------------------------------------------------------------
router.post('/:id/custom-requirements/:crid/match', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id: eventId, crid } = req.params;
    const { document_id } = req.body;

    if (!document_id) {
      res.status(400).json({ success: false, error: 'document_id is required' });
      return;
    }

    const docResult = await query(
      'SELECT id FROM documents WHERE id = $1 AND user_id = $2',
      [document_id, userId]
    );

    if (!docResult.rows[0]) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    await query(
      'UPDATE life_event_custom_requirements SET document_id = $1 WHERE id = $2 AND life_event_id = $3',
      [document_id, crid, eventId]
    );

    const readiness = await getReadinessSnapshot(eventId, userId);
    res.json({ success: true, readiness });
  } catch (err: any) {
    console.error('Custom match error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /life-events/:id/custom-requirements/:crid/unmatch
// ---------------------------------------------------------------------------
router.post('/:id/custom-requirements/:crid/unmatch', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id: eventId, crid } = req.params;

    await query(
      'UPDATE life_event_custom_requirements SET document_id = NULL WHERE id = $1 AND life_event_id = $2',
      [crid, eventId]
    );

    const readiness = await getReadinessSnapshot(eventId, userId);
    res.json({ success: true, readiness });
  } catch (err: any) {
    console.error('Custom unmatch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
