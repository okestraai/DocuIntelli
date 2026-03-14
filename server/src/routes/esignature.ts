/**
 * e-Signature API Routes
 *
 * Public routes (signing) come before loadSubscription.
 * Authenticated routes (request management) come after, gated to allowed emails.
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import { loadSubscription } from '../middleware/subscriptionGuard';
import * as esig from '../services/esignatureService';
import { sendNotificationEmail } from '../services/emailService';

const WORD_EXTENSIONS = ['.doc', '.docx'];
function resolveSigningFilePath(filePath: string): string {
  if (WORD_EXTENSIONS.some(ext => filePath.toLowerCase().endsWith(ext))) {
    const ext = path.extname(filePath);
    return filePath.replace(ext, '_esign.pdf');
  }
  return filePath;
}

const router = Router();

// ─── Email Gate ─────────────────────────────────────────────────────────────
// Phase 1: hardcoded to okestraai@gmail.com for testing
const ALLOWED_INITIATOR_EMAILS = ['okestraai@gmail.com'];

function requireEsignatureAccess(req: Request, res: Response): boolean {
  if (!req.userEmail || !ALLOWED_INITIATOR_EMAILS.includes(req.userEmail.toLowerCase())) {
    res.status(403).json({
      success: false,
      error: 'e-Signature feature is not available for your account',
      code: 'ESIGNATURE_NOT_AVAILABLE',
    });
    return false;
  }
  return true;
}

// =============================================================================
// PUBLIC ROUTES — no auth required (signing experience)
// =============================================================================

/**
 * Validate a signing token and return request info.
 */
