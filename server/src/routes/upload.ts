import { Router, Request, Response } from 'express';
import multer from 'multer';
import { query } from '../services/db';
import { uploadToStorage, deleteFromStorage, getSignedUrl, downloadFromStorage } from '../services/storage';
import { TextExtractor } from '../services/textExtractor';
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
import { sendNotificationEmail, resolveUserInfo } from '../services/emailService';
import { processDocumentPipeline } from '../services/documentPipeline';

const router = Router();

// Apply subscription loading to ALL routes
router.use(loadSubscription);

// Import services for document processing and embeddings (was edge function calls)
import { processDocumentVLLMEmbeddings } from '../services/vllmEmbeddings';
import { processDocument as reprocessDocument } from '../services/chunking';
import { extractDocumentMetadata } from '../services/metadataExtractor';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

router.post('/upload', upload.single('file'), checkDunningRestriction, checkDocumentLimit, checkMonthlyUploadLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const subscription = req.subscription!;

    console.log('📥 Upload request received');
    console.log('User:', { id: userId, plan: subscription.plan });
    console.log('Body:', { name: req.body.name, category: req.body.category });
    console.log('File:', req.file ? { name: req.file.originalname, size: req.file.size, type: req.file.mimetype } : 'No file');

    const file = req.file;
    if (!file) {
      console.error('❌ No file in request');
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    const { name, category, expirationDate } = req.body;
    if (!name || !category) {
      console.error('❌ Missing required fields:', { name, category });
      res.status(400).json({ success: false, error: 'Name and category are required' });
      return;
    }

    console.log(`📄 Processing upload:`, {
      filename: file.originalname,
      size: file.size,
      type: file.mimetype,
      user: userId,
      plan: subscription.plan,
      limit_check: req.body._limitCheck,
    });

    const uploadResult = await uploadToStorage(
      file.buffer,
      userId,
      file.originalname,
      file.mimetype
    );

    if (!uploadResult.success) {
      res.status(500).json({ success: false, error: uploadResult.error });
      return;
    }

    const insertResult = await query(
      `INSERT INTO documents (user_id, name, category, type, size, file_path, original_name, upload_date, expiration_date, status, processed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        userId,
        name.trim(),
        category,
        file.mimetype,
        file.size,
        uploadResult.filePath,
        file.originalname,
        new Date().toISOString().split('T')[0],
        expirationDate || null,
        'active',
        false,
      ]
    );

    const documentData = insertResult.rows[0];

    if (!documentData) {
      await deleteFromStorage(uploadResult.filePath!);
      console.error('DB insert error: no row returned');
      res.status(500).json({ success: false, error: 'Failed to save document metadata' });
      return;
    }

    console.log(`✅ Document uploaded successfully: ${documentData.id}`);

    // Increment monthly upload counter (non-blocking for response, but we await it)
    await incrementMonthlyUploads(subscription.id, subscription.monthly_uploads_used);

    // Invalidate Redis caches so next request sees updated counts
    await invalidateDocCountCache(userId);
    await invalidateSubscriptionCache(userId);

    // Log successful upload
    await logFeatureUsage(userId, 'document_upload', {
      plan: subscription.plan,
      document_id: documentData.id,
      file_type: file.mimetype,
      file_size: file.size,
      document_count: (req.body._limitCheck?.current || 0) + 1,
      limit: subscription.document_limit,
    });

    // Send document uploaded email (non-blocking)
    resolveUserInfo(userId).then(userInfo => {
      if (userInfo) {
        const sizeStr = file.size < 1024 * 1024
          ? `${(file.size / 1024).toFixed(1)} KB`
          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
        sendNotificationEmail(userId, 'document_uploaded', {
          userName: userInfo.userName,
          documentName: name.trim(),
          category: category,
          fileSize: sizeStr,
          uploadedAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        }).catch(() => {});
      }
    });

    // Trigger document processing pipeline (non-blocking)
    console.log(`🔄 Triggering document text extraction for: ${documentData.id}`);

    processDocumentPipeline({
      documentId: documentData.id,
      userId,
      documentName: name.trim(),
      category,
      expirationDate,
      buffer: file.buffer,
      mimeType: file.mimetype,
    });

    res.json({
      success: true,
      data: {
        document_id: documentData.id,
        file_key: uploadResult.filePath,
        file_path: uploadResult.filePath,
        public_url: uploadResult.publicUrl,
        file_type: file.mimetype,
      },
    });
  } catch (err: any) {
    console.error('❌ Upload error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /documents
 * List all documents for the authenticated user
 */
router.get('/documents', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const result = await query(
      `SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ success: true, documents: result.rows });
  } catch (err: any) {
    console.error('❌ List documents error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /documents/:id
 * Get a single document with ownership check
 */
router.get('/documents/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Avoid matching download/preview-url/status sub-routes
    if (id === 'status') {
      // Let the processing routes handle /documents/status
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const result = await query(
      `SELECT * FROM documents WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    const document = result.rows[0];
    if (!document) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    res.json({ success: true, document });
  } catch (err: any) {
    console.error('❌ Get document error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /documents/:id/preview-url
 * Generate a signed URL for document preview
 */
router.get('/documents/:id/preview-url', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Check document_files table first (multi-file documents)
    const filesResult = await query(
      `SELECT file_path FROM document_files WHERE document_id = $1 ORDER BY file_order ASC LIMIT 1`,
      [id]
    );

    let filePath: string | null = null;

    if (filesResult.rows.length > 0 && filesResult.rows[0].file_path) {
      filePath = filesResult.rows[0].file_path;
    } else {
      // Fall back to documents.file_path
      const docResult = await query(
        `SELECT file_path FROM documents WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );

      if (docResult.rows.length === 0 || !docResult.rows[0]?.file_path) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      filePath = docResult.rows[0].file_path;
    }

    if (!filePath) {
      res.status(404).json({ success: false, error: 'No file path found' });
      return;
    }

    // Create signed URL (3600s / 1 hour expiry) via Azure Blob Storage SAS
    const signedUrl = await getSignedUrl(filePath, 3600);
    res.json({ success: true, url: signedUrl, filePath });
  } catch (err: any) {
    console.error('❌ Preview URL error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate preview URL' });
  }
});

