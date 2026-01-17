// src/lib/api.ts
// Frontend API helpers
import { supabase } from './supabase';

export interface UploadResponse {
  success: boolean;
  data?: {
    document_id: string;
    file_key?: string;
    public_url?: string;
    file_type?: string;
    chunks_created?: number;
    content_length?: number;
  };
  error?: string;
}

export type DocumentUploadRequest =
  | {
      type: 'file';
      name: string;
      category: string;
      file: File;
      expirationDate?: string;
    }
  | {
      type: 'url';
      name: string;
      category: string;
      url: string;
      expirationDate?: string;
    }
  | {
      type: 'manual';
      name: string;
      category: string;
      content: string;
      expirationDate?: string;
    };

/**
 * Process a URL and create a document
 */
export async function processURLContent(
  url: string,
  name: string,
  category: string,
  expirationDate?: string
): Promise<UploadResponse> {
  try {
    console.log('🔗 Processing URL:', { url, name, category });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'User not authenticated' };
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const apiUrl = `${supabaseUrl}/functions/v1/process-url-content`;

    console.log('📡 Calling edge function:', apiUrl);

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        name,
        category,
        expirationDate,
      }),
    });

    console.log('📥 Response status:', res.status, res.statusText);

    if (!res.ok) {
      const errorText = await res.text();
      console.error('❌ Error response:', errorText);

      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || 'URL processing failed' };
      }

      return {
        success: false,
        error: errorData.error || errorData.message || `URL processing failed with status ${res.status}`,
      };
    }

    const result = await res.json();
    console.log('✅ URL processed successfully:', result);
    return result;
  } catch (error) {
    console.error('❌ URL processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'URL processing failed',
    };
  }
}

/**
 * Process manually pasted content and create a document
 */
export async function processManualContent(
  content: string,
  name: string,
  category: string,
  expirationDate?: string
): Promise<UploadResponse> {
  try {
    console.log('📝 Processing manual content:', { name, category, contentLength: content.length });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'User not authenticated' };
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const apiUrl = `${supabaseUrl}/functions/v1/process-manual-content`;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        name,
        category,
        expirationDate,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Content processing failed' }));
      return {
        success: false,
        error: errorData.error || `Content processing failed with status ${res.status}`,
      };
    }

    const result = await res.json();
    console.log('✅ Manual content processed successfully:', result);
    return result;
  } catch (error) {
    console.error('❌ Manual content processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Content processing failed',
    };
  }
}

/**
 * Upload a document file with metadata via backend API
 */
export async function uploadDocumentWithMetadata(
  file: File,
  name: string,
  category: string,
  expirationDate?: string
): Promise<UploadResponse> {
  try {
    console.log('📤 Starting upload for:', { name, category, fileSize: file.size, fileType: file.type });

    // Get auth token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('❌ No session found');
      return { success: false, error: 'User not authenticated' };
    }

    console.log('✅ Session valid, preparing FormData');

    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('category', category);
    if (expirationDate) {
      formData.append('expirationDate', expirationDate);
    }

    const uploadUrl = 'http://localhost:5000/api/upload';

    console.log('📡 Sending request to backend server');

    // Upload via backend server with proper PDF/DOCX/Image extraction
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    }).catch((fetchError) => {
      console.error('❌ Network error - backend server not reachable:', fetchError.message);
      throw new Error('Cannot connect to backend server. Make sure it is running on port 5000.');
    });

    console.log('📥 Response received:', res.status, res.statusText);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Upload failed' }));
      console.error('❌ Upload failed:', errorData);
      return {
        success: false,
        error: errorData.error || `Upload failed with status ${res.status}`,
      };
    }

    const result = await res.json();
    console.log('✅ Upload successful:', result);
    return result;
  } catch (error) {
    console.error('❌ Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Chat with a document using AI
 */
export async function chatWithDocument(
  documentId: string,
  question: string
) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiUrl = `${supabaseUrl}/functions/v1/chat-document`;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      document_id: documentId,
      question,
      user_id: session.user.id,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Chat request failed' }));
    throw new Error(errorData.error || `Chat failed with status ${res.status}`);
  }

  return res.json();
}

/**
 * Load chat history for a document
 */
export async function loadChatHistory(documentId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('document_chats')
    .select('id, role, content, created_at')
    .eq('user_id', session.user.id)
    .eq('document_id', documentId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Create a Stripe checkout session for subscription
 */
export async function createCheckoutSession(plan: 'starter' | 'pro' | 'business'): Promise<{ url: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  const priceIds = {
    starter: import.meta.env.VITE_STRIPE_STARTER_PRICE_ID,
    pro: import.meta.env.VITE_STRIPE_PRO_PRICE_ID,
    business: import.meta.env.VITE_STRIPE_BUSINESS_PRICE_ID,
  };

  const priceId = priceIds[plan];
  if (!priceId) {
    throw new Error(`Price ID not configured for ${plan} plan. Please add VITE_STRIPE_${plan.toUpperCase()}_PRICE_ID to your environment variables.`);
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiUrl = `${supabaseUrl}/functions/v1/stripe-checkout`;

  const successUrl = `${window.location.origin}/?checkout=success`;
  const cancelUrl = `${window.location.origin}/?checkout=cancel`;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_id: priceId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      mode: 'subscription',
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Checkout session creation failed' }));
    throw new Error(errorData.error || `Failed to create checkout session: ${res.status}`);
  }

  const result = await res.json();
  return { url: result.url };
}
