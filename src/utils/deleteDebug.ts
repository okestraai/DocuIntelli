/**
 * Debug helper for document deletion
 *
 * Call this from browser console:
 * window.debugDelete = () => { ... }
 */

import { supabase } from '../lib/supabase';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function debugDelete(documentId: string) {
  console.log('🔍 Delete Debug Started for document:', documentId);
  console.log('─'.repeat(60));

  // 1. Check authentication
  console.log('\n1️⃣ Checking authentication...');
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('❌ Session error:', sessionError);
    return { error: 'session_error', details: sessionError };
  }

  if (!session) {
    console.error('❌ No active session');
    return { error: 'no_session' };
  }

  console.log('✅ User authenticated:');
  console.log('   User ID:', session.user.id);
  console.log('   Email:', session.user.email);
  console.log('   Token exists:', !!session.access_token);
  console.log('   Token length:', session.access_token.length);

  // 2. Check document ownership
  console.log('\n2️⃣ Checking document ownership...');
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id, name, user_id, file_path')
    .eq('id', documentId)
    .maybeSingle();

  if (docError) {
    console.error('❌ Database error:', docError);
    return { error: 'db_error', details: docError };
  }

  if (!doc) {
    console.error('❌ Document not found');
    return { error: 'not_found' };
  }

  console.log('✅ Document found:');
  console.log('   Name:', doc.name);
  console.log('   Owner:', doc.user_id);
  console.log('   Current user:', session.user.id);
  console.log('   Ownership match:', doc.user_id === session.user.id);

  if (doc.user_id !== session.user.id) {
    console.error('❌ Permission denied: Document belongs to different user');
    return { error: 'permission_denied' };
  }

  // 3. Check related data
  console.log('\n3️⃣ Checking related data...');

  const { count: chunkCount } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId);

  const { count: chatCount } = await supabase
    .from('document_chats')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId);

  console.log('   Document chunks:', chunkCount);
  console.log('   Chat messages:', chatCount);

  // 4. Test DELETE API call
  console.log('\n4️⃣ Testing DELETE API call...');
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

    // 5. Verify deletion
    console.log('\n5️⃣ Verifying deletion...');

    const { data: deletedDoc } = await supabase
      .from('documents')
      .select('id')
      .eq('id', documentId)
      .maybeSingle();

    if (deletedDoc) {
      console.error('❌ Document still exists in database!');
      return { error: 'deletion_incomplete', details: 'Document still in database' };
    } else {
      console.log('✅ Document removed from database');
    }

    const { count: remainingChunks } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', documentId);

    const { count: remainingChats } = await supabase
      .from('document_chats')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', documentId);

    console.log('   Remaining chunks:', remainingChunks);
    console.log('   Remaining chats:', remainingChats);

    if (remainingChunks === 0 && remainingChats === 0) {
      console.log('✅ All related data removed');
    }

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
