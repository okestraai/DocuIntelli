// Trigger embedding generation with controlled batching
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🧮 Triggering Embedding Generation\n');
console.log('='.repeat(70));

async function triggerEmbeddings(limit = 1, continueProcessing = false) {
  try {
    const embeddingUrl = `${supabaseUrl}/functions/v1/generate-embeddings`;

    console.log(`\n📊 Requesting ${limit} chunk(s) with continue_processing=${continueProcessing}`);

    const response = await fetch(embeddingUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        limit: limit,
        continue_processing: continueProcessing,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('❌ Error:', result);
      return { success: false, error: result };
    }

    console.log('✅ Success:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    return { success: false, error: error.message };
  }
}

(async () => {
  // Try with different batch sizes
  console.log('\n🔄 Attempting batch size 1...');
  let result = await triggerEmbeddings(1, false);

  if (result.success) {
    console.log('\n✅ Batch size 1 works!');
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Remaining: ${result.remaining}`);

    if (result.remaining > 0) {
      console.log('\n💡 To process all remaining chunks, you can:');
      console.log('   1. Call this endpoint multiple times');
      console.log('   2. Use continue_processing=true (may hit limits)');
      console.log('   3. Schedule periodic processing');
    }
  } else {
    console.log('\n⚠️  Even batch size 1 failed. Possible issues:');
    console.log('   - Supabase AI compute limits on free tier');
    console.log('   - Need to upgrade Supabase plan');
    console.log('   - Consider using external embedding API (OpenAI, etc.)');
  }

  console.log('\n' + '='.repeat(70));
})();
