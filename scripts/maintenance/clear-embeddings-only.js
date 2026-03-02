// Clear all embeddings
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('Clearing all embeddings...');

const { error } = await supabase
  .from('document_chunks')
  .update({ embedding: null })
  .not('embedding', 'is', null);

if (error) {
  console.error('Error:', error);
} else {
  console.log('✅ All embeddings cleared');
}
