# Automatic Tag Generation Workflow

## Summary of Changes

Fixed the automatic tag generation workflow to ensure no manual intervention is needed.

### Changes Made

1. **vllmEmbeddings.ts** (`processDocumentVLLMEmbeddings`):
   - Added automatic tag generation trigger after embeddings reach 60% completion
   - Tags are generated automatically at the end of embedding processing
   - Includes error handling with fallback to next monitoring cycle

2. **embeddingMonitor.ts** (`checkAndProcessMissingEmbeddings`):
   - Added check for documents with complete embeddings but no tags
   - Automatically triggers tag generation for documents missing tags
   - Runs every 30 minutes as part of the monitoring cycle

### Complete Automatic Workflow

#### When a New Document is Uploaded:

1. **Document Upload** → User uploads document via frontend
2. **Chunking** → Document is automatically chunked into smaller pieces
3. **Embedding Generation** → vLLM generates 4096-dim embeddings for each chunk
4. **Tag Generation (Auto)** → When embeddings reach 60% completion:
   - Edge Function `generate-tags` is automatically called
   - vLLM analyzes document content
   - 5 relevant tags are generated and saved
   - No manual trigger needed!

#### Backup/Recovery (Every 30 Minutes):

The embedding monitor runs automatically and:
1. Checks all documents for missing embeddings
2. Processes any chunks without embeddings
3. **Checks for documents missing tags**
4. **Automatically generates tags** for any document with embeddings but no tags

### Key Features

✅ **Zero Manual Intervention**: Tags are generated automatically
✅ **60% Threshold**: Tags generated once majority of embeddings complete
✅ **Automatic Recovery**: Monitor catches any missed tag generations
✅ **Error Resilient**: Falls back to next monitoring cycle if generation fails
✅ **Self-Healing**: Any document with embeddings but no tags will be processed

### Testing

To verify the workflow works:

1. Upload a new document through the frontend
2. Wait for embedding generation to complete (60%+)
3. Check document tags - they should appear automatically
4. If tags don't appear immediately, wait for next monitor cycle (up to 30 minutes)

### Edge Cases Handled

- Network failures during tag generation → Retried on next monitor cycle
- Tunnel downtime → Retried on next monitor cycle
- vLLM service unavailable → Retried on next monitor cycle
- Documents uploaded during migration → Monitor will catch and process them

### No Manual Triggers Needed

The system is now fully automatic. Tags will be generated without any manual intervention through:
- Immediate generation after embedding completion (60%+)
- Backup generation every 30 minutes via monitor
- Recovery for any previously missed documents
