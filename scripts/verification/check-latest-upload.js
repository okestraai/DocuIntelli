// Check embedding status for latest uploaded document
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkLatestUpload() {
  console.log('🔍 Checking latest document upload...\n');

  try {
    // Get the most recent document
    const { data: latestDoc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (docError || !latestDoc) {
      console.log('❌ No documents found or error:', docError);
      return;
    }

    console.log('📄 Latest Document:');
    console.log(`   Name: ${latestDoc.name}`);
    console.log(`   ID: ${latestDoc.id}`);
    console.log(`   Type: ${latestDoc.file_type || 'N/A'}`);
    console.log(`   Created: ${new Date(latestDoc.created_at).toLocaleString()}`);
    console.log();

    // Check if chunks exist
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, chunk_index, embedding, created_at')
      .eq('document_id', latestDoc.id)
      .order('chunk_index', { ascending: true });

    if (chunksError) {
      console.log('❌ Error fetching chunks:', chunksError);
      return;
    }

    if (!chunks || chunks.length === 0) {
      console.log('⏳ Status: No chunks created yet');
      console.log('   Chunks are being processed...');
      return;
    }

    console.log(`📊 Chunks: ${chunks.length} total`);

    // Check embedding status
    const chunksWithEmbedding = chunks.filter(c => c.embedding && c.embedding.length > 0);
    const chunksWithoutEmbedding = chunks.filter(c => !c.embedding || c.embedding.length === 0);

    console.log(`   ✅ With embeddings: ${chunksWithEmbedding.length}`);
    console.log(`   ⏳ Without embeddings: ${chunksWithoutEmbedding.length}`);
    console.log();

    if (chunksWithEmbedding.length === chunks.length) {
      console.log('✅ Status: ALL EMBEDDINGS COMPLETE!');
      console.log('   Document is ready for AI chat');

      // Show sample embedding info
      if (chunksWithEmbedding.length > 0) {
        const sampleEmbedding = chunksWithEmbedding[0].embedding;
        console.log(`   Embedding dimensions: ${sampleEmbedding.length}`);
      }
    } else if (chunksWithEmbedding.length > 0) {
      const progress = ((chunksWithEmbedding.length / chunks.length) * 100).toFixed(1);
      console.log(`⏳ Status: IN PROGRESS (${progress}%)`);
      console.log(`   ${chunksWithEmbedding.length} of ${chunks.length} chunks embedded`);
      console.log('   Still processing...');
    } else {
      console.log('⏳ Status: PENDING');
      console.log('   Chunks created, waiting for embedding generation');
      console.log('   This may take a few moments...');
    }

    // Show chunk details
    console.log('\n📋 Chunk Details:');
    chunks.slice(0, 5).forEach((chunk, idx) => {
      const status = chunk.embedding && chunk.embedding.length > 0 ? '✅' : '⏳';
      console.log(`   ${status} Chunk ${chunk.chunk_index}: ${chunk.embedding ? `${chunk.embedding.length}D vector` : 'No embedding'}`);
    });

    if (chunks.length > 5) {
      console.log(`   ... and ${chunks.length - 5} more chunks`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkLatestUpload();
