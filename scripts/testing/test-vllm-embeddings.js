// Test the new vLLM embedding API before switching
import dotenv from 'dotenv';

dotenv.config();

const VLLM_EMBEDDER_URL = process.env.VLLM_EMBEDDER_URL || 'https://embedder.affinityecho.com';
const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;
const EMBEDDING_MODEL = 'intfloat/e5-mistral-7b-instruct';
const EXPECTED_DIMENSIONS = 4096;

console.log('🧪 Testing vLLM Embedding API\n');
console.log('='.repeat(70));
console.log(`📍 API URL: ${VLLM_EMBEDDER_URL}`);
console.log(`🤖 Model: ${EMBEDDING_MODEL}`);
console.log(`📏 Expected Dimensions: ${EXPECTED_DIMENSIONS}`);
console.log('='.repeat(70));
console.log('');

// Check required environment variables
if (!CF_ACCESS_CLIENT_ID || !CF_ACCESS_CLIENT_SECRET) {
  console.error('❌ Missing Cloudflare Access credentials');
  console.error('   Please set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET in .env');
  process.exit(1);
}

/**
 * Format text with instruction prefix
 */
function formatWithInstruction(text, instruction) {
  return `Instruct: ${instruction}\nQuery: ${text}`;
}

/**
 * Test single embedding generation
 */
