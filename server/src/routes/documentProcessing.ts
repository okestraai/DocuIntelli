import { Router, Request, Response } from 'express';
import { upload } from '../middleware/fileUpload';
import { TextExtractor } from '../services/textExtractor';
import { TextChunker } from '../services/textChunker';
import { EmbeddingService } from '../services/embeddingService';
import { SupabaseService } from '../services/supabaseService';
import { ProcessingResult, DocumentChunk } from '../types';
import fs from 'fs/promises';
import { validate as uuidValidate } from 'uuid';

const router = Router();

// Initialize services
const embeddingService = new EmbeddingService(process.env.OPENAI_API_KEY!);
const supabaseService = new SupabaseService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

router.post(
  '/process-document',
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    let filePath: string | undefined;

    try {
      const { document_id, user_id } = req.body;
      const file = req.file;

      console.log("📥 Incoming upload:", { document_id, user_id, filename: file?.originalname });

      if (!file) {
        res.status(400).json({ success: false, error: 'No file uploaded' } as ProcessingResult);
        return;
      }
      if (!document_id || !user_id) {
        res.status(400).json({ success: false, error: 'Missing document_id or user_id' } as ProcessingResult);
        return;
      }

      // ✅ Step 0: Validate that this document/user exists in DB
      console.log("🔎 Checking document in DB:", { document_id, user_id });
      const { data: docData, error: docError } = await supabaseService.getDocumentById(document_id, user_id);

      if (docError || !docData) {
        console.error("❌ Document not found or invalid:", docError);
        res.status(400).json({ success: false, error: 'Invalid document_id or user_id' } as ProcessingResult);
        return;
      }

      const { id: validDocId, user_id: validUserId } = docData;

      // ✅ Validate UUID formats
      console.log("📌 Raw UUIDs from DB:", { validDocId, validUserId });
      console.log("🔎 UUID validation:", {
        document_id_valid: uuidValidate(validDocId),
        user_id_valid: uuidValidate(validUserId)
      });

      if (!uuidValidate(validDocId) || !uuidValidate(validUserId)) {
        res.status(400).json({ success: false, error: 'Corrupted UUID detected in database' } as ProcessingResult);
        return;
      }

      filePath = file.path;
      console.log(`📂 Processing document: ${file.originalname} (${file.mimetype})`);

      // Step 1: Extract text
      const extractedText = await TextExtractor.extractText(filePath, file.mimetype);
      console.log("📄 Extracted text preview:", extractedText.slice(0, 200));

      if (!extractedText || extractedText.trim().length === 0) {
        console.error("❌ No text extracted");
        res.status(400).json({ success: false, error: 'No text could be extracted from the file' } as ProcessingResult);
        return;
      }

      console.log(`📄 Extracted ${extractedText.length} characters of text`);

      // Step 2: Split into chunks
      const textChunks = TextChunker.chunkText(extractedText);
      console.log("✂️ Chunks created:", textChunks.length);

      if (textChunks.length === 0) {
        console.error("❌ No valid text chunks created");
        res.status(400).json({ success: false, error: 'No valid text chunks could be created' } as ProcessingResult);
        return;
      }

      // Step 3: Generate embeddings
      let embeddings: number[][] = [];
      try {
        embeddings = await embeddingService.generateEmbeddings(textChunks);
        console.log("🧠 Embeddings generated:", embeddings.length);
      } catch (err) {
        console.error("❌ Error generating embeddings:", err);
        res.status(500).json({ success: false, error: "Failed to generate embeddings" });
        return;
      }

      // Step 4: Prepare chunks
      const documentChunks: DocumentChunk[] = textChunks.map((chunk, index) => ({
        document_id: validDocId,
        user_id: validUserId,
        chunk_text: chunk,
        embedding: embeddings[index]
      }));

      console.log("🚀 Final pre-insert check:", {
        chunksPrepared: documentChunks.length,
        sampleChunk: {
          doc_id: documentChunks[0]?.document_id,
          user_id: documentChunks[0]?.user_id,
          textPreview: documentChunks[0]?.chunk_text.slice(0, 50),
          embeddingType: typeof documentChunks[0]?.embedding,
          embeddingLength: Array.isArray(documentChunks[0]?.embedding)
            ? documentChunks[0]?.embedding.length
            : "n/a",
          embeddingSample: Array.isArray(documentChunks[0]?.embedding)
            ? documentChunks[0]?.embedding.slice(0, 5)
            : documentChunks[0]?.embedding
        }
      });

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
  }
);

// Route to search similar chunks
router.post(
  '/search-chunks',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { query, user_id, limit = 5 } = req.body;
      if (!query || !user_id) {
        res.status(400).json({ success: false, error: 'Missing query or user_id' });
        return;
      }

      console.log("🔎 Searching chunks for query:", query);
      const queryEmbedding = await embeddingService.generateSingleEmbedding(query);
      const similarChunks = await supabaseService.searchSimilarChunks(queryEmbedding, user_id, limit);

      res.json({ success: true, results: similarChunks, query });
    } catch (error) {
      console.error('❌ Search error:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Search failed' });
    }
  }
);

// Route to delete document chunks
router.delete(
  '/document-chunks/:documentId',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { documentId } = req.params;
      const { user_id } = req.body;
      if (!user_id) {
        res.status(400).json({ success: false, error: 'Missing user_id' });
        return;
      }

      console.log(`🗑️ Deleting chunks for document ${documentId}, user ${user_id}`);
      await supabaseService.deleteDocumentChunks(documentId, user_id);
      res.json({ success: true, message: 'Document chunks deleted successfully' });
    } catch (error) {
      console.error('❌ Delete chunks error:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to delete chunks' });
    }
  }
);

export default router;
