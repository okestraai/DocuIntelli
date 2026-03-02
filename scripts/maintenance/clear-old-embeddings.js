// Clear all existing embeddings to prepare for new 4096-dim embeddings
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🗑️  Clearing Old Embeddings\n');
console.log('='.repeat(70));

(async () => {
  try {
    // Get count of chunks with embeddings
    const { count: totalWithEmbeddings } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    console.log(`\n📊 Chunks with embeddings: ${totalWithEmbeddings}`);

    if (totalWithEmbeddings === 0) {
      console.log('✅ No embeddings to clear!');
      return;
    }

    console.log(`\n⚠️  This will clear ${totalWithEmbeddings} embeddings.`);
    console.log('They will need to be regenerated with the new local API.');

    // Clear all embeddings
    console.log('\n🔄 Clearing embeddings...');

    const { error } = await supabase
      .from('document_chunks')
      .update({ embedding: null })
      .not('embedding', 'is', null);

    if (error) {
      throw new Error(`Failed to clear embeddings: ${error.message}`);
    }

    // Verify
    const { count: remaining } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    console.log(`\n✅ Embeddings cleared successfully!`);
    console.log(`📊 Remaining embeddings: ${remaining}`);

    console.log('\n' + '='.repeat(70));
    console.log('📝 Next steps:');
    console.log('   1. Ensure local embedding server is running (port 8001)');
    console.log('   2. Run: node process-all-embeddings-local.js');
    console.log('   3. All chunks will be re-embedded with 4096-dim vectors');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
})();
