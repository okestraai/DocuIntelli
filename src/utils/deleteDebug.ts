/**
 * Debug helper for document deletion
 *
 * Call this from browser console:
 * window.debugDelete("document-id-here")
 */

import { auth } from '../lib/auth';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function debugDelete(documentId: string) {
  console.log('🔍 Delete Debug Started for document:', documentId);
  console.log('─'.repeat(60));

  // 1. Check authentication
  console.log('\n1️⃣ Checking authentication...');
  const { data: { session } } = await auth.getSession();

  if (!session) {
    console.error('❌ No active session');
    return { error: 'no_session' };
  }

  console.log('✅ User authenticated:');
  console.log('   User ID:', session.user.id);
  console.log('   Email:', session.user.email);
  console.log('   Token exists:', !!session.access_token);
  console.log('   Token length:', session.access_token.length);

  // 2. Test DELETE API call
  console.log('\n2️⃣ Testing DELETE API call...');
  const apiUrl = `${API_BASE}/api/documents/${documentId}`;
  console.log('   URL:', apiUrl);
  console.log('   Method: DELETE');
  console.log('   Authorization: Bearer ' + session.access_token.substring(0, 20) + '...');

  try {
    const response = await fetch(apiUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('   Response status:', response.status, response.statusText);
    console.log('   Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      console.error('❌ DELETE request failed');

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        console.error('   Error response:', errorData);
        return { error: 'api_error', status: response.status, details: errorData };
      } else {
        const errorText = await response.text();
        console.error('   Error response (text):', errorText);
        return { error: 'api_error', status: response.status, details: errorText };
      }
    }

    const result = await response.json();
    console.log('✅ DELETE successful!');
    console.log('   Response:', result);

    console.log('\n' + '─'.repeat(60));
    console.log('✅ Delete operation completed successfully!');
    return { success: true, result };

  } catch (networkError) {
    console.error('❌ Network error:', networkError);
    console.error('\n💡 Possible causes:');
    console.error('   - Backend server not running on port 5000');
    console.error('   - CORS configuration issue');
    console.error('   - Firewall blocking connection');

    return { error: 'network_error', details: networkError };
  }
}

// Make it available globally for browser console testing
if (typeof window !== 'undefined') {
  (window as any).debugDelete = debugDelete;
  console.log('💡 Debug tool loaded! Use: debugDelete("document-id-here")');
}
