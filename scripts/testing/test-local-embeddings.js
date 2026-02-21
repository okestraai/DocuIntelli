// Test local embedding API before switching
import dotenv from 'dotenv';

dotenv.config();

const EMBEDDING_API_URL = 'http://localhost:8001/v1/embeddings';
const EMBEDDING_MODEL = 'intfloat/e5-mistral-7b-instruct';

console.log('🧪 Testing Local Embedding API\n');
console.log('='.repeat(70));
console.log(`📍 API URL: ${EMBEDDING_API_URL}`);
console.log(`🤖 Model: ${EMBEDDING_MODEL}`);
console.log('='.repeat(70));

// Test samples with varying lengths
const testSamples = [
  {
    name: 'Short text',
    text: 'This is a test document about artificial intelligence.',
  },
  {
    name: 'Medium text',
    text: 'DocuIntelli is an intelligent document management platform that uses AI to help users organize, search, and interact with their documents. It supports multiple file formats including PDF, DOCX, and images with OCR capabilities.',
  },
  {
    name: 'Long text',
    text: `
      Artificial intelligence (AI) has revolutionized the way we process and analyze documents.
      Modern document management systems leverage machine learning algorithms to extract meaningful
      information from various file formats. Natural language processing enables semantic search
      capabilities, allowing users to find relevant content even when exact keywords don't match.
      Vector embeddings transform text into numerical representations that capture semantic meaning,
      making it possible to perform similarity searches and clustering operations. These technologies
      combined create powerful tools for knowledge management and information retrieval.
    `.trim(),
  },
];

async function testEmbedding(text, sampleName) {
  console.log(`\n📝 Testing: ${sampleName}`);
  console.log(`   Text length: ${text.length} characters`);

  try {
    const startTime = Date.now();

    const response = await fetch(EMBEDDING_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
      }),
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    // Validate response structure
    if (!result.data || !Array.isArray(result.data) || result.data.length === 0) {
      throw new Error('Invalid response structure: missing data array');
    }

    const embedding = result.data[0].embedding;

    if (!Array.isArray(embedding)) {
      throw new Error('Invalid embedding: not an array');
    }

    console.log(`   ✅ Success!`);
    console.log(`   ⏱️  Duration: ${duration}ms`);
    console.log(`   📊 Embedding dimensions: ${embedding.length}`);
    console.log(`   🔢 Sample values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    console.log(`   📈 Value range: [${Math.min(...embedding).toFixed(4)}, ${Math.max(...embedding).toFixed(4)}]`);

    return {
      success: true,
      duration,
      dimensions: embedding.length,
      embedding,
    };
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function testBatchEmbedding() {
  console.log(`\n\n📦 Testing Batch Embedding (Multiple texts at once)`);

  const texts = testSamples.map(s => s.text);

  try {
    const startTime = Date.now();

    const response = await fetch(EMBEDDING_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
      }),
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    console.log(`   ✅ Batch request successful!`);
    console.log(`   ⏱️  Duration: ${duration}ms`);
    console.log(`   📊 Embeddings generated: ${result.data.length}`);
    console.log(`   ⚡ Average time per embedding: ${(duration / result.data.length).toFixed(0)}ms`);

    return { success: true, count: result.data.length, duration };
  } catch (error) {
    console.log(`   ❌ Batch test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testAPIAvailability() {
  console.log(`\n\n🔍 Testing API Availability`);

  try {
    const response = await fetch(EMBEDDING_API_URL.replace('/embeddings', '/models'), {
      method: 'GET',
    });

    if (response.ok) {
      const models = await response.json();
      console.log(`   ✅ API is available`);
      if (models.data) {
        console.log(`   📋 Available models: ${models.data.length}`);
        const targetModel = models.data.find(m => m.id === EMBEDDING_MODEL);
        if (targetModel) {
          console.log(`   ✅ Target model '${EMBEDDING_MODEL}' is available`);
        } else {
          console.log(`   ⚠️  Target model '${EMBEDDING_MODEL}' not found in available models`);
        }
      }
    } else {
      console.log(`   ⚠️  Models endpoint returned ${response.status}`);
    }
  } catch (error) {
    console.log(`   ℹ️  Models endpoint not available (this is okay)`);
  }
}

// Run all tests
(async () => {
  try {
    // Test API availability
    await testAPIAvailability();

    // Test individual samples
    const results = [];
    for (const sample of testSamples) {
      const result = await testEmbedding(sample.text, sample.name);
      results.push(result);
    }

    // Test batch processing
    const batchResult = await testBatchEmbedding();

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 Test Summary');
    console.log('='.repeat(70));

    const successCount = results.filter(r => r.success).length;
    console.log(`Single embeddings: ${successCount}/${results.length} successful`);

    if (successCount > 0) {
      const avgDuration = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + r.duration, 0) / successCount;
      const dimensions = results.find(r => r.success)?.dimensions;

      console.log(`Average duration: ${avgDuration.toFixed(0)}ms`);
      console.log(`Embedding dimensions: ${dimensions}`);
    }

    console.log(`Batch embedding: ${batchResult.success ? '✅ Supported' : '❌ Not supported'}`);

    console.log('='.repeat(70));

    if (successCount === testSamples.length && batchResult.success) {
      console.log('\n✅ All tests passed! Local embedding API is working correctly.');
      console.log('\n💡 Next steps:');
      console.log('   1. Update embedding service to use this API');
      console.log('   2. Configure API URL and model in environment variables');
      console.log('   3. Test with real document chunks');
      console.log('   4. Process existing chunks with new API');
    } else {
      console.log('\n⚠️  Some tests failed. Please check:');
      console.log('   1. Is the embedding server running on http://localhost:8001?');
      console.log('   2. Is the model intfloat/e5-mistral-7b-instruct loaded?');
      console.log('   3. Check server logs for errors');
    }

  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
})();