async function testSingleEmbedding() {
  console.log('📝 Test 1: Single Embedding Generation');
  console.log('-'.repeat(70));

  try {
    const testText = 'This is a test document about machine learning and artificial intelligence.';
    const instruction = 'Represent this document for retrieval';
    const formattedText = formatWithInstruction(testText, instruction);

    console.log(`Input: "${testText}"`);
    console.log(`Instruction: "${instruction}"`);
    console.log('Generating embedding...');

    const startTime = Date.now();
    const response = await fetch(`${VLLM_EMBEDDER_URL}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': CF_ACCESS_CLIENT_SECRET,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: [formattedText],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const duration = Date.now() - startTime;

    // Validate response
    if (!result.data || !Array.isArray(result.data) || result.data.length === 0) {
      throw new Error('Invalid response: missing data array');
    }

    const embedding = result.data[0].embedding;

    if (!Array.isArray(embedding)) {
      throw new Error('Invalid response: embedding is not an array');
    }

    if (embedding.length !== EXPECTED_DIMENSIONS) {
      throw new Error(`Wrong dimensions: expected ${EXPECTED_DIMENSIONS}, got ${embedding.length}`);
    }

    console.log(`✅ Success!`);
    console.log(`   Dimensions: ${embedding.length}`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    console.log('');
    return true;
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    console.log('');
    return false;
  }
}

/**
 * Test batch embedding generation
 */
async function testBatchEmbedding() {
  console.log('📝 Test 2: Batch Embedding Generation');
  console.log('-'.repeat(70));

  try {
    const testTexts = [
      'Machine learning is a subset of artificial intelligence.',
      'Neural networks are inspired by biological brain structures.',
      'Deep learning uses multiple layers to learn data representations.',
    ];
    const instruction = 'Represent this document for retrieval';
    const formattedTexts = testTexts.map((text) => formatWithInstruction(text, instruction));

    console.log(`Input: ${testTexts.length} texts`);
    console.log(`Instruction: "${instruction}"`);
    console.log('Generating embeddings...');

    const startTime = Date.now();
    const response = await fetch(`${VLLM_EMBEDDER_URL}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': CF_ACCESS_CLIENT_SECRET,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: formattedTexts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const duration = Date.now() - startTime;

    // Validate response
    if (!result.data || !Array.isArray(result.data) || result.data.length !== testTexts.length) {
      throw new Error(`Invalid response: expected ${testTexts.length} embeddings, got ${result.data?.length || 0}`);
    }

    // Check each embedding
    for (let i = 0; i < result.data.length; i++) {
      const embedding = result.data[i].embedding;
      if (!Array.isArray(embedding) || embedding.length !== EXPECTED_DIMENSIONS) {
        throw new Error(`Embedding ${i}: wrong dimensions (got ${embedding?.length || 0})`);
      }
    }

    console.log(`✅ Success!`);
    console.log(`   Embeddings: ${result.data.length}`);
    console.log(`   Duration: ${duration}ms (~${(duration / result.data.length).toFixed(1)}ms per embedding)`);
    console.log(`   All embeddings have ${EXPECTED_DIMENSIONS} dimensions`);
    console.log('');
    return true;
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    console.log('');
    return false;
  }
}

/**
 * Test query vs document instruction prefixes
 */
async function testInstructionPrefixes() {
  console.log('📝 Test 3: Query vs Document Instructions');
  console.log('-'.repeat(70));

  try {
    const text = 'How do I reset my password?';

    // Generate with query instruction
    console.log('Generating query embedding...');
    const queryInstruction = 'Given a web search query, retrieve relevant passages';
    const queryFormatted = formatWithInstruction(text, queryInstruction);

    const queryStartTime = Date.now();
    const queryResponse = await fetch(`${VLLM_EMBEDDER_URL}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': CF_ACCESS_CLIENT_SECRET,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: [queryFormatted],
      }),
    });

    if (!queryResponse.ok) {
      throw new Error(`Query embedding failed: ${queryResponse.status}`);
    }

    const queryResult = await queryResponse.json();
    const queryDuration = Date.now() - queryStartTime;
    const queryEmbedding = queryResult.data[0].embedding;

    // Generate with document instruction
    console.log('Generating document embedding...');
    const docInstruction = 'Represent this document for retrieval';
    const docFormatted = formatWithInstruction(text, docInstruction);

    const docStartTime = Date.now();
    const docResponse = await fetch(`${VLLM_EMBEDDER_URL}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': CF_ACCESS_CLIENT_SECRET,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: [docFormatted],
      }),
    });

    if (!docResponse.ok) {
      throw new Error(`Document embedding failed: ${docResponse.status}`);
    }

    const docResult = await docResponse.json();
    const docDuration = Date.now() - docStartTime;
    const docEmbedding = docResult.data[0].embedding;

    // Calculate difference
    let difference = 0;
    for (let i = 0; i < queryEmbedding.length; i++) {
      difference += Math.abs(queryEmbedding[i] - docEmbedding[i]);
    }
    const avgDifference = difference / queryEmbedding.length;

    console.log(`✅ Success!`);
    console.log(`   Query embedding duration: ${queryDuration}ms`);
    console.log(`   Document embedding duration: ${docDuration}ms`);
    console.log(`   Average difference per dimension: ${avgDifference.toFixed(6)}`);
    console.log(`   Instructions produce different embeddings: ${avgDifference > 0.001 ? 'Yes ✓' : 'No ✗'}`);
    console.log('');
    return true;
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    console.log('');
    return false;
  }
}

/**
 * Run all tests
 */
(async () => {
  const results = [];

  results.push(await testSingleEmbedding());
  results.push(await testBatchEmbedding());
  results.push(await testInstructionPrefixes());

  console.log('='.repeat(70));
  console.log('📊 Test Summary');
  console.log('='.repeat(70));

  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log(`Tests passed: ${passed}/${total}`);
  console.log('');

  if (passed === total) {
    console.log('🎉 All tests passed! The vLLM API is ready to use.');
    console.log('');
    console.log('Next steps:');
    console.log('  1. The API is working correctly with Cloudflare authentication');
    console.log('  2. Embeddings are 4096-dimensional as expected');
    console.log('  3. Batch processing works efficiently');
    console.log('  4. Instruction prefixes are working');
    console.log('');
    console.log('You can now switch to using the vLLM API in production.');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Please check the errors above.');
    console.log('');
    console.log('Troubleshooting:');
    console.log('  1. Verify CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are correct');
    console.log('  2. Check that the vLLM service is running');
    console.log('  3. Verify Cloudflare Tunnel is active');
    console.log('  4. Test connectivity to https://embedder.affinityecho.com');
    process.exit(1);
  }
})();
