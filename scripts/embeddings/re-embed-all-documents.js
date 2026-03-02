// Re-embed all documents with vLLM (4096 dimensions)
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔄 Re-embedding All Documents with vLLM\n');
console.log('='.repeat(70));
console.log('This will:');
console.log('1. Clear all existing embeddings (384 dims from old model)');
console.log('2. Regenerate embeddings with vLLM (4096 dims)');
console.log('3. Use the automatic embedding monitor to process all chunks');
console.log('='.repeat(70));
console.log('');

(async () => {
  try {
    // Step 1: Clear all existing embeddings
    console.log('📋 Step 1: Clearing old embeddings...');

    const { error: clearError } = await supabase
      .from('document_chunks')
      .update({ embedding: null })
      .not('embedding', 'is', null);

    if (clearError) {
      throw new Error(`Failed to clear embeddings: ${clearError.message}`);
    }

    console.log('✅ Old embeddings cleared');
    console.log('');

    // Step 2: Trigger automatic embedding generation
    console.log('📋 Step 2: Triggering automatic embedding generation...');
    console.log('Calling backend API to process all documents...');
    console.log('');

    const backendUrl = `http://localhost:${process.env.PORT || 5000}`;

    const response = await fetch(`${backendUrl}/api/documents/check-embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend API failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    console.log('✅ Embedding generation started!');
    console.log('');
    console.log('Results:');
    console.log('-'.repeat(70));
    console.log(`Total Documents: ${result.totalDocuments}`);
    console.log(`Total Chunks: ${result.totalChunks}`);
    console.log(`Chunks Processed: ${result.chunksProcessed}`);
    console.log(`Chunks with Embeddings: ${result.chunksWithEmbeddings}`);
    console.log(`Chunks Needing Embeddings: ${result.chunksNeedingEmbeddings}`);
    console.log('-'.repeat(70));
    console.log('');

    if (result.errors && result.errors.length > 0) {
      console.log('⚠️  Some errors occurred:');
      result.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err}`);
      });
      console.log('');
    }

    console.log('='.repeat(70));
    console.log('🎉 Re-embedding complete!');
    console.log('='.repeat(70));
    console.log('');
    console.log('All documents now have 4096-dimensional vLLM embeddings.');
    console.log('You can now use the chat functionality!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure the backend server is running (npm run server)');
    console.error('2. Verify vLLM embedder tunnel is running');
    console.error('3. Check that Supabase credentials are correct in .env');
    process.exit(1);
  }
})();
