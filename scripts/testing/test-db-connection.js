// Quick test script to verify Supabase database connection
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Testing Supabase connection...\n');
console.log('URL:', supabaseUrl);
console.log('Key:', supabaseKey ? '✓ Set' : '✗ Missing');

const supabase = createClient(supabaseUrl, supabaseKey);

// Test 1: Check if we can connect and query the documents table
async function testConnection() {
  try {
    console.log('\n📊 Test 1: Checking documents table...');
    const { data, error, count } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('❌ Error querying documents:', error.message);
      return false;
    }

    console.log('✅ Documents table accessible');
    console.log(`📝 Total documents in database: ${count}`);
    return true;
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    return false;
  }
}

// Test 2: Check if document_chunks table exists
async function testChunksTable() {
  try {
    console.log('\n📊 Test 2: Checking document_chunks table...');
    const { data, error, count } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('❌ Error querying document_chunks:', error.message);
      return false;
    }

    console.log('✅ Document_chunks table accessible');
    console.log(`📝 Total chunks in database: ${count}`);
    return true;
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    return false;
  }
}

// Test 3: Check storage bucket
async function testStorage() {
  try {
    console.log('\n📦 Test 3: Checking storage bucket...');
    const { data, error } = await supabase.storage.listBuckets();

    if (error) {
      console.error('❌ Error accessing storage:', error.message);
      return false;
    }

    console.log('✅ Storage accessible');
    console.log('📂 Buckets:', data.map(b => b.name).join(', ') || 'None');
    return true;
  } catch (err) {
    console.error('❌ Storage check failed:', err.message);
    return false;
  }
}

// Run all tests
(async () => {
  const test1 = await testConnection();
  const test2 = await testChunksTable();
  const test3 = await testStorage();

  console.log('\n' + '='.repeat(50));
  console.log('📋 Test Summary:');
  console.log('='.repeat(50));
  console.log(`Documents table: ${test1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Document_chunks table: ${test2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Storage: ${test3 ? '✅ PASS' : '❌ FAIL'}`);
  console.log('='.repeat(50));

  if (test1 && test2 && test3) {
    console.log('\n🎉 All tests passed! Database is properly connected.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the migrations and database setup.');
  }

  process.exit(test1 && test2 && test3 ? 0 : 1);
})();
