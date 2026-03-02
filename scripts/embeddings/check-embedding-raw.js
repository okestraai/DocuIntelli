// Check raw embedding data
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
  .limit(1);

if (error) {
  console.error('Error:', error);
} else if (data && data.length > 0) {
  const chunk = data[0];
  console.log('Chunk ID:', chunk.id);
  console.log('Embedding type:', typeof chunk.embedding);
  console.log('Embedding is array:', Array.isArray(chunk.embedding));

  if (Array.isArray(chunk.embedding)) {
    console.log('Array length:', chunk.embedding.length);
    console.log('First few values:', chunk.embedding.slice(0, 5));
  } else if (typeof chunk.embedding === 'string') {
    console.log('String length:', chunk.embedding.length);
    console.log('First 200 chars:', chunk.embedding.substring(0, 200));
  } else {
    console.log('Embedding value:', chunk.embedding);
  }
}
