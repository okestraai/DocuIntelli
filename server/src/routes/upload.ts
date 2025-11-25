import { Router, Request, Response } from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { uploadToStorage, deleteFromStorage, getSignedUrl } from '../services/storage';
import { TextExtractor } from '../services/textExtractor';

const router = Router();

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

router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📥 Upload request received');
    console.log('Headers:', { hasAuth: !!req.headers.authorization });
    console.log('Body:', { name: req.body.name, category: req.body.category });
    console.log('File:', req.file ? { name: req.file.originalname, size: req.file.size, type: req.file.mimetype } : 'No file');

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.error('❌ No authorization header');
      res.status(401).json({ success: false, error: 'Authorization header required' });
      return;
    }

    console.log('🔐 Validating user token...');
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      console.error('❌ Invalid token:', userError?.message);
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    console.log('✅ User authenticated:', user.id);

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
      user: user.id,
    });

    const uploadResult = await uploadToStorage(
      file.buffer,
      user.id,
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
        user_id: user.id,
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
      res.status(500).json({ success: false, error: 'Failed to save document metadata', details: dbError.message });
      return;
    }

    console.log(`✅ Document uploaded successfully: ${documentData.id}`);

    // Trigger document processing using Node.js text extractor (non-blocking)
    console.log(`🔄 Triggering document text extraction for: ${documentData.id}`);

    (async () => {
      try {
        const extractionResult = await TextExtractor.extractAndChunk(file.buffer, file.mimetype);
        console.log(`✂️ Created ${extractionResult.chunks.length} text chunks`);

        if (extractionResult.chunks.length > 0) {
          const { error: chunkError } = await supabase
            .from('document_chunks')
            .insert(
              extractionResult.chunks.map(({ index, content }) => ({
                document_id: documentData.id,
                user_id: user.id,
                chunk_index: index,
                chunk_text: content,
                embedding: null,
              }))
            );

          if (chunkError) {
            console.error('⚠️ Failed to store chunks:', chunkError.message);
          } else {
            console.log(`✅ Stored ${extractionResult.chunks.length} chunks in DB`);
            await supabase
              .from('documents')
              .update({ processed: true })
              .eq('id', documentData.id);
            console.log(`✅ Document marked as processed: ${documentData.id}`);

            // Trigger embedding generation with continue_processing for all chunks
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
                  continue_processing: true // This will process all chunks recursively
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
          }
        }
      } catch (err: any) {
        console.error(`⚠️ Text extraction failed for ${documentData.id}:`, err.message || err);
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
    res.status(500).json({ success: false, error: 'Internal server error', details: err.message });
  }
});

router.get('/documents/:id/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ success: false, error: 'Authorization required' });
      return;
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('file_path, name')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (docError || !document) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const downloadUrl = await getSignedUrl(document.file_path, 3600);
    res.json({ success: true, download_url: downloadUrl, filename: document.name });
  } catch (err: any) {
    console.error('❌ Download error:', err);
    res.status(500).json({ success: false, error: 'Internal server error', details: err.message });
  }
});

router.delete('/documents/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ success: false, error: 'Authorization required' });
      return;
    }

    console.log(`🗑️ Delete request for document: ${id}`);

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    console.log(`👤 Authenticated user: ${user.id}`);

    const { data: result, error: deleteError } = await supabase
      .rpc('delete_document_cascade', {
        p_document_id: id,
        p_user_id: user.id
      });

    if (deleteError) {
      console.error('❌ Database deletion error:', deleteError);
      res.status(500).json({
        success: false,
        error: 'Failed to delete document from database',
        details: deleteError.message
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
    res.json({
      success: true,
      message: 'Document and all related data deleted successfully'
    });
  } catch (err: any) {
    console.error('❌ Delete error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: err.message
    });
  }
});

export default router;
