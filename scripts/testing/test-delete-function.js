/**
 * Test the delete_document_cascade function
 *
 * This script tests if the database function exists and can be called
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from root .env
dotenv.config({ path: join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration');
  console.error('SUPABASE_URL:', supabaseUrl ? '✓ Set' : '✗ Missing');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓ Set' : '✗ Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testDeleteFunction() {
  console.log('🧪 Testing delete_document_cascade function\n');

  // Step 1: Check if function exists
  console.log('1️⃣ Checking if delete_document_cascade function exists...');
  const { data: functions, error: funcError } = await supabase
    .rpc('delete_document_cascade', {
      p_document_id: '00000000-0000-0000-0000-000000000000',
      p_user_id: '00000000-0000-0000-0000-000000000000'
    });

  if (funcError) {
    if (funcError.message.includes('function') && funcError.message.includes('does not exist')) {
      console.error('❌ Function delete_document_cascade does not exist in database!');
      console.error('   The migration may not have been applied.');
      console.error('   Run: npx supabase db push');
      return;
    } else {
      console.log('✅ Function exists (expected "not found" error for dummy ID)');
      console.log('   Error:', funcError.message);
    }
  } else {
    console.log('✅ Function exists');
    console.log('   Result:', functions);
  }

  // Step 2: Get a real document to test with
  console.log('\n2️⃣ Finding a test document...');
  const { data: documents, error: docsError } = await supabase
    .from('documents')
    .select('id, user_id, name')
    .limit(1);

  if (docsError) {
    console.error('❌ Failed to fetch documents:', docsError.message);
    return;
  }

  if (!documents || documents.length === 0) {
    console.log('⚠️ No documents found in database to test with');
    return;
  }

  const testDoc = documents[0];
  console.log('✅ Found test document:', {
    id: testDoc.id,
    name: testDoc.name,
    user_id: testDoc.user_id
  });

  // Step 3: Check related data
  console.log('\n3️⃣ Checking related data for document:', testDoc.id);

  const { count: chunkCount } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', testDoc.id);

  const { count: chatCount } = await supabase
    .from('document_chats')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', testDoc.id);

  console.log('   Chunks:', chunkCount);
  console.log('   Chats:', chatCount);

  console.log('\n✅ Delete function test complete');
  console.log('\nℹ️ To manually test delete, use:');
  console.log(`   DELETE FROM http://localhost:5000/api/documents/${testDoc.id}`);
  console.log('   Or use the UI delete button');
}

testDeleteFunction().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
