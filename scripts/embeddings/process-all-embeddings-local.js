// Process all chunks using the local embedding API
import dotenv from 'dotenv';

dotenv.config();

const EMBEDDING_API_URL = process.env.EMBEDDING_API_URL || 'http://localhost:8001/v1/embeddings';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'intfloat/e5-mistral-7b-instruct';
const BACKEND_API_URL = 'http://localhost:5000/api/documents/generate-embeddings-local';

console.log('🧮 Processing All Embeddings with Local API\n');
console.log('='.repeat(70));
console.log(`📍 Embedding API: ${EMBEDDING_API_URL}`);
console.log(`🤖 Model: ${EMBEDDING_MODEL}`);
console.log('='.repeat(70));

(async () => {
  try {
    // Test if embedding API is available
    console.log('\n🔍 Testing embedding API...');
    const testResponse = await fetch(EMBEDDING_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: 'test',
      }),
    });

    if (!testResponse.ok) {
      throw new Error(`Embedding API not available: ${testResponse.status}`);
    }

    console.log('✅ Embedding API is available\n');

    // Call backend to process all embeddings
    console.log('🔄 Triggering embedding processing via backend...\n');

    const response = await fetch(BACKEND_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Backend error: ${result.error || response.statusText}`);
    }

    console.log('\n✅ Embedding processing completed!');
    console.log(`📊 Processed: ${result.processed || 0} chunks`);
    console.log(`⏱️  Duration: ${result.duration ? `${(result.duration / 1000).toFixed(1)}s` : 'N/A'}`);

    if (result.errors && result.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered: ${result.errors.length}`);
      result.errors.slice(0, 5).forEach((err, i) => {
        console.log(`   ${i + 1}. ${err}`);
      });
      if (result.errors.length > 5) {
        console.log(`   ... and ${result.errors.length - 5} more`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('🎉 All embeddings processed with local API!');
    console.log('📋 Run: node check-embeddings.js to verify');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\n💡 Make sure:');
    console.log('   1. Local embedding server is running on port 8001');
    console.log('   2. Backend server is running on port 5000');
    console.log('   3. Database migration has been applied');
    process.exit(1);
  }
})();
