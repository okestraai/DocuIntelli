import '../env';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { uploadToStorage, deleteFromStorage, getSignedUrl } from '../services/storage';
import { extractText } from '../services/textExtraction';
import { chunkText } from '../services/chunking';

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

    console.log('📝 Extracting text from document...');
    const extractionResult = await extractText(file.buffer, file.mimetype);

    let totalChunks = 0;
    if (extractionResult.success && extractionResult.text) {
      console.log(`✅ Text extracted: ${extractionResult.text.length} characters`);

      console.log('✂️ Chunking text...');
      const chunks = chunkText(extractionResult.text, {
        chunkSize: 1000,
        overlap: 100
      });

      console.log(`✅ Created ${chunks.length} chunks`);

      if (chunks.length > 0) {
        console.log('💾 Saving chunks to database...');
        const chunksToInsert = chunks.map(chunk => ({
          document_id: documentData.id,
          user_id: user.id,
          chunk_index: chunk.index,
          chunk_text: chunk.content,
          created_at: new Date().toISOString()
        }));

        const { error: chunkError } = await supabase
          .from('document_chunks')
          .insert(chunksToInsert);

        if (chunkError) {
          console.error('❌ Failed to save chunks:', chunkError.message);
        } else {
          console.log(`✅ Saved ${chunks.length} chunks to database`);
          totalChunks = chunks.length;

          await supabase
            .from('documents')
            .update({ processed: true })
            .eq('id', documentData.id);
        }
      }
    } else {
      console.log('⚠️ Text extraction not supported or failed for this file type');
    }

    res.json({
      success: true,
      message: 'Document processed',
      total_chunks: totalChunks,
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

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('file_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (docError || !document) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    await deleteFromStorage(document.file_path);

    await supabase.from('document_chunks').delete().eq('document_id', id);
    await supabase.from('documents').delete().eq('id', id).eq('user_id', user.id);

    console.log(`✅ Document deleted: ${id}`);
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (err: any) {
    console.error('❌ Delete error:', err);
    res.status(500).json({ success: false, error: 'Internal server error', details: err.message });
  }
});

export default router;
