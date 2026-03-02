# Embedding and Deletion Implementation

## Overview
This document describes the automatic embedding generation and cascading deletion features implemented in the application.

## 1. Automatic Embedding Generation for NULL Embeddings

### Problem
Document chunks were being created without embeddings, requiring manual intervention to generate them.

### Solution
Implemented a multi-layered approach to ensure all chunks eventually get embeddings:

#### A. Database Trigger (Automatic)
- **Location**: Migration `add_auto_embedding_trigger`
- **Function**: `trigger_embedding_generation()`
- **Behavior**: Automatically triggers when new chunks are inserted with NULL embeddings
- **Process**: Calls the `generate-embeddings` edge function in the background

#### B. Edge Function for Batch Processing
- **Name**: `process-null-embeddings`
- **URL**: `/functions/v1/process-null-embeddings`
- **Purpose**: Processes multiple chunks with NULL embeddings in batches
- **Features**:
  - Processes up to 10 batches (5 chunks each) per invocation
  - Returns count of processed and remaining chunks
  - Can be called manually or automatically

#### C. Manual Trigger Function
- **Function**: `manually_process_null_embeddings()`
- **Usage**: Can be called from SQL or via RPC
- **Returns**: Success status, message, and count of chunks needing processing
- **Example**:
  ```sql
  SELECT * FROM manually_process_null_embeddings();
  ```

#### D. Existing Generate Embeddings Function
- **Name**: `generate-embeddings`
- **URL**: `/functions/v1/generate-embeddings`
- **Parameters**:
  - `document_id` (optional): Process only chunks from specific document
  - `limit` (optional): Number of chunks to process (default: 3, max: 10)
- **Behavior**: Generates embeddings using Supabase AI (gte-small model)

### How It Works
1. When a document is uploaded, chunks are created with `embedding = NULL`
2. Database trigger automatically fires and calls `generate-embeddings`
3. Embeddings are generated asynchronously using Supabase AI
4. If any chunks still have NULL embeddings, they can be processed by:
   - Calling `process-null-embeddings` edge function
   - Calling `manually_process_null_embeddings()` SQL function
   - Waiting for the next automatic trigger

## 2. Cascading Document Deletion

### Problem
Deleting a document left orphaned records in multiple tables and files in storage.

### Solution
Implemented comprehensive cascading deletion that removes ALL related data.

#### A. Database Function
- **Function**: `delete_document_cascade(p_document_id, p_user_id)`
- **Location**: Migration `add_cascading_document_deletion`
- **Returns**: `file_path`, `success`, and `message`

#### B. What Gets Deleted
When a document is deleted, the following are removed:

1. **document_chunks** table
   - All text chunks for the document
   - All embeddings associated with those chunks

2. **document_chats** table
   - All chat messages about the document

3. **document_files** table
   - All file records associated with the document

4. **notification_logs** table
   - Document ID removed from `document_ids` array
   - Notification records preserved but reference removed

5. **documents** table
   - The document record itself

6. **Storage**
   - Physical file deleted from Supabase Storage

#### C. Backend Implementation
- **Location**: `server/src/routes/upload.ts`
- **Endpoint**: `DELETE /api/documents/:id`
- **Process**:
  1. Authenticates user
  2. Calls `delete_document_cascade()` database function
  3. Deletes file from storage using returned `file_path`
  4. Returns success response

#### D. Foreign Key Constraints
All foreign key constraints have `ON DELETE CASCADE`:
- `document_chunks.document_id` → `documents.id`
- `document_chats.document_id` → `documents.id`
- `document_files.document_id` → `documents.id`

### How It Works
1. User initiates delete from frontend
2. Frontend calls backend API: `DELETE /api/documents/:id`
3. Backend authenticates user and calls database function
4. Database function deletes all related records in transaction
5. Backend deletes physical file from storage
6. Success response returned to frontend

### Security
- Row Level Security (RLS) enforced throughout
- Users can only delete their own documents
- Function uses `SECURITY DEFINER` but checks `user_id`
- All operations in single transaction (rollback on failure)

## 3. Testing

### Test NULL Embedding Processing
```sql
-- Check for chunks with NULL embeddings
SELECT COUNT(*) FROM document_chunks WHERE embedding IS NULL;

-- Manually trigger processing
SELECT * FROM manually_process_null_embeddings();

-- Check again
SELECT COUNT(*) FROM document_chunks WHERE embedding IS NULL;
```

### Test Cascading Deletion
```sql
-- Before deletion, check related records
SELECT
  (SELECT COUNT(*) FROM documents WHERE id = 'DOCUMENT_ID') as doc_count,
  (SELECT COUNT(*) FROM document_chunks WHERE document_id = 'DOCUMENT_ID') as chunk_count,
  (SELECT COUNT(*) FROM document_chats WHERE document_id = 'DOCUMENT_ID') as chat_count,
  (SELECT COUNT(*) FROM document_files WHERE document_id = 'DOCUMENT_ID') as file_count;

-- Delete via backend API or frontend UI

-- After deletion, verify all cleaned up
SELECT
  (SELECT COUNT(*) FROM documents WHERE id = 'DOCUMENT_ID') as doc_count,
  (SELECT COUNT(*) FROM document_chunks WHERE document_id = 'DOCUMENT_ID') as chunk_count,
  (SELECT COUNT(*) FROM document_chats WHERE document_id = 'DOCUMENT_ID') as chat_count,
  (SELECT COUNT(*) FROM document_files WHERE document_id = 'DOCUMENT_ID') as file_count;
-- All should be 0
```

## 4. API Reference

### Edge Functions

#### Generate Embeddings
```
POST /functions/v1/generate-embeddings
Body: {
  "document_id": "uuid" (optional),
  "limit": 5 (optional, default: 3, max: 10)
}
```

#### Process NULL Embeddings
```
POST /functions/v1/process-null-embeddings
No body required
```

### Database Functions

#### Manually Process NULL Embeddings
```sql
SELECT * FROM manually_process_null_embeddings();
-- Returns: (success, message, chunks_needing_processing)
```

#### Delete Document with Cascade
```sql
SELECT * FROM delete_document_cascade(
  'document-uuid'::uuid,
  'user-uuid'::uuid
);
-- Returns: (file_path, success, message)
```

## 5. Maintenance

### Monitor NULL Embeddings
```sql
-- Count chunks with NULL embeddings by document
SELECT
  d.name,
  d.id,
  COUNT(dc.id) as null_embedding_count
FROM documents d
JOIN document_chunks dc ON dc.document_id = d.id
WHERE dc.embedding IS NULL
GROUP BY d.id, d.name
ORDER BY null_embedding_count DESC;
```

### View Deletion Activity
Check backend logs for deletion operations:
```
🗑️ Delete request for document: <id>
👤 Authenticated user: <user_id>
🗄️ Database records deleted successfully
📁 File path to delete: <path>
✅ Storage file deleted: <path>
✅ Document completely deleted: <id>
```
