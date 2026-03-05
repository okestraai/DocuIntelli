/**
 * Emergency Access & Trusted Contacts API routes
 *
 * Owner endpoints require Pro plan. Contact endpoints work on any tier.
 * Public endpoints (invite validation) require no auth.
 */

import { Router, Request, Response } from 'express';
import { loadSubscription } from '../middleware/subscriptionGuard';
import * as ea from '../services/emergencyAccessService';
import { downloadFromStorage } from '../services/storage';
import { query } from '../services/db';

const router = Router();

// ─── Helper: require Pro plan ────────────────────────────────────────────────

function requirePro(req: Request, res: Response): boolean {
  if (req.subscription?.plan !== 'pro') {
    res.status(403).json({
      success: false,
      error: 'Emergency Access requires a Pro plan',
      code: 'PRO_REQUIRED',
      upgrade_required: true,
    });
    return false;
  }
  return true;
}

// =============================================================================
// PUBLIC ROUTES (no auth) — must be registered BEFORE loadSubscription
// =============================================================================

router.get('/invite/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await ea.validateInviteToken(req.params.token);
    if (!result) {
      res.status(404).json({ success: false, error: 'Invalid or expired invitation' });
      return;
    }
    res.json({
      success: true,
      invite: {
        contactName: result.contact.display_name,
        contactEmail: result.contact.contact_email,
        ownerName: result.ownerName,
        relationship: result.contact.relationship,
      },
    });
  } catch (err: any) {
    console.error('Validate invite error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// AUTHENTICATED ROUTES — all require loadSubscription
// =============================================================================

router.use(loadSubscription);

// ---------------------------------------------------------------------------
// TRUSTED CONTACTS (Owner — Pro required)
// ---------------------------------------------------------------------------

router.get('/contacts', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requirePro(req, res)) return;
    const contacts = await ea.getContactsForOwner(req.userId!);
    res.json({ success: true, contacts });
  } catch (err: any) {
    console.error('List contacts error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/contacts', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requirePro(req, res)) return;
    const { email, display_name, relationship } = req.body;
    if (!email || !display_name) {
      res.status(400).json({ success: false, error: 'email and display_name are required' });
      return;
    }
    const { contact } = await ea.createContact(req.userId!, email, display_name, relationship);
    res.json({ success: true, contact });
  } catch (err: any) {
    if (err.message?.includes('duplicate key') || err.code === '23505') {
      res.status(409).json({ success: false, error: 'This email has already been invited' });
      return;
    }
    console.error('Create contact error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/contacts/:id/resend', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requirePro(req, res)) return;
    await ea.resendInvite(req.userId!, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Resend invite error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/contacts/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requirePro(req, res)) return;
    await ea.revokeContact(req.userId!, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Revoke contact error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// EMERGENCY ACCESS GRANTS (Owner — Pro required)
// ---------------------------------------------------------------------------

router.get('/events/:eventId/grants', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requirePro(req, res)) return;
    const grants = await ea.getGrantsForEvent(req.userId!, req.params.eventId);
    res.json({ success: true, grants });
  } catch (err: any) {
    console.error('List grants error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/events/:eventId/grants', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requirePro(req, res)) return;
    const { contact_id, access_policy, delay_hours, notes } = req.body;
    if (!contact_id || !access_policy) {
      res.status(400).json({ success: false, error: 'contact_id and access_policy are required' });
      return;
    }
    const grant = await ea.createGrant(
      req.userId!, req.params.eventId, contact_id, access_policy, delay_hours, notes
    );
    res.json({ success: true, grant });
  } catch (err: any) {
    if (err.message?.includes('duplicate key') || err.code === '23505') {
      res.status(409).json({ success: false, error: 'This contact already has a grant for this life event' });
      return;
    }
    console.error('Create grant error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

router.patch('/grants/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requirePro(req, res)) return;
    const { access_policy, delay_hours, notes } = req.body;
    const grant = await ea.updateGrant(req.userId!, req.params.id, { access_policy, delay_hours, notes });
    res.json({ success: true, grant });
  } catch (err: any) {
    console.error('Update grant error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/grants/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requirePro(req, res)) return;
    await ea.revokeGrant(req.userId!, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Revoke grant error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// APPROVALS (Owner — Pro required)
// ---------------------------------------------------------------------------

router.get('/approvals/pending', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requirePro(req, res)) return;
    const approvals = await ea.getPendingApprovals(req.userId!);
    res.json({ success: true, approvals });
  } catch (err: any) {
    console.error('Pending approvals error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/approvals/:grantId/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requirePro(req, res)) return;
    await ea.approveAccess(req.userId!, req.params.grantId);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Approve access error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/approvals/:grantId/deny', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requirePro(req, res)) return;
    await ea.denyAccess(req.userId!, req.params.grantId);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Deny access error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/approvals/:grantId/veto', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requirePro(req, res)) return;
    await ea.vetoAccess(req.userId!, req.params.grantId);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Veto access error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// AUDIT LOG (Owner — Pro required)
// ---------------------------------------------------------------------------

router.get('/audit', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requirePro(req, res)) return;
    const entries = await ea.getAuditLog(req.userId!);
    res.json({ success: true, entries });
  } catch (err: any) {
    console.error('Audit log error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/audit/:grantId', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requirePro(req, res)) return;
    const entries = await ea.getAuditLog(req.userId!, req.params.grantId);
    res.json({ success: true, entries });
  } catch (err: any) {
    console.error('Grant audit log error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// INVITE ACCEPTANCE (Authenticated — any tier)
// ---------------------------------------------------------------------------

router.post('/invite/:token/accept', async (req: Request, res: Response): Promise<void> => {
  try {
    const contact = await ea.acceptInvite(req.params.token, req.userId!);
    res.json({ success: true, contact });
  } catch (err: any) {
    console.error('Accept invite error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/invite/:token/decline', async (req: Request, res: Response): Promise<void> => {
  try {
    // Decline is a soft no — just validate the token exists
    const valid = await ea.validateInviteToken(req.params.token);
    if (!valid) {
      res.status(404).json({ success: false, error: 'Invalid or expired invitation' });
      return;
    }
    // We don't track declines explicitly — the contact simply doesn't accept
    res.json({ success: true });
  } catch (err: any) {
    console.error('Decline invite error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// SHARED WITH ME (Contact — any tier)
// ---------------------------------------------------------------------------

router.get('/shared', async (req: Request, res: Response): Promise<void> => {
  try {
    const events = await ea.getSharedWithMe(req.userId!);
    res.json({ success: true, events });
  } catch (err: any) {
    console.error('Shared with me error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/shared/:grantId', async (req: Request, res: Response): Promise<void> => {
  try {
    const detail = await ea.getSharedEventDetail(req.userId!, req.params.grantId);
    res.json({ success: true, ...detail });
  } catch (err: any) {
    console.error('Shared event detail error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/shared/:grantId/request', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await ea.requestAccess(req.userId!, req.params.grantId, {
      ip: req.ip || undefined,
      ua: req.headers['user-agent'] || undefined,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Request access error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/shared/:grantId/docs/:docId/url', async (req: Request, res: Response): Promise<void> => {
  try {
    const url = await ea.getDocumentUrl(
      req.userId!,
      req.params.grantId,
      req.params.docId,
      { ip: req.ip || undefined, ua: req.headers['user-agent'] || undefined }
    );
    res.json({ success: true, url });
  } catch (err: any) {
    console.error('Document URL error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /shared/:grantId/docs/:docId/content
 * Stream shared document content through the backend (avoids CORS issues with Azure Blob)
 */
router.get('/shared/:grantId/docs/:docId/content', async (req: Request, res: Response): Promise<void> => {
  try {
    const { grantId, docId } = req.params;
    const contactUserId = req.userId!;

    // Validate access chain (same as getDocumentUrl)
    const grantResult = await query(
      `SELECT eag.life_event_id
       FROM emergency_access_grants eag
       JOIN trusted_contacts tc ON tc.id = eag.trusted_contact_id
       WHERE eag.id = $1 AND tc.contact_user_id = $2 AND eag.is_active = true
         AND eag.request_status IN ('approved', 'auto_granted')`,
      [grantId, contactUserId]
    );
    if (!grantResult.rows[0]) {
      res.status(403).json({ success: false, error: 'Access not granted' });
      return;
    }

    const lifeEventId = grantResult.rows[0].life_event_id;

    // Verify document belongs to the life event and get file info
    const docResult = await query(
      `SELECT d.file_path, d.type, d.name FROM documents d
       WHERE d.id = $1
         AND (
           EXISTS (SELECT 1 FROM life_event_requirement_matches lerm WHERE lerm.document_id = d.id AND lerm.life_event_id = $2)
           OR EXISTS (SELECT 1 FROM life_event_custom_requirements lecr WHERE lecr.document_id = d.id AND lecr.life_event_id = $2)
         )`,
      [docId, lifeEventId]
    );
    if (!docResult.rows[0] || !docResult.rows[0].file_path) {
      res.status(404).json({ success: false, error: 'Document not found in this life event' });
      return;
    }

    const { file_path, type, name } = docResult.rows[0];
    const buffer = await downloadFromStorage(file_path);

    res.setHeader('Content-Type', type || 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);
    res.send(buffer);
  } catch (err: any) {
    console.error('Shared document content error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch document content' });
  }
});

export default router;
