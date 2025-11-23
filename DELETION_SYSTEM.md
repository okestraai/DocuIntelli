# Document Deletion System

## Overview
The document deletion system ensures complete removal of all document-related data across storage and database tables when a user deletes a document.

## Architecture

### Edge Function: `delete-document`
**Endpoint**: `DELETE /functions/v1/delete-document/{document_id}`

This function handles the complete deletion process:
1. Authenticates the user
2. Verifies document ownership
3. Deletes all files from Supabase Storage
4. Deletes document record from database (triggers cascading deletes)

### Database Cascade Rules
The database schema includes foreign key constraints with `ON DELETE CASCADE` rules:

```
documents (parent)
├── document_files (CASCADE DELETE)
│   └── document_chunks (CASCADE DELETE via file_id)
├── document_chunks (CASCADE DELETE via document_id)
└── document_chats (CASCADE DELETE)
```

## What Gets Deleted

When a document is deleted, the following occurs **automatically**:

### 1. Storage Files (Manual Deletion)
- All files stored in `documents` bucket
- Retrieved from `document_files` table
- Deleted individually from Supabase Storage
- Logs success/failure for each file

### 2. Database Records (Cascade Deletion)

#### Immediate Cascade:
- **document_files**: All file records for the document
- **document_chats**: All chat history for the document
- **document_chunks**: All text chunks (via document_id)

#### Secondary Cascade:
- **document_chunks**: Additional chunks (via file_id when document_files are deleted)

This ensures that:
- Text chunks are deleted even if directly linked to files
- No orphaned records remain in any table
- Embeddings stored in chunks are removed
- Chat history is completely cleared

### 3. Related Metadata
- Vector embeddings (stored in document_chunks)
- File metadata (size, type, order)
- Processing status flags
- Timestamps and user associations

## Usage

### Frontend Call
```typescript
import { deleteDocument } from './lib/supabase'

// Delete a document
await deleteDocument(documentId)
```

### Direct API Call
```bash
curl -X DELETE "https://YOUR-PROJECT.supabase.co/functions/v1/delete-document/DOCUMENT-ID" \
  -H "Authorization: Bearer YOUR-USER-TOKEN"
```

### Response Format
```json
{
  "success": true,
  "document_id": "uuid",
  "files_deleted": 2
}
```

## Security

### Authentication
- Requires valid user authentication token
- Uses Supabase Auth to verify user identity

### Authorization
- Verifies document ownership before deletion
- Users can only delete their own documents
- Queries filtered by `user_id`

### Row Level Security (RLS)
- Database RLS policies prevent unauthorized access
- Service role key used for storage operations
- User context maintained throughout operation

## Error Handling

### Scenarios Handled:
1. **Document not found**: Returns 404
2. **Unauthorized access**: Returns 401/404
3. **Storage errors**: Logs warning, continues with database deletion
4. **Database errors**: Returns 500 with error details
5. **Partial failures**: Tracks file deletion count

### Resilience:
- Storage file deletion errors don't block database deletion
- Database cascade ensures consistency even if storage fails
- All operations logged for debugging

## Deletion Flow

```
User clicks delete
    ↓
Frontend calls deleteDocument(id)
    ↓
Edge function authenticates user
    ↓
Verify document ownership
    ↓
Fetch all file paths
    ↓
Delete files from storage (loop)
    ↓
Delete document record
    ↓
Database CASCADE triggers:
    - Delete document_files
    - Delete document_chats
    - Delete document_chunks (via document_id)
    - Delete document_chunks (via file_id)
    ↓
Return success response
```

## Monitoring

### Check for Orphaned Records
```sql
-- Check for chunks without documents
SELECT COUNT(*)
FROM document_chunks dc
LEFT JOIN documents d ON dc.document_id = d.id
WHERE d.id IS NULL;

-- Check for files without documents
SELECT COUNT(*)
FROM document_files df
LEFT JOIN documents d ON df.document_id = d.id
WHERE d.id IS NULL;

-- Check for chats without documents
SELECT COUNT(*)
FROM document_chats dc
LEFT JOIN documents d ON dc.document_id = d.id
WHERE d.id IS NULL;
```

These queries should always return 0 if cascade deletes work correctly.

### Storage Cleanup
Periodically verify no orphaned files exist in storage:
```sql
-- List storage files
SELECT * FROM storage.objects
WHERE bucket_id = 'documents';

-- Compare with document_files table
SELECT file_path FROM document_files;
```

## Best Practices

1. **Always use the edge function** - Don't delete directly from database
2. **Log deletions** - Edge function provides detailed logs
3. **Monitor orphaned data** - Run cleanup queries periodically
4. **Test cascade rules** - Verify FK constraints remain intact after migrations
5. **Handle errors gracefully** - Storage failures shouldn't prevent database cleanup

## Troubleshooting

### Files not deleted from storage
- Check Supabase Storage permissions
- Verify file paths are correct
- Review edge function logs

### Database records remain
- Check foreign key constraints
- Verify CASCADE rules are set
- Ensure RLS policies allow deletion

### Slow deletions
- Large number of chunks (embeddings) take time
- Consider batch operations for bulk deletes
- Monitor database performance

## Future Enhancements

Potential improvements:
1. Soft deletes with recovery period
2. Bulk deletion support
3. Deletion audit logs table
4. Background job for large deletions
5. Storage cleanup verification job
