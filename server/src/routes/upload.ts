import { Router, Request, Response } from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
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

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration in upload routes');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const { data: documentData, error: dbError } = await supabase
      .from('documents')
      .insert([{
        user_id: userId,
        name: name.trim(),
        category,
        type: file.mimetype,
        size: file.size,
        file_path: uploadResult.filePath,
        original_name: file.originalname,
        upload_date: new Date().toISOString().split('T')[0],
        expiration_date: expirationDate || null,
        status: 'active',
        processed: false,
      }])
      .select()
      .single();

    if (dbError) {
      await deleteFromStorage(uploadResult.filePath!);
      console.error('DB insert error:', dbError.message);
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
            const { error: chunkError } = await supabase
              .from('document_chunks')
              .insert(
                extractionResult.chunks.map(({ index, content }) => ({
                  document_id: documentData.id,
                  user_id: userId,
                  chunk_index: index,
                  chunk_text: content,
                  embedding: null,
                }))
              );

            if (chunkError) {
              console.error('⚠️ Failed to store chunks:', chunkError.message);
            } else {
              chunksCreated = extractionResult.chunks.length;
              console.log(`✅ Stored ${chunksCreated} chunks in DB`);
              await supabase
                .from('documents')
                .update({ processed: true })
                .eq('id', documentData.id);
              console.log(`✅ Document marked as processed: ${documentData.id}`);
            }
          }
        } catch (localErr: any) {
          console.warn(`⚠️ Local text extraction failed: ${localErr.message}. Will try edge function fallback...`);
        }

        // Attempt 2: Fallback to process-document edge function if local extraction yielded 0 chunks
        if (chunksCreated === 0) {
          console.log(`⚠️ Local extraction yielded 0 chunks for ${documentData.id}, falling back to edge function...`);
          try {
            const processUrl = `${supabaseUrl}/functions/v1/process-document`;
            // Reset processed flag so edge function can re-process
            await supabase.from('documents').update({ processed: false }).eq('id', documentData.id);

            const processResponse = await fetch(processUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ document_id: documentData.id }),
            });

            if (processResponse.ok) {
              const processResult = await processResponse.json() as { success: boolean; data?: { chunks_processed: number } };
              chunksCreated = processResult.data?.chunks_processed || 0;
              console.log(`🔄 Edge function fallback: ${chunksCreated} chunks processed`);
            } else {
              const errData = await processResponse.json().catch(() => ({}));
              console.error('⚠️ Edge function fallback failed:', errData);
            }
          } catch (fallbackErr: any) {
            console.error('⚠️ Edge function fallback error:', fallbackErr.message);
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

          // Trigger embedding generation
          console.log(`🔄 Triggering embedding generation for: ${documentData.id}`);
          try {
            const embeddingUrl = `${supabaseUrl}/functions/v1/generate-embeddings`;
            const embeddingResponse = await fetch(embeddingUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                document_id: documentData.id,
                limit: 3,
                continue_processing: true,
              }),
            });

            if (!embeddingResponse.ok) {
              const errorData = await embeddingResponse.json();
              console.error('⚠️ Embedding generation failed:', errorData);
            } else {
              const result = await embeddingResponse.json() as { updated: number, remaining: number };
              console.log(`✅ Embeddings started: ${result.updated} chunks updated, ${result.remaining} remaining`);
            }
          } catch (embErr: any) {
            console.error('⚠️ Failed to trigger embedding generation:', embErr.message);
          }
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

router.get('/documents/:id/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('file_path, name')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (docError || !document) {
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

    const { data: result, error: deleteError } = await supabase
      .rpc('delete_document_cascade', {
        p_document_id: id,
        p_user_id: userId
      });

    if (deleteError) {
      console.error('❌ Database deletion error:', deleteError);
      res.status(500).json({
        success: false,
        error: 'Failed to delete document from database',
      });
      return;
    }

    if (!result || result.length === 0) {
      console.error('❌ No result from delete function');
      res.status(500).json({ success: false, error: 'Delete operation returned no result' });
      return;
    }

    const deleteResult = result[0];

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
