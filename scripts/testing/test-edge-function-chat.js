// Test Supabase Edge Function for chat-document
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

console.log('🧪 Testing Supabase Edge Function: chat-document\n');
console.log('='.repeat(70));
console.log('Supabase URL:', supabaseUrl);
console.log('='.repeat(70));
console.log('');

(async () => {
  try {
    // First, get a document ID from the database
    console.log('📋 Step 1: Fetching a document to test with...');

    const documentsResponse = await fetch(`${supabaseUrl}/rest/v1/documents?select=id,name&limit=1`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
    });

    if (!documentsResponse.ok) {
      throw new Error(`Failed to fetch documents: ${documentsResponse.status}`);
    }

    const documents = await documentsResponse.json();

    if (documents.length === 0) {
      console.log('❌ No documents found in database. Please upload a document first.');
      process.exit(1);
    }

    const testDocument = documents[0];
    console.log(`✅ Using document: "${testDocument.name}" (ID: ${testDocument.id})`);
    console.log('');

    // Test the chat endpoint
    console.log('💬 Step 2: Testing chat-document Edge Function...');
    console.log('-'.repeat(70));

    const startTime = Date.now();
    const chatResponse = await fetch(`${supabaseUrl}/functions/v1/chat-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        document_id: testDocument.id,
        question: 'What is this document about? Give me a brief summary.',
        user_id: 'test-user-123', // Test user ID
      }),
    });

    const duration = Date.now() - startTime;

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      console.log(`❌ Edge Function failed: ${chatResponse.status}`);
      console.log('Error response:', errorText);
      process.exit(1);
    }

    const chatData = await chatResponse.json();

    console.log('✅ Edge Function responded successfully!');
    console.log('Duration:', duration + 'ms');
    console.log('');
    console.log('Response:');
    console.log('-'.repeat(70));
    console.log(chatData.answer);
    console.log('-'.repeat(70));
    console.log('');
    console.log('Sources found:', chatData.sources?.length || 0);

    if (chatData.sources && chatData.sources.length > 0) {
      console.log('Top source similarity:', Math.round(chatData.sources[0].similarity * 100) + '%');
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('🎉 Chat functionality is working correctly!');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check if Edge Function environment variables are set in Supabase dashboard');
    console.error('2. Verify vLLM tunnels are running (embedder and chat)');
    console.error('3. Check Supabase Edge Function logs for detailed errors');
    process.exit(1);
  }
})();