/**
 * GET /documents/:id/content
 * Stream document content through the backend (avoids CORS issues with Azure Blob)
 */
router.get('/documents/:id/content', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const docResult = await query(
      `SELECT file_path, type, name FROM documents WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (docResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const { file_path, type, name } = docResult.rows[0];

    if (!file_path) {
      res.status(404).json({ success: false, error: 'Document file not found' });
      return;
    }

    const buffer = await downloadFromStorage(file_path);

    res.setHeader('Content-Type', type || 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);
    res.send(buffer);
  } catch (err: any) {
    console.error('❌ Document content error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch document content' });
  }
});

/**
 * PUT /documents/:id/status
 * Update document status
 */
router.put('/documents/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const { status } = req.body;

    if (!status || !['active', 'expiring', 'expired'].includes(status)) {
      res.status(400).json({ success: false, error: 'Invalid status. Must be active, expiring, or expired.' });
      return;
    }

    await query(
      `UPDATE documents SET status = $1, updated_at = $2 WHERE id = $3 AND user_id = $4`,
      [status, new Date().toISOString(), id, userId]
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error('❌ Update document status error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/documents/:id/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const result = await query(
      `SELECT file_path, name FROM documents WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    const document = result.rows[0];
    if (!document) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const downloadUrl = await getSignedUrl(document.file_path, 3600);
    res.json({ success: true, download_url: downloadUrl, filename: document.name });
  } catch (err: any) {
    console.error('❌ Download error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/documents/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    console.log(`🗑️ Delete request for document: ${id}`);
    console.log(`👤 Authenticated user: ${userId}`);

    const rpcResult = await query(
      `SELECT * FROM delete_document_cascade($1, $2)`,
      [id, userId]
    );

    if (rpcResult.rows.length === 0) {
      console.error('❌ No result from delete function');
      res.status(500).json({ success: false, error: 'Delete operation returned no result' });
      return;
    }

    const deleteResult = rpcResult.rows[0];

    if (!deleteResult.success) {
      console.error('❌ Delete failed:', deleteResult.message);
      res.status(404).json({ success: false, error: deleteResult.message });
      return;
    }

    console.log(`🗄️ Database records deleted successfully`);
    console.log(`📁 File path to delete: ${deleteResult.file_path}`);

    if (deleteResult.file_path) {
      try {
        await deleteFromStorage(deleteResult.file_path);
        console.log(`✅ Storage file deleted: ${deleteResult.file_path}`);
      } catch (storageErr: any) {
        console.error('⚠️ Storage deletion failed (non-fatal):', storageErr.message);
      }
    }

    console.log(`✅ Document completely deleted: ${id}`);

    // Invalidate Redis document count cache
    await invalidateDocCountCache(userId);

    // Send document deleted email (non-blocking)
    resolveUserInfo(userId).then(userInfo => {
      if (userInfo) {
        sendNotificationEmail(userId, 'document_deleted', {
          userName: userInfo.userName,
          documentName: deleteResult.document_name || 'Document',
          category: deleteResult.category || 'other',
          deletedAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        }).catch(() => {});
      }
    });

    res.json({
      success: true,
      message: 'Document and all related data deleted successfully'
    });
  } catch (err: any) {
    console.error('❌ Delete error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
