import { Router, Request, Response } from 'express';
import { upload } from '../middleware/fileUpload';
import { TextExtractor } from '../services/textExtractor';
import { TextChunker } from '../services/textChunker';
import { EmbeddingService } from '../services/embeddingService';
import { SupabaseService } from '../services/supabaseService';
import { ProcessingResult, DocumentChunk } from '../types';
import fs from 'fs/promises';

const router = Router();

// Initialize services
const embeddingService = new EmbeddingService(process.env.OPENAI_API_KEY!);
const supabaseService = new SupabaseService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

router.post('/process-document', upload.single('file'), async (req: Request, res: Response) => {
  let filePath: string | undefined;

  try {
    const { document_id, user_id } = req.body;
    const file = req.file;

    console.log("📥 Incoming upload:", { document_id, user_id, filename: file?.originalname });

    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' } as ProcessingResult);
    }
    if (!document_id || !user_id) {
      return res.status(400).json({ success: false, error: 'Missing document_id or user_id' } as ProcessingResult);
    }

    // ✅ Step 0: Validate document exists in DB
    console.log("🔎 Checking document in DB:", { document_id, user_id });
    const { data: docData, error: docError } = await supabaseService.getDocumentById(document_id, user_id);

    if (docError || !docData) {
      console.error("❌ Document not found or invalid:", docError);
      return res.status(400).json({ success: false, error: 'Invalid document_id or user_id' } as ProcessingResult);
    }

    console.log("✅ Validated document from DB:", docData);
    const { id: validDocId, user_id: validUserId } = docData;

    filePath = file.path;
    console.log(`📂 Processing document: ${file.originalname} (${file.mimetype})`);

    // Step 1: Extract text
    const extractedText = await TextExtractor.extractText(filePath, file.mimetype);
    console.log("📄 Extracted text preview:", extractedText.slice(0, 200));

    if (!extractedText || extractedText.trim().length === 0) {
      console.error("❌ No text extracted");
      return res.status(400).json({ success: false, error: 'No text could be extracted from the file' } as ProcessingResult);
    }

    console.log(`📄 Extracted ${extractedText.length} characters of text`);

    // Step 2: Split into chunks
    const textChunks = TextChunker.chunkText(extractedText, 800);
    console.log("✂️ Chunks created:", textChunks.length);

    if (textChunks.length === 0) {
      console.error("❌ No valid text chunks created");
      return res.status(400).json({ success: false, error: 'No valid text chunks could be created' } as ProcessingResult);
    }

    // Step 3: Generate embeddings
    let embeddings: number[][] = [];
    try {
      embeddings = await embeddingService.generateEmbeddings(textChunks);
      console.log("🧠 Embeddings generated:", embeddings.length);
    } catch (err) {
      console.error("❌ Error generating embeddings:", err);
      return res.status(500).json({ success: false, error: "Failed to generate embeddings" });
    }

    // Step 4: Prepare chunks
    const documentChunks: DocumentChunk[] = textChunks.map((chunk, index) => ({
      document_id: validDocId,
      user_id: validUserId,
      chunk_text: chunk,
      embedding: embeddings[index]
    }));

    console.log("💾 Preparing to insert:", documentChunks.length, "chunks");

    // Step 5: Insert into Supabase
    await supabaseService.insertDocumentChunks(documentChunks);
    console.log(`✅ Inserted ${documentChunks.length} chunks into database`);

    // Clean up
    await fs.unlink(filePath);

    res.json({
      success: true,
      message: 'Document processed successfully',
      chunks_processed: documentChunks.length
    } as ProcessingResult);

  } catch (error) {
    console.error('❌ Document processing error:', error);

    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        console.error('File cleanup error:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Failed to process document'
    } as ProcessingResult);
  }
});

// Route to search similar chunks
router.post('/search-chunks', async (req: Request, res: Response) => {
  try {
    const { query, user_id, limit = 5 } = req.body;
    if (!query || !user_id) {
      return res.status(400).json({ success: false, error: 'Missing query or user_id' });
    }

    console.log("🔎 Searching chunks for query:", query);
    const queryEmbedding = await embeddingService.generateSingleEmbedding(query);
    const similarChunks = await supabaseService.searchSimilarChunks(queryEmbedding, user_id, limit);

    res.json({ success: true, results: similarChunks, query });
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Search failed' });
  }
});

// Route to delete document chunks
router.delete('/document-chunks/:documentId', async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ success: false, error: 'Missing user_id' });
    }

    console.log(`🗑️ Deleting chunks for document ${documentId}, user ${user_id}`);
    await supabaseService.deleteDocumentChunks(documentId, user_id);
    res.json({ success: true, message: 'Document chunks deleted successfully' });
  } catch (error) {
    console.error('❌ Delete chunks error:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to delete chunks' });
  }
});

export default router;
