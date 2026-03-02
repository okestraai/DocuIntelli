import { Router, Request, Response } from 'express';
import { processDocument, processUnprocessedDocuments } from '../services/chunking';
import { processAllEmbeddings } from '../services/localEmbeddings';
import { generateDocumentTags, generateAllDocumentTags } from '../services/tagGeneration';
import { checkAndProcessMissingEmbeddings } from '../services/embeddingMonitor';
import { loadSubscription } from '../middleware/subscriptionGuard';

const router = Router();

// All processing routes require authentication
router.use(loadSubscription);

// Process a specific document by ID
router.post('/process/:documentId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId } = req.params;

    if (!documentId) {
      res.status(400).json({ success: false, error: 'Document ID is required' });
      return;
    }

    console.log(`🔄 API: Processing document ${documentId}`);
    const result = await processDocument(documentId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Document processed successfully',
        chunksProcessed: result.chunksProcessed,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Processing failed',
      });
    }
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// Process all unprocessed documents
router.post('/process-all', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔄 API: Processing all unprocessed documents');
    const result = await processUnprocessedDocuments();

    res.json({
      success: true,
      processed: result.processed,
      failed: result.failed,
      errors: result.errors,
      message: `Processed ${result.processed} documents, ${result.failed} failed`,
    });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// Trigger embedding generation for all chunks without embeddings
router.post('/generate-embeddings', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🧮 API: Triggering embedding generation');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      res.status(500).json({
        success: false,
        error: 'Missing Supabase configuration',
      });
      return;
    }

    const embeddingUrl = `${supabaseUrl}/functions/v1/generate-embeddings`;
    const response = await fetch(embeddingUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        limit: 10,
        continue_processing: true,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      res.status(response.status).json({
        success: false,
        error: 'Embedding generation failed',
        details: result,
      });
      return;
    }

    res.json({
      success: true,
      message: 'Embedding generation started',
      data: result,
    });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// Trigger local embedding generation for all chunks
router.post('/generate-embeddings-local', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🧮 API: Triggering local embedding generation');

    const startTime = Date.now();
    const result = await processAllEmbeddings();
    const duration = Date.now() - startTime;

    if (result.success) {
      res.json({
        success: true,
        processed: result.processed,
        duration,
        errors: result.errors,
        message: `Processed ${result.processed} chunks in ${(duration / 1000).toFixed(1)}s`,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Local embedding generation failed',
        errors: result.errors,
      });
    }
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// Generate tags for a specific document
router.post('/generate-tags/:documentId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId } = req.params;

    if (!documentId) {
      res.status(400).json({ success: false, error: 'Document ID is required' });
      return;
    }

    console.log(`🏷️  API: Generating tags for document ${documentId}`);
    const result = await generateDocumentTags(documentId);

    if (result.success) {
      res.json({
        success: true,
        tags: result.tags,
        message: result.message || 'Tags generated successfully',
        progress: result.progress,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        progress: result.progress,
      });
    }
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// Generate tags for all documents without tags
router.post('/generate-all-tags', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🏷️  API: Generating tags for all documents');
    const result = await generateAllDocumentTags();

    res.json({
      success: result.success,
      total: result.total,
      processed: result.processed,
      tagged: result.tagged,
      skipped: result.skipped,
      errors: result.errors,
      results: result.results,
      message: `Tagged ${result.tagged} documents, skipped ${result.skipped}, errors ${result.errors}`,
    });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// Check and process missing embeddings
router.post('/check-embeddings', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔍 API: Checking for missing embeddings');
    const result = await checkAndProcessMissingEmbeddings();

    res.json({
      success: true,
      totalDocuments: result.totalDocuments,
      documentsWithMissingEmbeddings: result.documentsWithMissingEmbeddings,
      totalChunks: result.totalChunks,
      chunksWithoutEmbeddings: result.chunksWithoutEmbeddings,
      documentsProcessed: result.documentsProcessed,
      errors: result.errors,
      message: `Checked ${result.totalDocuments} documents, processed ${result.documentsProcessed} with missing embeddings`,
    });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// Get processing status
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  res.json({
    status: 'ok',
    message: 'Document processing service is running',
  });
});

export default router;
