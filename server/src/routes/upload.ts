import { Router, Request, Response } from 'express';
import multer from 'multer';
import { query } from '../services/db';
import { uploadToStorage, deleteFromStorage, getSignedUrl } from '../services/storage';
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

const router = Router();

// Apply subscription loading to ALL routes
router.use(loadSubscription);

// Import services for document processing and embeddings (was edge function calls)
import { processDocumentVLLMEmbeddings } from '../services/vllmEmbeddings';
import { processDocument as reprocessDocument } from '../services/chunking';

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

    // Trigger document processing using Node.js text extractor (non-blocking)
    console.log(`🔄 Triggering document text extraction for: ${documentData.id}`);

    (async () => {
      try {
        let chunksCreated = 0;

        // Attempt 1: Local text extraction (wrapped in its own try-catch so
        // failures don't skip the edge function fallback below)
        try {
          const extractionResult = await TextExtractor.extractAndChunk(file.buffer, file.mimetype);
          console.log(`✂️ Local extractor created ${extractionResult.chunks.length} text chunks`);

          if (extractionResult.chunks.length > 0) {
            // Build a multi-row INSERT for all chunks
            const values: any[] = [];
            const placeholders: string[] = [];
            extractionResult.chunks.forEach(({ index, content }, i) => {
              const offset = i * 4;
              placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
              values.push(documentData.id, userId, index, content);
            });

            try {
              await query(
                `INSERT INTO document_chunks (document_id, user_id, chunk_index, chunk_text)
                 VALUES ${placeholders.join(', ')}`,
                values
              );
              chunksCreated = extractionResult.chunks.length;
              console.log(`✅ Stored ${chunksCreated} chunks in DB`);
              await query(
                `UPDATE documents SET processed = true WHERE id = $1`,
                [documentData.id]
              );
              console.log(`✅ Document marked as processed: ${documentData.id}`);
            } catch (chunkErr: any) {
              console.error('⚠️ Failed to store chunks:', chunkErr.message);
            }
          }
        } catch (localErr: any) {
          console.warn(`⚠️ Local text extraction failed: ${localErr.message}. Will try edge function fallback...`);
        }

        // Attempt 2: Fallback to chunking service if local extraction yielded 0 chunks
        if (chunksCreated === 0) {
          console.log(`⚠️ Local extraction yielded 0 chunks for ${documentData.id}, falling back to chunking service...`);
          try {
            await query('UPDATE documents SET processed = false WHERE id = $1', [documentData.id]);
            const processResult = await reprocessDocument(documentData.id);
            chunksCreated = processResult.chunksProcessed || 0;
            console.log(`🔄 Chunking service fallback: ${chunksCreated} chunks processed`);
          } catch (fallbackErr: any) {
            console.error('⚠️ Chunking service fallback error:', fallbackErr.message);
          }
        }

        // If we have chunks from either method, trigger embeddings
        if (chunksCreated > 0) {
          // Send processing complete email (non-blocking)
          resolveUserInfo(userId).then(userInfo => {
            if (userInfo) {
              sendNotificationEmail(userId, 'document_processing_complete', {
                userName: userInfo.userName,
                documentName: name.trim(),
                category: category,
                tagsGenerated: 0,
                embeddingsCreated: false,
                expirationDetected: expirationDate || undefined,
              }).catch(() => {});
            }
          });

          // Trigger embedding generation directly
          console.log(`🔄 Triggering embedding generation for: ${documentData.id}`);
          processDocumentVLLMEmbeddings(documentData.id)
            .then(result => {
              if (result.success) {
                console.log(`✅ Embeddings generated: ${result.processed} chunks processed`);
              } else {
                console.error('⚠️ Embedding generation failed:', result.error);
              }
            })
            .catch(embErr => {
              console.error('⚠️ Failed to trigger embedding generation:', embErr.message);
            });
        } else {
          // Both extraction methods failed — notify user
          console.error(`❌ All extraction methods failed for ${documentData.id} (0 chunks). Document may be empty or unreadable.`);
          resolveUserInfo(userId).then(userInfo => {
            if (userInfo) {
              sendNotificationEmail(userId, 'document_processing_failed', {
                userName: userInfo.userName,
                documentName: name.trim(),
                errorMessage: 'Could not extract text from this file. The document may be empty, image-only, or in an unsupported format.',
              }).catch(() => {});
            }
          });
        }
      } catch (err: any) {
        console.error(`⚠️ Text extraction failed for ${documentData.id}:`, err.message || err);

        // Send processing failure email (non-blocking)
        resolveUserInfo(userId).then(userInfo => {
          if (userInfo) {
            sendNotificationEmail(userId, 'document_processing_failed', {
              userName: userInfo.userName,
              documentName: name,
              errorMessage: err.message || 'An unexpected error occurred during text extraction.',
            }).catch(emailErr => console.error('📧 Processing failed email error:', emailErr));
          }
        });
      }
    })();

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
