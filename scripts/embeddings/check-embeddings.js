// Check if chunks have embeddings
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔍 Checking Embedding Status\n');
console.log('='.repeat(70));

(async () => {
  // Get chunks with and without embeddings
  const { count: totalChunks } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true });

  const { count: chunksWithEmbeddings } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .not('embedding', 'is', null);

  const { count: chunksWithoutEmbeddings } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);

  console.log('\n📊 Embedding Statistics:');
  console.log(`   Total chunks: ${totalChunks}`);
  console.log(`   Chunks with embeddings: ${chunksWithEmbeddings} (${((chunksWithEmbeddings / totalChunks) * 100).toFixed(1)}%)`);
  console.log(`   Chunks without embeddings: ${chunksWithoutEmbeddings} (${((chunksWithoutEmbeddings / totalChunks) * 100).toFixed(1)}%)`);

  // Get sample chunks without embeddings
  if (chunksWithoutEmbeddings > 0) {
    console.log('\n📄 Sample chunks without embeddings:');
    const { data: sampleChunks } = await supabase
      .from('document_chunks')
      .select('id, document_id, chunk_index, chunk_text')
      .is('embedding', null)
      .limit(5);

    sampleChunks.forEach((chunk, i) => {
      console.log(`   ${i + 1}. Document ID: ${chunk.document_id}`);
      console.log(`      Chunk ${chunk.chunk_index}: ${chunk.chunk_text.substring(0, 60)}...`);
    });
  }

  console.log('\n' + '='.repeat(70));

  if (chunksWithoutEmbeddings === 0) {
    console.log('✅ All chunks have embeddings!');
  } else {
    console.log('⚠️  Some chunks are missing embeddings.');
    console.log('   Run: curl -X POST http://localhost:5000/api/documents/generate-embeddings');
  }
})();
