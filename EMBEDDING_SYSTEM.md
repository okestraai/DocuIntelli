# Document Embedding System

## Overview
The embedding system automatically generates vector embeddings for uploaded documents to enable semantic search and AI-powered document chat features.

## How It Works

### 1. Document Upload Flow
When a user uploads a document (single or multiple files):

1. **File Upload**: Files are uploaded to Supabase Storage
2. **Text Extraction**: Text is extracted from PDFs, DOCX, and other supported formats
3. **Text Chunking**: Extracted text is split into manageable chunks (1000 chars with 100 char overlap)
4. **Database Storage**: Chunks are stored in `document_chunks` table with `embedding: null`
5. **Embedding Generation**: The upload function automatically triggers embedding generation for 1 chunk

### 2. Embedding Generation
- **Function**: `generate-embeddings` edge function
- **Model**: Uses Supabase AI's `gte-small` model
- **Batch Size**: Processes 1-3 chunks at a time to avoid resource limits
- **Process**:
  - Fetches chunks with null embeddings
  - Generates 384-dimensional vectors using AI model
  - Updates chunks with embedding arrays

### 3. Database Schema

#### `document_chunks` table
```sql
- id: uuid (primary key)
- document_id: uuid (foreign key to documents)
- file_id: uuid (foreign key to document_files)
- user_id: uuid
- chunk_index: integer
- chunk_text: text
- embedding: vector(384) (nullable)
- created_at: timestamp
```

### 4. Multi-File Support
- Documents can have multiple files associated via `document_files` table
- Each file's text is extracted and chunked separately
- All chunks linked to same document_id
- UI shows file count badge: "(X files)"

## Edge Functions

### `upload-document`
- Handles file uploads and text processing
- Creates document and chunk records
- Triggers initial embedding generation (1 chunk)

### `generate-embeddings`
- Generates embeddings for chunks without them
- Processes 1-3 chunks per invocation
- Can be called with specific `document_id` or process all pending

### `process-all-embeddings`
- Batch processor for large embedding jobs
- Iteratively calls `generate-embeddings`
- Processes up to 50 chunks with 2-second delays between batches
- Use for backfilling embeddings on existing documents

### `chat-document`
- Uses embeddings for semantic search
- Finds relevant chunks using vector similarity
- Generates AI responses based on document content

## Usage

### For New Uploads
Embeddings are generated automatically - no action needed.

### For Existing Documents (Backfill)
Call the batch processor:
```bash
curl -X POST "https://YOUR-PROJECT.supabase.co/functions/v1/process-all-embeddings" \
  -H "Authorization: Bearer YOUR-SERVICE-ROLE-KEY"
```

### Manual Embedding Generation
For a specific document:
```bash
curl -X POST "https://YOUR-PROJECT.supabase.co/functions/v1/generate-embeddings" \
  -H "Authorization: Bearer YOUR-SERVICE-ROLE-KEY" \
  -H "Content-Type: application/json" \
  -d '{"document_id": "DOCUMENT-UUID", "limit": 3}'
```

## Performance Considerations

- **Batch Size**: Limited to 1-3 chunks to avoid timeout/resource issues
- **Processing Time**: ~3-5 seconds per chunk
- **Resource Usage**: Supabase AI model runs on edge function compute
- **Delays**: 2-second delays between batches prevent resource exhaustion

## Monitoring

Check embedding status:
```sql
SELECT
  dc.document_id,
  d.name,
  COUNT(*) as total_chunks,
  COUNT(dc.embedding) as with_embeddings,
  COUNT(*) - COUNT(dc.embedding) as pending
FROM document_chunks dc
LEFT JOIN documents d ON dc.document_id = d.id
GROUP BY dc.document_id, d.name;
```

## Troubleshooting

### No Embeddings Generated
- Check edge function logs in Supabase Dashboard
- Verify `Supabase.ai` is available in your project
- Confirm service role key permissions

### Slow Processing
- Reduce batch size (limit parameter)
- Increase delay between batches
- Process during off-peak hours

### Resource Errors
- Already handled: batch size reduced to 1-3 chunks
- If persists: contact Supabase support for compute limits
