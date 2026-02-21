/**
 * Test Tier Enforcement
 *
 * Tests document limits and AI question limits for all tiers
 */

const SUPABASE_URL = 'https://caygpjhiakabaxtklnlw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNheWdwamhpYWthYmF4dGtsbmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNzMzMTQsImV4cCI6MjA3MTY0OTMxNH0.UYaF1hW_j2HGcFP5W1FMV_G7ODGJuz8qieyf9Qe4Z90';
const API_URL = 'http://localhost:5000'; // Update if different

// Test credentials - you'll need to create test users
const TEST_USERS = {
  free: {
    email: 'test-free@example.com',
    password: 'test123456',
    token: null,
  },
  starter: {
    email: 'test-starter@example.com',
    password: 'test123456',
    token: null,
  },
  pro: {
    email: 'test-pro@example.com',
    password: 'test123456',
    token: null,
  },
};

/**
 * Login and get auth token
 */
async function login(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Test document upload
 */
async function testDocumentUpload(token, testName) {
  console.log(`\n📤 Testing document upload: ${testName}`);

  const formData = new FormData();
  const blob = new Blob(['Test document content'], { type: 'text/plain' });
  formData.append('file', blob, 'test-document.txt');
  formData.append('name', `Test Document ${Date.now()}`);
  formData.append('category', 'other');

  const response = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const result = await response.json();

  return {
    status: response.status,
    success: result.success,
    data: result,
  };
}

/**
 * Test AI question
 */
async function testAIQuestion(token, documentId, testName) {
  console.log(`\n💬 Testing AI question: ${testName}`);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/chat-document`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      document_id: documentId,
      question: 'Test question',
      user_id: 'test-user',
    }),
  });

  const result = await response.json();

  return {
    status: response.status,
    success: result.success,
    data: result,
  };
}

/**
 * Get user's document count
 */
async function getDocumentCount(token) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/documents?select=count`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
  });

  const data = await response.json();
  return data.count || 0;
}

/**
 * Run tests for a specific tier
 */
async function testTier(tier, limits) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 Testing ${tier.toUpperCase()} Tier`);
  console.log(`${'='.repeat(70)}`);

  const user = TEST_USERS[tier];

  // Login
  try {
    console.log(`\n🔐 Logging in as ${user.email}...`);
    user.token = await login(user.email, user.password);
    console.log('✅ Login successful');
  } catch (error) {
    console.error(`❌ Login failed: ${error.message}`);
    console.log(`\nℹ️  Create test user with: supabase auth sign-up --email ${user.email} --password ${user.password}`);
    return;
  }

  // Test 1: Check current document count
  const currentCount = await getDocumentCount(user.token);
  console.log(`\n📊 Current documents: ${currentCount}/${limits.documents}`);

  // Test 2: Upload documents up to limit
  console.log(`\n📤 Testing document upload (limit: ${limits.documents})...`);

  let uploadResults = [];
  const uploadsToTest = Math.min(3, limits.documents - currentCount + 1); // Try to go 1 over limit

  for (let i = 0; i < uploadsToTest; i++) {
    const result = await testDocumentUpload(
      user.token,
      `Upload ${i + 1}/${uploadsToTest}`
    );
    uploadResults.push(result);

    if (result.success) {
      console.log(`   ✅ Upload ${i + 1} succeeded`);
    } else {
      console.log(`   ❌ Upload ${i + 1} failed: ${result.data.error || result.data.message}`);
      if (result.status === 403) {
        console.log(`   🎯 Limit enforcement working! Status: ${result.status}`);
        console.log(`   📋 Response:`, JSON.stringify(result.data, null, 2));
      }
    }

    // Small delay between uploads
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Test 3: Check AI questions (if we have documents)
  if (uploadResults.some(r => r.success)) {
    console.log(`\n💬 Testing AI questions (limit: ${limits.aiQuestions === Infinity ? 'Unlimited' : limits.aiQuestions})...`);

    const successfulUpload = uploadResults.find(r => r.success);
    const documentId = successfulUpload?.data?.data?.document_id;

    if (documentId) {
      const questionsToTest = limits.aiQuestions === Infinity ? 3 : Math.min(3, limits.aiQuestions + 1);

      for (let i = 0; i < questionsToTest; i++) {
        const result = await testAIQuestion(
          user.token,
          documentId,
          `Question ${i + 1}/${questionsToTest}`
        );

        if (result.success) {
          console.log(`   ✅ Question ${i + 1} succeeded`);
        } else {
          console.log(`   ❌ Question ${i + 1} failed: ${result.data.error || result.data.message}`);
          if (result.status === 403) {
            console.log(`   🎯 AI question limit enforcement working!`);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  console.log(`\n✅ ${tier.toUpperCase()} tier tests complete`);
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n🚀 Starting Tier Enforcement Tests\n');

  const tiers = [
    { name: 'free', limits: { documents: 5, aiQuestions: 10 } },
    { name: 'starter', limits: { documents: 25, aiQuestions: Infinity } },
    { name: 'pro', limits: { documents: 100, aiQuestions: Infinity } },
  ];

  for (const tier of tiers) {
    await testTier(tier.name, tier.limits);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('🎉 All tests complete!');
  console.log(`${'='.repeat(70)}\n`);
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
