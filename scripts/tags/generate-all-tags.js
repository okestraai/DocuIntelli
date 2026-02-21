// Generate tags for all documents without tags
import dotenv from 'dotenv';

dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

console.log('🏷️  Generating Tags for All Documents\n');
console.log('='.repeat(70));
console.log(`📍 Backend URL: ${BACKEND_URL}`);
console.log('='.repeat(70));
console.log('');

(async () => {
  try {
    // First, check backend status
    console.log('🔍 Checking backend status...');
    const statusResponse = await fetch(`${BACKEND_URL}/api/documents/status`);

    if (!statusResponse.ok) {
      console.error('❌ Backend is not responding');
      console.error('   Make sure the backend server is running on port 5000');
      process.exit(1);
    }

    console.log('✅ Backend is running\n');

    // Trigger tag generation for all documents
    console.log('🔄 Triggering tag generation...\n');
    const response = await fetch(
      `${BACKEND_URL}/api/documents/generate-all-tags`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const result = await response.json();

    console.log('\n' + '='.repeat(70));

    if (result.success) {
      console.log('✅ Tag Generation Complete!\n');
      console.log('📊 Summary:');
      console.log(`   Total documents processed: ${result.total}`);
      console.log(`   Successfully tagged: ${result.tagged}`);
      console.log(`   Skipped (not enough embeddings): ${result.skipped}`);
      console.log(`   Errors: ${result.errors}`);
      console.log('');

      if (result.results && result.results.length > 0) {
        console.log('📋 Detailed Results:\n');
        result.results.forEach((doc) => {
          if (doc.status === 'tagged') {
            console.log(`✅ ${doc.documentName}`);
            console.log(`   Tags: ${doc.tags.join(', ')}`);
          } else if (doc.status === 'skipped') {
            console.log(`⏭️  ${doc.documentName}`);
            console.log(`   ${doc.message}`);
          } else {
            console.log(`❌ ${doc.documentName}`);
            console.log(`   Error: ${doc.message}`);
          }
          console.log('');
        });
      }

      console.log('='.repeat(70));
      console.log('🎉 All documents processed!');
    } else {
      console.log('❌ Tag generation failed');
      console.log('Error:', result.error || 'Unknown error');
    }

    console.log('='.repeat(70));
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure the backend server is running: npm run dev:server');
    console.error('2. Check that BACKEND_URL is correct in .env');
    console.error('3. Verify OpenAI API key is set in Supabase Edge Function settings');
    process.exit(1);
  }
})();
