import { Router, Request, Response } from 'express';
import { query } from '../services/db';
import {
  loadSubscription,
  checkDocumentLimit,
  checkMonthlyUploadLimit,
  checkDunningRestriction,
  incrementMonthlyUploads,
  logFeatureUsage,
  invalidateDocCountCache,
  invalidateSubscriptionCache,
} from '../middleware/subscriptionGuard';
import { verifyAccessToken } from '../services/authService';
import { uploadToStorage } from '../services/storage';
import { getProvider, getSupportedProviders } from '../services/cloudStorage';
import {
  getValidAccessToken,
  saveConnection,
  removeConnection,
  getConnection,
  getUserConnections,
} from '../services/cloudStorage/tokenManager';
import { processDocumentPipeline } from '../services/documentPipeline';

const router = Router();
const APP_URL = process.env.APP_URL || 'https://docuintelli.com';

/**
 * GET /providers
 * List supported cloud providers and the user's connection status for each.
 */
router.get('/providers', loadSubscription, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const connections = await getUserConnections(userId);
    const connectedMap = new Map(connections.map(c => [c.provider, c]));

    const providers = getSupportedProviders().map(name => {
      const conn = connectedMap.get(name);
      return {
        name,
        displayName: formatProviderName(name),
        connected: !!conn,
        email: conn?.provider_email || undefined,
      };
    });

    res.json({ success: true, providers });
  } catch (err: any) {
    console.error('Cloud storage providers error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load providers' });
  }
});

/**
 * GET /:provider/connect
 * Initiate OAuth flow — redirects to provider's authorization page.
 * Uses ?token= query param for auth since this is a browser redirect (no Authorization header).
 */
router.get('/:provider/connect', async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider: providerName } = req.params;
    const token = req.query.token as string;

    if (!token) {
      res.status(401).json({ error: 'Missing token parameter' });
      return;
    }

    let decoded: { userId: string; email: string };
    try {
      decoded = verifyAccessToken(token);
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const userId = decoded.userId;
    const provider = getProvider(providerName);
    const redirectTo = (req.query.redirect_to as string) || `${APP_URL}/vault`;

    // Sign state with JWT to prevent CSRF and carry redirect info
    const jwt = await import('jsonwebtoken');
    const state = jwt.default.sign(
      { userId, redirect_to: redirectTo, provider: providerName },
      process.env.JWT_SECRET!,
      { expiresIn: '10m' }
    );

    const callbackUrl = `${APP_URL}/api/cloud-storage/${providerName}/callback`;
    const authUrl = provider.getAuthUrl(state, callbackUrl);

    res.redirect(authUrl);
  } catch (err: any) {
    console.error('Cloud storage connect error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /:provider/callback
 * OAuth callback — exchanges code for tokens, stores connection, redirects to frontend.
 */
router.get('/:provider/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider: providerName } = req.params;
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      console.error(`Cloud storage OAuth error (${providerName}):`, oauthError);
      res.redirect(`${APP_URL}/vault?cloud_error=${encodeURIComponent(String(oauthError))}`);
      return;
    }

    if (!code || !state) {
      res.redirect(`${APP_URL}/vault?cloud_error=missing_code`);
      return;
    }

    // Verify state JWT
    const jwt = await import('jsonwebtoken');
    let statePayload: { userId: string; redirect_to: string; provider: string };
    try {
      statePayload = jwt.default.verify(String(state), process.env.JWT_SECRET!) as any;
    } catch {
      res.redirect(`${APP_URL}/vault?cloud_error=invalid_state`);
      return;
    }

    if (statePayload.provider !== providerName) {
      res.redirect(`${APP_URL}/vault?cloud_error=provider_mismatch`);
      return;
    }

    const provider = getProvider(providerName);
    const callbackUrl = `${APP_URL}/api/cloud-storage/${providerName}/callback`;
    const tokens = await provider.exchangeCode(String(code), callbackUrl);

    await saveConnection(statePayload.userId, providerName, tokens, tokens.email);

    console.log(`✅ Cloud storage connected: ${providerName} for user ${statePayload.userId}`);

    const redirectUrl = new URL(statePayload.redirect_to || `${APP_URL}/vault`);
    redirectUrl.searchParams.set('cloud_connected', providerName);
    res.redirect(redirectUrl.toString());
  } catch (err: any) {
    console.error('Cloud storage callback error:', err.message);
    res.redirect(`${APP_URL}/vault?cloud_error=callback_failed`);
  }
});

/**
 * DELETE /:provider/disconnect
 * Revoke tokens and mark connection as revoked.
 */
router.delete('/:provider/disconnect', loadSubscription, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { provider: providerName } = req.params;

    await removeConnection(userId, providerName);
    console.log(`🔌 Cloud storage disconnected: ${providerName} for user ${userId}`);

    res.json({ success: true });
  } catch (err: any) {
    console.error('Cloud storage disconnect error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to disconnect' });
  }
});

/**
 * GET /:provider/files
 * Browse files in the connected cloud storage account.
 * Query params: folderId (optional), pageToken (optional)
 */
