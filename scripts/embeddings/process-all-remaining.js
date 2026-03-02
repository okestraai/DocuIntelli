/**
 * Process all remaining chunks with NULL embeddings using continue_processing
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

async function processAllRemaining() {
  console.log('🚀 Processing all remaining embeddings with continue_processing mode\n');

  // Check how many chunks need processing
  const { count: nullCount } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);

  console.log(`📊 Found ${nullCount} chunks without embeddings\n`);

  if (!nullCount || nullCount === 0) {
    console.log('✅ All chunks already have embeddings!');
    return;
  }

  // Trigger embedding generation with continue_processing
  console.log('🔄 Triggering embedding generation with continue_processing=true...\n');

  const response = await fetch(`${supabaseUrl}/functions/v1/generate-embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      limit: 5, // Process 5 at a time
      continue_processing: true // This will recursively process all remaining
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Failed to trigger embedding generation:');
    console.error(errorText);
    process.exit(1);
  }

  const result = await response.json();
  console.log('✅ Embedding generation triggered successfully!\n');
  console.log('📊 Result:', JSON.stringify(result, null, 2));

  // Wait a moment, then check progress
  console.log('\n⏳ Waiting 5 seconds before checking progress...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Check progress
  const { count: remainingCount } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);

  const processed = nullCount - (remainingCount || 0);
  console.log(`\n📊 Progress Update:`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Remaining: ${remainingCount || 0}`);
  console.log(`   Total: ${nullCount}`);
  console.log(`   Progress: ${((processed / nullCount) * 100).toFixed(1)}%`);

  if (remainingCount && remainingCount > 0) {
    console.log('\n💡 Note: Processing continues in the background via continue_processing mode');
    console.log('   Check again in a few moments to see more progress');
    console.log('   Or run: node scripts/verification/check-latest-upload.js');
  } else {
    console.log('\n🎉 All embeddings processed successfully!');
  }
}

processAllRemaining().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
