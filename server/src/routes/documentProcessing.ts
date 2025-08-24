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

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      } as ProcessingResult);
    }

    if (!document_id || !user_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing document_id or user_id'
      } as ProcessingResult);
    }

    filePath = file.path;

    console.log(`Processing document: ${file.originalname} (${file.mimetype})`);

    // Step 1: Extract text (supports PDF, DOCX, Images)
    const extractedText = await TextExtractor.extractText(filePath, file.mimetype);

    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No text could be extracted from the file'
      } as ProcessingResult);
    }

    console.log(`Extracted ${extractedText.length} characters of text`);

    // Step 2: Split text into chunks
    const textChunks = TextChunker.chunkText(extractedText, 800);

    if (textChunks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid text chunks could be created'
      } as ProcessingResult);
    }

    console.log(`Created ${textChunks.length} text chunks`);

    // Step 3: Generate embeddings for chunks
    const embeddings = await embeddingService.generateEmbeddings(textChunks);

    console.log(`Generated ${embeddings.length} embeddings`);

    // Step 4: Prepare document chunks for database
    const documentChunks: DocumentChunk[] = textChunks.map((chunk, index) => ({
      document_id,
      user_id,
      chunk_text: chunk,
      embedding: embeddings[index]
    }));

    // Step 5: Insert chunks into Supabase
    await supabaseService.insertDocumentChunks(documentChunks);

    console.log(`Inserted ${documentChunks.length} chunks into database`);

    // Clean up uploaded file
    await fs.unlink(filePath);

    res.json({
      success: true,
      message: 'Document processed successfully',
      chunks_processed: documentChunks.length
    } as ProcessingResult);

  } catch (error) {
    console.error('Document processing error:', error);

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
      return res.status(400).json({
        success: false,
        error: 'Missing query or user_id'
      });
    }

    const queryEmbedding = await embeddingService.generateSingleEmbedding(query);

    const similarChunks = await supabaseService.searchSimilarChunks(queryEmbedding, user_id, limit);

    res.json({
      success: true,
      results: similarChunks,
      query
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed'
    });
  }
});

// Route to delete document chunks
router.delete('/document-chunks/:documentId', async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing user_id'
      });
    }

    await supabaseService.deleteDocumentChunks(documentId, user_id);

    res.json({
      success: true,
      message: 'Document chunks deleted successfully'
    });

  } catch (error) {
    console.error('Delete chunks error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete chunks'
    });
  }
});

export default router;
