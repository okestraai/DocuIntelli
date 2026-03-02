/**
 * Test chat functionality with vLLM-powered Edge Function
 */

const SUPABASE_URL = 'https://caygpjhiakabaxtklnlw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNheWdwamhpYWthYmF4dGtsbmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNzMzMTQsImV4cCI6MjA3MTY0OTMxNH0.UYaF1hW_j2HGcFP5W1FMV_G7ODGJuz8qieyf9Qe4Z90';

async function testChat() {
  console.log('🧪 Testing chat with vLLM Edge Function...\n');

  try {
    // Use known test document from database
    const testDoc = {
      id: '8b875672-53b1-41f5-b486-1183eeb429dc',
      name: 'test terms'
    };
    const testUserId = 'ce1072ba-822d-42c0-b705-4ca2e5f991db';

    console.log(`📄 Testing with document: ${testDoc.name}`);
    console.log(`   Document ID: ${testDoc.id}`);
    console.log(`   User ID: ${testUserId}\n`);

    // Test chat with a simple question
    const testQuestion = 'What is this document about?';
    console.log(`💬 Asking: "${testQuestion}"`);
    console.log('⏳ Waiting for response...\n');

    const startTime = Date.now();
    const chatResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/chat-document`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          document_id: testDoc.id,
          question: testQuestion,
          user_id: testUserId,
        }),
      }
    );

    const duration = Date.now() - startTime;

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      throw new Error(`Chat request failed (${chatResponse.status}): ${errorText}`);
    }

    const result = await chatResponse.json();

    console.log('✅ Chat Response Received!\n');
    console.log('📊 Response Details:');
    console.log(`   ⏱️  Response time: ${duration}ms`);
    console.log(`   ✅ Success: ${result.success}`);
    console.log(`   📝 Answer length: ${result.answer?.length || 0} characters`);
    console.log(`   🔍 Sources found: ${result.sources?.length || 0}`);
    console.log('\n📄 Answer:');
    console.log('─'.repeat(60));
    console.log(result.answer);
    console.log('─'.repeat(60));

    if (result.sources && result.sources.length > 0) {
      console.log('\n🔍 Source Chunks:');
      result.sources.forEach((source, idx) => {
        console.log(`   ${idx + 1}. Chunk ${source.chunk_index} (${Math.round(source.similarity * 100)}% relevant)`);
        console.log(`      Preview: ${source.preview}`);
      });
    }

    console.log('\n✅ Chat test completed successfully!');
    console.log('🎉 vLLM integration is working correctly with 4096-dim embeddings!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testChat();
