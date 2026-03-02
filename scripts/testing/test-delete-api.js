/**
 * Test the DELETE /api/documents/:id endpoint
 *
 * This script simulates what the frontend does when deleting a document
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from root .env
dotenv.config({ path: join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase configuration');
  console.error('SUPABASE_URL:', supabaseUrl ? '✓ Set' : '✗ Missing');
  console.error('SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓ Set' : '✗ Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testDeleteAPI() {
  console.log('🧪 Testing DELETE /api/documents/:id endpoint\n');

  // Step 1: Get the current session
  console.log('1️⃣ Getting current user session...');
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session) {
    console.error('❌ No active session. Please login first.');
    console.error('   Error:', sessionError?.message);
    process.exit(1);
  }

  console.log('✅ User authenticated:', {
    user_id: session.user.id,
    email: session.user.email
  });

  // Step 2: Get a document to delete
  console.log('\n2️⃣ Finding a document to delete...');
  const { data: documents, error: docsError } = await supabase
    .from('documents')
    .select('id, name, user_id, file_path')
    .eq('user_id', session.user.id)
    .limit(1);

  if (docsError) {
    console.error('❌ Failed to fetch documents:', docsError.message);
    process.exit(1);
  }

  if (!documents || documents.length === 0) {
    console.log('⚠️ No documents found for this user');
    process.exit(0);
  }

  const testDoc = documents[0];
  console.log('✅ Found document to test:', {
    id: testDoc.id,
    name: testDoc.name,
    file_path: testDoc.file_path
  });

  // Step 3: Check related data before delete
  console.log('\n3️⃣ Checking related data before delete...');

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

  // Step 4: Attempt DELETE via API
  console.log('\n4️⃣ Calling DELETE API endpoint...');
  console.log('   URL: http://localhost:5000/api/documents/' + testDoc.id);

  try {
    const response = await fetch(`http://localhost:5000/api/documents/${testDoc.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('   Status:', response.status, response.statusText);

    if (!response.ok) {
      console.error('❌ Delete request failed');

      // Try to parse error response
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        console.error('   Error:', JSON.stringify(errorData, null, 2));
      } else {
        const errorText = await response.text();
        console.error('   Error (text):', errorText);
      }

      process.exit(1);
    }

    const result = await response.json();
    console.log('✅ Delete successful!');
    console.log('   Response:', JSON.stringify(result, null, 2));

    // Step 5: Verify deletion
    console.log('\n5️⃣ Verifying deletion in database...');

    const { data: deletedDoc } = await supabase
      .from('documents')
      .select('id')
      .eq('id', testDoc.id)
      .maybeSingle();

    if (deletedDoc) {
      console.error('❌ Document still exists in database!');
    } else {
      console.log('✅ Document successfully removed from database');
    }

    const { count: remainingChunks } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', testDoc.id);

    const { count: remainingChats } = await supabase
      .from('document_chats')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', testDoc.id);

    console.log('   Remaining chunks:', remainingChunks);
    console.log('   Remaining chats:', remainingChats);

    if (remainingChunks === 0 && remainingChats === 0) {
      console.log('✅ All related data successfully removed');
    } else {
      console.error('⚠️ Some related data was not deleted');
    }

  } catch (fetchError) {
    console.error('❌ Network error during delete:');
    console.error('   ', fetchError.message);
    console.error('\n💡 Possible issues:');
    console.error('   - Backend server not running on port 5000');
    console.error('   - Network connectivity issues');
    console.error('   - CORS configuration problem');
    process.exit(1);
  }

  console.log('\n✅ Test complete!');
}

testDeleteAPI().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
