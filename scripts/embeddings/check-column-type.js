// Check the embedding column type
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Query the column info using Supabase RPC or raw SQL
const { data, error } = await supabase
  .from('information_schema.columns')
  .select('column_name, data_type, udt_name')
  .eq('table_name', 'document_chunks')
  .eq('column_name', 'embedding');

if (error) {
  console.error('Error:', error);
  // Try direct SQL query instead
  const { data: sqlData, error: sqlError } = await supabase.rpc('sql', {
    query: `SELECT column_name, data_type, udt_name
            FROM information_schema.columns
            WHERE table_name = 'document_chunks' AND column_name = 'embedding'`
  });

  if (sqlError) {
    console.error('SQL Error:', sqlError);
  } else {
    console.log('Column info:', sqlData);
  }
} else {
  console.log('Column info:', data);
}