router.get('/:provider/files', loadSubscription, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { provider: providerName } = req.params;
    const folderId = req.query.folderId as string | undefined;
    const pageToken = req.query.pageToken as string | undefined;

    const accessToken = await getValidAccessToken(userId, providerName);
    const provider = getProvider(providerName);

    const result = await provider.listFiles(accessToken, folderId || undefined, pageToken || undefined);

    res.json({ success: true, files: result.files, nextPageToken: result.nextPageToken });
  } catch (err: any) {
    console.error('Cloud storage browse error:', err.message);

    // If token is expired/revoked, return 401 so frontend can prompt reconnect
    if (err.message.includes('expired') || err.message.includes('revoked') || err.message.includes('reconnect')) {
      res.status(401).json({ success: false, error: err.message, needsReconnect: true });
      return;
    }

    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /:provider/import
 * Import selected files from cloud storage.
 * Body: { files: [{ fileId, name, category, expirationDate? }] }
 */
router.post(
  '/:provider/import',
  loadSubscription,
  checkDunningRestriction,
  checkDocumentLimit,
  checkMonthlyUploadLimit,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const subscription = req.subscription!;
      const { provider: providerName } = req.params;
      const { files } = req.body;

      if (!Array.isArray(files) || files.length === 0) {
        res.status(400).json({ success: false, error: 'No files specified for import' });
        return;
      }

      // Cap batch size to prevent abuse
      if (files.length > 10) {
        res.status(400).json({ success: false, error: 'Maximum 10 files per import batch' });
        return;
      }

      const accessToken = await getValidAccessToken(userId, providerName);
      const provider = getProvider(providerName);
      const connection = await getConnection(userId, providerName);

      const results: Array<{ fileId: string; documentId?: string; status: string; error?: string }> = [];

      for (const file of files) {
        const { fileId, name, category, expirationDate } = file;

        if (!fileId || !name || !category) {
          results.push({ fileId, status: 'skipped', error: 'Missing required fields (fileId, name, category)' });
          continue;
        }

        // Check deduplication
        const existingDoc = await query(
          'SELECT id FROM documents WHERE cloud_file_id = $1 AND user_id = $2',
          [fileId, userId]
        );
        if (existingDoc.rows.length > 0) {
          results.push({ fileId, documentId: existingDoc.rows[0].id, status: 'already_imported' });
          continue;
        }

        try {
          // Download file from cloud provider
          console.log(`☁️ Downloading ${name} from ${providerName}...`);
          const downloaded = await provider.downloadFile(accessToken, fileId);

          // Upload to Azure Blob Storage (same as regular uploads)
          const uploadResult = await uploadToStorage(
            downloaded.buffer,
            userId,
            downloaded.fileName,
            downloaded.mimeType
          );

          if (!uploadResult.success) {
            results.push({ fileId, status: 'failed', error: uploadResult.error || 'Failed to store file' });
            continue;
          }

          // Insert document record with file_path (standard flow)
          const insertResult = await query(
            `INSERT INTO documents (user_id, name, category, type, size, file_path, original_name, upload_date, expiration_date, status, processed, source, cloud_file_id, cloud_source_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING *`,
            [
              userId,
              name.trim(),
              category,
              downloaded.mimeType,
              downloaded.buffer.length,
              uploadResult.filePath,
              downloaded.fileName,
              new Date().toISOString().split('T')[0],
              expirationDate || null,
              'active',
              false,
              providerName,
              fileId,
              connection?.id || null,
            ]
          );

          const documentData = insertResult.rows[0];
          if (!documentData) {
            results.push({ fileId, status: 'failed', error: 'Failed to save document metadata' });
            continue;
          }

          // Increment upload counter
          await incrementMonthlyUploads(subscription.id, subscription.monthly_uploads_used);
          await invalidateDocCountCache(userId);
          await invalidateSubscriptionCache(userId);

          // Log feature usage
          await logFeatureUsage(userId, 'cloud_import', {
            plan: subscription.plan,
            document_id: documentData.id,
            provider: providerName,
            file_type: downloaded.mimeType,
            file_size: downloaded.buffer.length,
          });

          // Trigger processing pipeline (non-blocking)
          processDocumentPipeline({
            documentId: documentData.id,
            userId,
            documentName: name.trim(),
            category,
            expirationDate,
            buffer: downloaded.buffer,
            mimeType: downloaded.mimeType,
          });

          results.push({ fileId, documentId: documentData.id, status: 'imported' });
          console.log(`✅ Cloud import complete: ${name} → ${documentData.id}`);
        } catch (fileErr: any) {
          console.error(`❌ Failed to import ${name} from ${providerName}:`, fileErr.message);
          results.push({ fileId, status: 'failed', error: fileErr.message });
        }
      }

      res.json({ success: true, imported: results });
    } catch (err: any) {
      console.error('Cloud storage import error:', err.message);

      if (err.message.includes('expired') || err.message.includes('reconnect')) {
        res.status(401).json({ success: false, error: err.message, needsReconnect: true });
        return;
      }

      res.status(500).json({ success: false, error: err.message });
    }
  }
);

function formatProviderName(name: string): string {
  const names: Record<string, string> = {
    google_drive: 'Google Drive',
    dropbox: 'Dropbox',
    onedrive: 'OneDrive',
  };
  return names[name] || name;
}

export default router;
