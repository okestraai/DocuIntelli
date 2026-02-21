/**
 * Test vector similarity search with the new embeddings
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

async function testVectorSearch() {
  console.log('🧪 Testing Vector Similarity Search\n');

  // Get the latest document
  const { data: latestDoc } = await supabase
    .from('documents')
    .select('id, name')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!latestDoc) {
    console.error('❌ No documents found');
    return;
  }

  console.log('📄 Testing with document:', latestDoc.name);
  console.log('   Document ID:', latestDoc.id);

  // Get a sample chunk to use its embedding as query
  const { data: sampleChunk } = await supabase
    .from('document_chunks')
    .select('chunk_text, embedding')
    .eq('document_id', latestDoc.id)
    .not('embedding', 'is', null)
    .limit(1)
    .single();

  if (!sampleChunk) {
    console.error('❌ No chunks with embeddings found');
    return;
  }

  console.log('\n📝 Using sample chunk as query:');
  console.log('   Text preview:', sampleChunk.chunk_text.substring(0, 100) + '...');

  // Parse embedding if it's a string
  let queryEmbedding = sampleChunk.embedding;
  if (typeof queryEmbedding === 'string') {
    queryEmbedding = JSON.parse(queryEmbedding);
  }

  console.log('   Embedding dimensions:', queryEmbedding.length);

  // Test the match function
  console.log('\n🔍 Testing match_document_chunks function...');

  const { data: matches, error } = await supabase
    .rpc('match_document_chunks', {
      query_embedding: queryEmbedding,
      match_document_id: latestDoc.id,
      match_count: 5,
      similarity_threshold: 0.3
    });

  if (error) {
    console.error('❌ Search failed:', error.message);
    return;
  }

  if (!matches || matches.length === 0) {
    console.error('❌ No matches found');
    console.log('   This might indicate an issue with the vector search configuration');
    return;
  }

  console.log(`✅ Found ${matches.length} similar chunks:\n`);

  matches.forEach((match, index) => {
    console.log(`${index + 1}. Chunk ${match.chunk_index}`);
    console.log(`   Similarity: ${(match.similarity * 100).toFixed(2)}%`);
    console.log(`   Text: ${match.chunk_text.substring(0, 80)}...`);
    console.log();
  });

  console.log('✅ Vector similarity search is working correctly!');
  console.log('   The embeddings are properly stored and searchable.');
}

testVectorSearch().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
