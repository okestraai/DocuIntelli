/**
 * Process all remaining embeddings in batches
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function processAllBatches() {
  console.log('🚀 Processing all embeddings in batches\n');

  let totalProcessed = 0;
  let batchNumber = 0;
  const batchSize = 5;

  while (true) {
    batchNumber++;

    // Check remaining
    const { count: remainingCount } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null);

    if (!remainingCount || remainingCount === 0) {
      console.log('\n🎉 All embeddings processed!');
      console.log(`   Total processed: ${totalProcessed}`);
      break;
    }

    console.log(`\n📦 Batch ${batchNumber}:`);
    console.log(`   Remaining: ${remainingCount}`);
    console.log(`   Processing up to ${batchSize} chunks...`);

    // Process batch
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        limit: batchSize,
        continue_processing: false
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('   ❌ Batch failed:', errorText);
      break;
    }

    const result = await response.json();
    const updated = result.updated || 0;
    totalProcessed += updated;

    console.log(`   ✅ Processed: ${updated}`);

    if (result.errors && result.errors.length > 0) {
      console.log(`   ⚠️  Errors: ${result.errors.length}`);
      console.log('   First error:', result.errors[0].error.substring(0, 100) + '...');
    }

    // Small delay between batches to avoid overwhelming the service
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Safety check: don't run more than 20 batches in one go
    if (batchNumber >= 20) {
      console.log('\n⚠️  Reached batch limit (20). Run again to continue.');
      console.log(`   Processed so far: ${totalProcessed}`);
      break;
    }
  }

  // Final check
  const { count: finalRemaining } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);

  console.log('\n' + '='.repeat(60));
  console.log('📊 Final Status:');
  console.log(`   Total processed: ${totalProcessed}`);
  console.log(`   Remaining: ${finalRemaining || 0}`);
  console.log('='.repeat(60));
}

processAllBatches().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
