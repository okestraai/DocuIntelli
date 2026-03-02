// Process all embeddings gradually to avoid compute limits
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🧮 Processing All Embeddings (Gradual Mode)\n');
console.log('='.repeat(70));

async function generateEmbedding(chunkId, chunkText) {
  try {
    const embeddingUrl = `${supabaseUrl}/functions/v1/generate-embeddings`;

    const response = await fetch(embeddingUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        limit: 1,
        continue_processing: false,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Embedding generation failed');
    }

    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function processAllEmbeddings() {
  let processedCount = 0;
  let errorCount = 0;
  let totalRemaining = 0;

  // Get initial count
  const { count: initialCount } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);

  totalRemaining = initialCount || 0;

  console.log(`\n📊 Total chunks without embeddings: ${totalRemaining}\n`);

  if (totalRemaining === 0) {
    console.log('✅ All chunks already have embeddings!');
    return;
  }

  console.log('🔄 Starting gradual processing (batch size: 1)...\n');

  // Process until no more chunks remain
  while (totalRemaining > 0) {
    console.log(`📝 Processing chunk ${processedCount + 1}...`);

    const result = await generateEmbedding();

    if (result.success) {
      processedCount++;
      totalRemaining = result.result.remaining || 0;
      console.log(`   ✅ Success! Remaining: ${totalRemaining}`);

      // Small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else {
      errorCount++;
      console.log(`   ❌ Error: ${result.error}`);

      // If we hit errors, wait longer before retrying
      if (errorCount >= 3) {
        console.log('\n⚠️  Multiple errors detected. Stopping to avoid rate limits.');
        console.log(`   Processed: ${processedCount}`);
        console.log(`   Remaining: ${totalRemaining}`);
        console.log(`   Errors: ${errorCount}`);
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // Progress update every 10 chunks
    if (processedCount % 10 === 0 && processedCount > 0) {
      console.log(`\n📊 Progress: ${processedCount} processed, ${totalRemaining} remaining\n`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 Final Summary:');
  console.log(`   Processed: ${processedCount}`);
  console.log(`   Remaining: ${totalRemaining}`);
  console.log(`   Errors: ${errorCount}`);
  console.log('='.repeat(70));

  if (totalRemaining === 0) {
    console.log('\n🎉 All embeddings processed successfully!');
  } else {
    console.log(`\n⚠️  ${totalRemaining} chunks still need processing.`);
    console.log('   Run this script again or wait for periodic processing.');
  }
}

processAllEmbeddings();
