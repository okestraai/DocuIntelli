// Verify all chunks have embeddings and process any missing ones
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Comprehensive Embedding Verification\n');
console.log('='.repeat(70));

(async () => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get total count
    const { count: totalCount } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true });

    // Get chunks with embeddings
    const { count: withEmbeddings } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    // Get chunks without embeddings
    const { data: withoutEmbeddings, error } = await supabase
      .from('document_chunks')
      .select('id, document_id, chunk_index, chunk_text')
      .is('embedding', null);

    if (error) {
      console.error('❌ Error querying database:', error);
      process.exit(1);
    }

    console.log('📊 Statistics:');
    console.log(`   Total chunks: ${totalCount}`);
    console.log(`   With embeddings: ${withEmbeddings} (${((withEmbeddings / totalCount) * 100).toFixed(1)}%)`);
    console.log(`   Without embeddings: ${withoutEmbeddings?.length || 0} (${(((withoutEmbeddings?.length || 0) / totalCount) * 100).toFixed(1)}%)`);
    console.log('');

    if (withoutEmbeddings && withoutEmbeddings.length > 0) {
      console.log(`⚠️  Found ${withoutEmbeddings.length} chunks without embeddings:`);
      console.log('');

      // Group by document
      const byDocument = {};
      withoutEmbeddings.forEach((chunk) => {
        if (!byDocument[chunk.document_id]) {
          byDocument[chunk.document_id] = [];
        }
        byDocument[chunk.document_id].push(chunk);
      });

      Object.keys(byDocument).forEach((docId) => {
        const chunks = byDocument[docId];
        console.log(`   Document: ${docId}`);
        console.log(`   Missing chunks: ${chunks.map(c => c.chunk_index).join(', ')}`);
        console.log('');
      });

      console.log('='.repeat(70));
      console.log('🔄 Need to process missing embeddings');
      console.log('Run: node process-all-embeddings-local.js');
      console.log('='.repeat(70));
      process.exit(1);
    } else {
      console.log('✅ All chunks have embeddings!');
      console.log('='.repeat(70));
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
