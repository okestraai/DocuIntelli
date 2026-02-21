// Check embedding status
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from('document_chunks')
  .select('id, embedding')
  .limit(5);

if (error) {
  console.error('Error:', error);
} else {
  console.log('Sample chunks:');
  data.forEach(chunk => {
    console.log(`  ID: ${chunk.id}`);
    console.log(`  Has embedding: ${chunk.embedding !== null}`);
    console.log(`  Dimensions: ${chunk.embedding?.length || 0}`);
    console.log('');
  });
}

// Count total
const { count, error: countError } = await supabase
  .from('document_chunks')
  .select('id', { count: 'exact', head: true })
  .not('embedding', 'is', null);

console.log(`Total chunks with embeddings: ${count || 0}`);
