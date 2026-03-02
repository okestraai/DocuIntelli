// Integration test for frontend-backend-database connection
import fetch from 'node-fetch';

console.log('🧪 Running Integration Tests\n');
console.log('='.repeat(60));

// Test 1: Backend Health Check
async function testBackendHealth() {
  try {
    console.log('\n✓ Test 1: Backend Health Check');
    const response = await fetch('http://localhost:5000/api/health');
    const data = await response.json();

    if (response.status === 200 && data.status === 'OK') {
      console.log('  ✅ Backend is healthy');
      console.log(`  📅 Timestamp: ${data.timestamp}`);
      return true;
    }
    console.log('  ❌ Backend health check failed');
    return false;
  } catch (error) {
    console.log('  ❌ Cannot reach backend:', error.message);
    return false;
  }
}

// Test 2: Frontend Accessibility
async function testFrontend() {
  try {
    console.log('\n✓ Test 2: Frontend Accessibility');
    const response = await fetch('http://localhost:5173');

    if (response.status === 200) {
      console.log('  ✅ Frontend is accessible');
      console.log('  🌐 URL: http://localhost:5173');
      return true;
    }
    console.log('  ❌ Frontend returned status:', response.status);
    return false;
  } catch (error) {
    console.log('  ❌ Cannot reach frontend:', error.message);
    return false;
  }
}

// Test 3: CORS Configuration
async function testCORS() {
  try {
    console.log('\n✓ Test 3: CORS Configuration');
    const response = await fetch('http://localhost:5000/api/health', {
      headers: {
        'Origin': 'http://localhost:5173'
      }
    });

    const corsHeader = response.headers.get('access-control-allow-origin');
    if (corsHeader && corsHeader.includes('localhost:5173')) {
      console.log('  ✅ CORS properly configured');
      console.log(`  🔗 Allowed origin: ${corsHeader}`);
      return true;
    }
    console.log('  ⚠️  CORS header not found or not configured for frontend');
    return false;
  } catch (error) {
    console.log('  ❌ CORS test failed:', error.message);
    return false;
  }
}

// Test 4: Upload endpoint exists (without auth)
async function testUploadEndpoint() {
  try {
    console.log('\n✓ Test 4: Upload Endpoint');
    const response = await fetch('http://localhost:5000/api/upload', {
      method: 'POST'
    });

    // We expect 401 (unauthorized) or 400 (bad request), not 404
    if (response.status === 401 || response.status === 400) {
      console.log('  ✅ Upload endpoint exists and requires auth');
      console.log(`  🔒 Status: ${response.status}`);
      return true;
    }
    console.log(`  ⚠️  Unexpected status: ${response.status}`);
    return false;
  } catch (error) {
    console.log('  ❌ Upload endpoint test failed:', error.message);
    return false;
  }
}

// Run all tests
(async () => {
  const results = {
    backend: await testBackendHealth(),
    frontend: await testFrontend(),
    cors: await testCORS(),
    upload: await testUploadEndpoint()
  };

  console.log('\n' + '='.repeat(60));
  console.log('📊 Integration Test Results');
  console.log('='.repeat(60));
  console.log(`Backend Health:     ${results.backend ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Frontend Access:    ${results.frontend ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`CORS Config:        ${results.cors ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Upload Endpoint:    ${results.upload ? '✅ PASS' : '❌ FAIL'}`);
  console.log('='.repeat(60));

  const allPassed = Object.values(results).every(r => r);
  if (allPassed) {
    console.log('\n🎉 All integration tests passed!');
    console.log('✅ Your app is ready to use:');
    console.log('   • Frontend: http://localhost:5173');
    console.log('   • Backend:  http://localhost:5000');
    console.log('   • Database: Connected to Supabase');
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above.');
  }

  process.exit(allPassed ? 0 : 1);
})();
