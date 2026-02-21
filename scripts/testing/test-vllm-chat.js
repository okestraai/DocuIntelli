// Test vLLM Chat Service
import dotenv from 'dotenv';

dotenv.config();

const vllmChatUrl = process.env.VLLM_CHAT_URL || 'https://chat.affinityecho.com';
const cfAccessClientId = process.env.CF_ACCESS_CLIENT_ID;
const cfAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET;

console.log('🧪 Testing vLLM Chat Service\n');
console.log('='.repeat(70));
console.log('URL:', vllmChatUrl);
console.log('='.repeat(70));
console.log('');

(async () => {
  try {
    // Test 1: Models endpoint
    console.log('📡 Test 1: /v1/models endpoint');
    console.log('-'.repeat(70));

    const modelsResponse = await fetch(`${vllmChatUrl}/v1/models`, {
      headers: {
        'CF-Access-Client-Id': cfAccessClientId,
        'CF-Access-Client-Secret': cfAccessClientSecret,
      },
    });

    if (!modelsResponse.ok) {
      console.log('❌ Models endpoint failed:', modelsResponse.status);
      const errorText = await modelsResponse.text();
      console.log('Error:', errorText.substring(0, 200));
      process.exit(1);
    }

    const modelsData = await modelsResponse.json();
    console.log('✅ Models endpoint accessible');
    console.log('Available models:', modelsData.data?.map(m => m.id).join(', ') || 'N/A');
    console.log('');

    // Test 2: Chat completion
    console.log('📡 Test 2: Chat Completion');
    console.log('-'.repeat(70));

    const startTime = Date.now();
    const chatResponse = await fetch(`${vllmChatUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': cfAccessClientId,
        'CF-Access-Client-Secret': cfAccessClientSecret,
      },
      body: JSON.stringify({
        model: 'hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say hello in one sentence.' }
        ],
        max_tokens: 50,
        temperature: 0.7,
      }),
    });

    if (!chatResponse.ok) {
      console.log('❌ Chat completion failed:', chatResponse.status);
      const errorText = await chatResponse.text();
      console.log('Error:', errorText.substring(0, 500));
      process.exit(1);
    }

    const chatData = await chatResponse.json();
    const duration = Date.now() - startTime;

    console.log('✅ Chat completion successful');
    console.log('Duration:', duration + 'ms');
    console.log('Response:', chatData.choices[0].message.content);
    console.log('');

    // Test 3: RAG-style chat with context
    console.log('📡 Test 3: RAG-style Chat (with context)');
    console.log('-'.repeat(70));

    const ragStartTime = Date.now();
    const ragResponse = await fetch(`${vllmChatUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': cfAccessClientId,
        'CF-Access-Client-Secret': cfAccessClientSecret,
      },
      body: JSON.stringify({
        model: 'hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. Answer based on the provided context.\n\nContext:\nThe capital of France is Paris. Paris is known for the Eiffel Tower.'
          },
          { role: 'user', content: 'What is the capital of France?' }
        ],
        max_tokens: 100,
        temperature: 0.7,
      }),
    });

    if (!ragResponse.ok) {
      console.log('❌ RAG chat failed:', ragResponse.status);
      const errorText = await ragResponse.text();
      console.log('Error:', errorText.substring(0, 500));
      process.exit(1);
    }

    const ragData = await ragResponse.json();
    const ragDuration = Date.now() - ragStartTime;

    console.log('✅ RAG chat successful');
    console.log('Duration:', ragDuration + 'ms');
    console.log('Response:', ragData.choices[0].message.content);
    console.log('');

    console.log('='.repeat(70));
    console.log('🎉 All tests passed! vLLM Chat service is working correctly.');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check if Cloudflare tunnel is running');
    console.error('2. Verify CF_ACCESS credentials in .env');
    console.error('3. Test connectivity to', vllmChatUrl);
    process.exit(1);
  }
})();
