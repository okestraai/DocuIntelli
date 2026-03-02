/**
 * Check actual embedding data structure
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

async function checkEmbeddingData() {
  console.log('🔍 Checking embedding data structure\n');

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

  console.log('📄 Document:', latestDoc.name);

  // Get first chunk with embedding
  const { data: chunk, error } = await supabase
    .from('document_chunks')
    .select('chunk_text, embedding')
    .eq('document_id', latestDoc.id)
    .not('embedding', 'is', null)
    .limit(1)
    .single();

  if (error || !chunk) {
    console.error('❌ No chunks with embeddings found');
    return;
  }

  console.log('\n📊 Chunk Analysis:');
  console.log('   Text length:', chunk.chunk_text.length, 'characters');
  console.log('   Text preview:', chunk.chunk_text.substring(0, 100) + '...');

  const embedding = chunk.embedding;

  console.log('\n🔢 Embedding Analysis:');
  console.log('   Type:', typeof embedding);
  console.log('   Is Array:', Array.isArray(embedding));

  if (Array.isArray(embedding)) {
    console.log('   Array length:', embedding.length);
    console.log('   First 5 values:', embedding.slice(0, 5));
    console.log('   Last 5 values:', embedding.slice(-5));

    // Check if values are numbers
    const allNumbers = embedding.every(v => typeof v === 'number');
    console.log('   All values are numbers:', allNumbers);

    if (allNumbers) {
      // Check value range (embeddings are usually normalized between -1 and 1)
      const min = Math.min(...embedding);
      const max = Math.max(...embedding);
      console.log('   Value range:', min.toFixed(4), 'to', max.toFixed(4));
    }

    // Expected dimension
    console.log('\n✅ Expected dimensions: 4096 (e5-mistral-7b-instruct)');
    console.log('❌ Actual dimensions:', embedding.length);

    if (embedding.length !== 4096) {
      console.log('\n⚠️  DIMENSION MISMATCH!');
      console.log('   The embedding has incorrect dimensions.');
      console.log('   This will cause issues with vector search.');
    } else {
      console.log('\n✅ Dimensions are correct!');
    }
  } else if (typeof embedding === 'string') {
    console.log('   ⚠️  Embedding is stored as STRING, not array');
    console.log('   String length:', embedding.length);
    console.log('   Preview:', embedding.substring(0, 100));

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(embedding);
      if (Array.isArray(parsed)) {
        console.log('   ✅ String is valid JSON array');
        console.log('   Array length after parsing:', parsed.length);
      }
    } catch (e) {
      console.log('   ❌ Not valid JSON');
    }
  } else {
    console.log('   ⚠️  Unknown embedding type');
  }
}

checkEmbeddingData().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