router.get('/sign/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await esig.validateSigningToken(req.params.token);
    if (!result) {
      res.status(404).json({ success: false, error: 'Invalid or expired signing link' });
      return;
    }

    res.json({
      success: true,
      data: {
        signer: {
          id: result.signer.id,
          name: result.signer.signer_name,
          email: result.signer.signer_email,
          status: result.signer.status,
        },
        request: {
          id: result.request.id,
          title: result.request.title,
          message: result.request.message,
          documentName: result.request.document_name,
          ownerName: result.request.owner_name,
          signingOrder: result.request.signing_order,
        },
      },
    });
  } catch (err: any) {
    console.error('Validate signing token error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get fields assigned to the signer (token-based auth).
 */
router.post('/sign/:token/fields', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await esig.validateSigningToken(req.params.token);
    if (!result) {
      res.status(404).json({ success: false, error: 'Invalid or expired signing link' });
      return;
    }

    // Mark as viewed
    await esig.markSignerViewed(
      result.signer.id,
      result.request.id,
      req.ip || undefined,
      req.headers['user-agent'] || undefined
    );

    const fields = await esig.getSignerFields(result.signer.id);

    res.json({
      success: true,
      data: {
        fields,
        documentName: result.request.document_name,
        documentId: result.request.document_id,
      },
    });
  } catch (err: any) {
    console.error('Get signer fields error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Fill a field value (token-based auth).
 */
router.post('/sign/:token/fill', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await esig.validateSigningToken(req.params.token);
    if (!result) {
      res.status(404).json({ success: false, error: 'Invalid or expired signing link' });
      return;
    }

    const { fieldId, value } = req.body;
    if (!fieldId || value === undefined) {
      res.status(400).json({ success: false, error: 'fieldId and value are required' });
      return;
    }

    await esig.fillField(
      result.signer.id,
      fieldId,
      value,
      req.ip || undefined,
      req.headers['user-agent'] || undefined
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error('Fill field error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Complete signing (token-based auth).
 */
router.post('/sign/:token/complete', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await esig.validateSigningToken(req.params.token);
    if (!result) {
      res.status(404).json({ success: false, error: 'Invalid or expired signing link' });
      return;
    }

    if (result.signer.status === 'signed') {
      res.json({ success: true, message: 'Already signed', allComplete: false });
      return;
    }

    const { allComplete, requestId } = await esig.completeSignerSigning(
      result.signer.id,
      req.ip || '0.0.0.0',
      req.headers['user-agent'] || 'Unknown'
    );

    // Send completion notifications
    try {
      if (allComplete) {
        await sendNotificationEmail(result.request.owner_id, 'signature_completed' as any, {
          documentName: result.request.document_name,
          title: result.request.title,
        });
      } else {
        await sendNotificationEmail(result.request.owner_id, 'signer_completed' as any, {
          signerName: result.signer.signer_name,
          documentName: result.request.document_name,
        });
      }
    } catch (emailErr) {
      console.error('Failed to send signing completion email:', emailErr);
    }

    res.json({
      success: true,
      allComplete,
      signerId: result.signer.id,
    });
  } catch (err: any) {
    console.error('Complete signing error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Link signer to user account (token + auth).
 */
router.post('/sign/:token/link-account', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await esig.validateSigningToken(req.params.token);
    if (!result) {
      res.status(404).json({ success: false, error: 'Invalid or expired signing link' });
      return;
    }

    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }

    await esig.linkSignerToUser(result.signer.id, userId);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Link signer account error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Capture signed document to signer's vault (token + auth).
 */
router.post('/sign/:token/vault-capture', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await esig.validateSigningToken(req.params.token);
    if (!result) {
      res.status(404).json({ success: false, error: 'Invalid or expired signing link' });
      return;
    }

    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }

    const captureResult = await esig.captureToVault(result.signer.id, userId);
    if (!captureResult.success) {
      const status = captureResult.code === 'DOCUMENT_LIMIT_REACHED' ? 403 : 400;
      res.status(status).json({ success: false, error: captureResult.error, code: captureResult.code });
      return;
    }

    res.json({ success: true, message: 'Document added to your vault' });
  } catch (err: any) {
    console.error('Vault capture error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get document PDF for signing (token-based, streams the raw PDF bytes).
 * This avoids CORS issues with direct Azure Blob Storage signed URLs.
 */
router.get('/sign/:token/document', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await esig.validateSigningToken(req.params.token);
    if (!result) {
      res.status(404).json({ success: false, error: 'Invalid or expired signing link' });
      return;
    }

    const { downloadFromStorage } = await import('../services/storage');
    const effectivePath = resolveSigningFilePath(result.request.file_path);
    const pdfBuffer = await downloadFromStorage(effectivePath);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${result.request.document_name}"`);
    res.setHeader('Content-Length', pdfBuffer.length.toString());
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('Get signing document error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// AUTHENTICATED ROUTES — require loadSubscription + email gate
// =============================================================================

router.use(loadSubscription);

/**
 * Get all signature activity for the current user (sent + received).
 * Available to ALL authenticated users, not just initiator-gated emails.
 */
router.get('/my-signatures', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.userId || !req.userEmail) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const data = await esig.getMySignatures(req.userId, req.userEmail);
    res.json({ success: true, data });
  } catch (err: any) {
    console.error('My signatures error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Authenticated signer: validate signing access by signer ID.
 * Used when navigating from the vault Signatures tab (no raw token needed).
 */
router.get('/signer/:signerId/validate', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.userId || !req.userEmail) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const result = await esig.validateSignerById(req.params.signerId, req.userEmail);
    if (!result) {
      res.status(404).json({ success: false, error: 'Signing request not found or not assigned to you' });
      return;
    }

    res.json({
      success: true,
      data: {
        signer: { id: result.signer.id, name: result.signer.signer_name, email: result.signer.signer_email, status: result.signer.status },
        request: { id: result.request.id, title: result.request.title, message: result.request.message, documentName: result.request.document_name, ownerName: result.request.owner_name },
      },
    });
  } catch (err: any) {
    console.error('Signer validate error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Authenticated signer: get assigned fields by signer ID.
 */
router.get('/signer/:signerId/fields', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.userId || !req.userEmail) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    // Verify the signer belongs to this user
    const result = await esig.validateSignerById(req.params.signerId, req.userEmail);
    if (!result) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }

    const fields = await esig.getSignerFields(req.params.signerId);
    res.json({ success: true, data: { fields } });
  } catch (err: any) {
    console.error('Signer fields error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Authenticated signer: fill a field by signer ID.
 */
router.post('/signer/:signerId/fill', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.userId || !req.userEmail) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const result = await esig.validateSignerById(req.params.signerId, req.userEmail);
    if (!result) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }

    const { fieldId, value } = req.body;
    if (!fieldId || value === undefined) {
      res.status(400).json({ success: false, error: 'fieldId and value are required' });
      return;
    }

    await esig.fillField(req.params.signerId, fieldId, value);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Signer fill error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Authenticated signer: complete signing by signer ID.
 */
router.post('/signer/:signerId/complete', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.userId || !req.userEmail) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const result = await esig.validateSignerById(req.params.signerId, req.userEmail);
    if (!result) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
    const userAgent = req.headers['user-agent'] || '';

    const completionResult = await esig.completeSignerSigning(req.params.signerId, ip, userAgent);
    res.json({ success: true, data: completionResult });
  } catch (err: any) {
    console.error('Signer complete error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Authenticated signer: get document PDF by signer ID.
 */
router.get('/signer/:signerId/document', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.userId || !req.userEmail) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const result = await esig.validateSignerById(req.params.signerId, req.userEmail);
    if (!result) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }

    const { downloadFromStorage } = await import('../services/storage');
    const effectivePath = resolveSigningFilePath(result.request.file_path);
    const pdfBuffer = await downloadFromStorage(effectivePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${result.request.document_name}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('Signer document error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Authenticated signer: capture signed doc to vault by signer ID.
 */
router.post('/signer/:signerId/vault-capture', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.userId || !req.userEmail) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const result = await esig.validateSignerById(req.params.signerId, req.userEmail);
    if (!result) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }

    const captureResult = await esig.captureToVault(req.params.signerId, req.userId);
    if (!captureResult.success) {
      const status = captureResult.code === 'DOCUMENT_LIMIT_REACHED' ? 403 : 400;
      res.status(status).json({ success: false, error: captureResult.error, code: captureResult.code });
      return;
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('Signer vault-capture error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Create a draft signature request.
 */
router.post('/requests', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requireEsignatureAccess(req, res)) return;

    const { documentId, title, message, signingOrder, signers, fields, expiresAt } = req.body;

    if (!documentId || !title || !signers || !fields) {
      res.status(400).json({ success: false, error: 'documentId, title, signers, and fields are required' });
      return;
    }

    if (!Array.isArray(signers) || signers.length === 0) {
      res.status(400).json({ success: false, error: 'At least one signer is required' });
      return;
    }

    if (!Array.isArray(fields) || fields.length === 0) {
      res.status(400).json({ success: false, error: 'At least one field is required' });
      return;
    }

    const result = await esig.createSignatureRequest(
      req.userId!,
      documentId,
      title,
      message || null,
      signingOrder || 'parallel',
      signers,
      fields,
      expiresAt
    );

    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    console.error('Create signature request error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * List all signature requests for the authenticated user.
 */
router.get('/requests', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requireEsignatureAccess(req, res)) return;

    const requests = await esig.getRequestsForOwner(req.userId!);
    res.json({ success: true, data: requests });
  } catch (err: any) {
    console.error('List signature requests error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get detail of a specific signature request.
 */
router.get('/requests/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requireEsignatureAccess(req, res)) return;

    const detail = await esig.getRequestDetail(req.userId!, req.params.id);
    if (!detail) {
      res.status(404).json({ success: false, error: 'Request not found' });
      return;
    }

    res.json({ success: true, data: detail });
  } catch (err: any) {
    console.error('Get signature request detail error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Send a signature request (lock doc + notify signers).
 */
router.post('/requests/:id/send', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requireEsignatureAccess(req, res)) return;

    const { signerTokens } = await esig.sendSignatureRequest(req.userId!, req.params.id);

    // Send email invitations to each signer (send TO the signer, not the owner)
    const APP_URL = process.env.APP_URL || 'https://www.docuintelli.com';
    for (const st of signerTokens) {
      // Skip sending email to self (owner) — they sign inline
      if (st.email.toLowerCase() === req.userEmail?.toLowerCase()) continue;

      try {
        const signingUrl = `${APP_URL}/#/sign/${st.rawToken}`;
        await sendNotificationEmail(
          req.userId!,
          'signature_request' as any,
          {
            signerName: st.name,
            signerEmail: st.email,
            signingUrl,
            documentName: req.body.documentName || 'Document',
          },
          st.email // overrideEmail — send TO the signer
        );
      } catch (emailErr) {
        console.error(`Failed to send signing invitation to ${st.email}:`, emailErr);
      }
    }

    res.json({ success: true, message: `Sent to ${signerTokens.length} signer(s)` });
  } catch (err: any) {
    console.error('Send signature request error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Complete owner's own signing (self-sign). Fills fields and marks signer as signed.
 * Called when the owner is also a signer and fills their fields in the builder.
 * fieldValues is an array of { fieldType, pageNumber, value } — matched by type + page order.
 */
router.post('/requests/:id/self-sign', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requireEsignatureAccess(req, res)) return;

    const { fieldValues } = req.body;
    if (!fieldValues || !Array.isArray(fieldValues)) {
      res.status(400).json({ success: false, error: 'fieldValues array is required' });
      return;
    }

    // Find the signer record for the owner's email in this request
    const { query: dbQuery } = await import('../services/db');
    const signerResult = await dbQuery(
      `SELECT ss.id FROM signature_signers ss
       JOIN signature_requests sr ON sr.id = ss.signature_request_id
       WHERE sr.id = $1 AND sr.owner_id = $2 AND ss.signer_email = $3`,
      [req.params.id, req.userId!, req.userEmail!.toLowerCase()]
    );

    if (signerResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'You are not a signer on this request' });
      return;
    }

    const signerId = signerResult.rows[0].id;

    // Link signer to the owner's user account
    await esig.linkSignerToUser(signerId, req.userId!);

    // Get all fields assigned to this signer (ordered by page + position)
    const dbFields = await esig.getSignerFields(signerId);

    // Match frontend field values to DB fields by index (same creation order)
    for (let i = 0; i < Math.min(fieldValues.length, dbFields.length); i++) {
      const fv = fieldValues[i];
      const dbField = dbFields[i];
      if (fv.value !== undefined && fv.value !== '' && fv.value !== null) {
        await esig.fillField(
          signerId,
          dbField.id,
          fv.value,
          req.ip || undefined,
          req.headers['user-agent'] || undefined
        );
      }
    }

    // Complete signing
    const { allComplete } = await esig.completeSignerSigning(
      signerId,
      req.ip || '0.0.0.0',
      req.headers['user-agent'] || 'Owner self-sign'
    );

    res.json({ success: true, allComplete });
  } catch (err: any) {
    console.error('Self-sign error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Void a signature request.
 */
router.post('/requests/:id/void', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requireEsignatureAccess(req, res)) return;

    const voided = await esig.voidRequest(req.userId!, req.params.id);
    if (!voided) {
      res.status(404).json({ success: false, error: 'Request not found or cannot be voided' });
      return;
    }

    res.json({ success: true, message: 'Request voided' });
  } catch (err: any) {
    console.error('Void signature request error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Delete a draft signature request.
 */
router.delete('/requests/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requireEsignatureAccess(req, res)) return;

    const deleted = await esig.deleteRequest(req.userId!, req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Draft not found or cannot be deleted' });
      return;
    }

    res.json({ success: true, message: 'Draft deleted' });
  } catch (err: any) {
    console.error('Delete signature request error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Download the signed PDF.
 */
router.get('/requests/:id/signed-pdf', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requireEsignatureAccess(req, res)) return;

    const detail = await esig.getRequestDetail(req.userId!, req.params.id);
    if (!detail) {
      res.status(404).json({ success: false, error: 'Request not found' });
      return;
    }

    if (!detail.signed_file_path) {
      res.status(400).json({ success: false, error: 'Signed PDF not yet available' });
      return;
    }

    const { getSignedUrl } = await import('../services/storage');
    const url = await getSignedUrl(detail.signed_file_path, 3600);

    res.json({ success: true, data: { url, documentName: detail.document_name } });
  } catch (err: any) {
    console.error('Download signed PDF error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Send reminders to pending signers.
 */
router.post('/requests/:id/remind', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requireEsignatureAccess(req, res)) return;

    const detail = await esig.getRequestDetail(req.userId!, req.params.id);
    if (!detail || detail.status !== 'pending') {
      res.status(404).json({ success: false, error: 'No pending request found' });
      return;
    }

    const pendingSigners = detail.signers.filter((s: any) => s.status !== 'signed');
    // Re-send notification emails (simplified — in production, would regenerate tokens or use existing)
    let reminded = 0;
    for (const signer of pendingSigners) {
      try {
        await sendNotificationEmail(req.userId!, 'signature_reminder' as any, {
          signerName: signer.signer_name,
          signerEmail: signer.signer_email,
          documentName: detail.document_name,
        });
        reminded++;
      } catch (emailErr) {
        console.error(`Failed to send reminder to ${signer.signer_email}:`, emailErr);
      }
    }

    res.json({ success: true, message: `Reminded ${reminded} signer(s)` });
  } catch (err: any) {
    console.error('Send reminders error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Save user's signature image (authenticated).
 */
router.post('/signature-image', async (req: Request, res: Response): Promise<void> => {
  try {
    const { imageType, imageData } = req.body;
    if (!imageType || !imageData) {
      res.status(400).json({ success: false, error: 'imageType and imageData required' });
      return;
    }
    if (!['signature', 'initials'].includes(imageType)) {
      res.status(400).json({ success: false, error: 'imageType must be signature or initials' });
      return;
    }

    await esig.saveSignatureImage(req.userId!, imageType, imageData);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Save signature image error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get user's saved signature image (authenticated).
 */
router.get('/signature-image/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    const imageType = req.params.type;
    if (!['signature', 'initials'].includes(imageType)) {
      res.status(400).json({ success: false, error: 'type must be signature or initials' });
      return;
    }

    const imageData = await esig.getSignatureImage(req.userId!, imageType as 'signature' | 'initials');
    res.json({ success: true, data: { imageData } });
  } catch (err: any) {
    console.error('Get signature image error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
