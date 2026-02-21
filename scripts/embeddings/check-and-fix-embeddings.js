// Check all documents and process any with missing embeddings
import dotenv from 'dotenv';

dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

console.log('🔍 Checking for Missing Embeddings\n');
console.log('='.repeat(70));
console.log(`📍 Backend URL: ${BACKEND_URL}`);
console.log('='.repeat(70));
console.log('');

(async () => {
  try {
    // Check backend status
    console.log('🔍 Checking backend status...');
    const statusResponse = await fetch(`${BACKEND_URL}/api/documents/status`);

    if (!statusResponse.ok) {
      console.error('❌ Backend is not responding');
      console.error('   Make sure the backend server is running on port 5000');
      process.exit(1);
    }

    console.log('✅ Backend is running\n');

    // Trigger embedding check and processing
    console.log('🔄 Checking all documents for missing embeddings...\n');
    const response = await fetch(`${BACKEND_URL}/api/documents/check-embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    console.log('\n' + '='.repeat(70));

    if (result.success) {
      console.log('✅ Embedding Check Complete!\n');
      console.log('📊 Summary:');
      console.log(`   Total documents: ${result.totalDocuments}`);
      console.log(`   Documents with missing embeddings: ${result.documentsWithMissingEmbeddings}`);
      console.log(`   Total chunks: ${result.totalChunks}`);
      console.log(`   Chunks without embeddings: ${result.chunksWithoutEmbeddings}`);
      console.log(`   Documents processed: ${result.documentsProcessed}`);
      console.log(`   Errors: ${result.errors.length}`);
      console.log('');

      if (result.errors.length > 0) {
        console.log('⚠️  Errors encountered:');
        result.errors.forEach((err) => {
          console.log(`   - ${err}`);
        });
        console.log('');
      }

      if (result.chunksWithoutEmbeddings === 0) {
        console.log('🎉 All documents have complete embeddings!');
      } else if (result.documentsProcessed > 0) {
        console.log('✅ Missing embeddings have been processed');
      }
    } else {
      console.log('❌ Embedding check failed');
      console.log('Error:', result.error || 'Unknown error');
    }

    console.log('='.repeat(70));
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure the backend server is running: npm run dev:server');
    console.error('2. Check that BACKEND_URL is correct in .env');
    console.error('3. Verify the embedding API is accessible');
    process.exit(1);
  }
})();
