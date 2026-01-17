import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface URLContentRequest {
  url: string;
  name: string;
  category: string;
  expirationDate?: string;
}

function extractTextFromHTML(html: string): string {
  const text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;

    if (start >= text.length) break;
  }

  return chunks;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const { url, name, category, expirationDate }: URLContentRequest = await req.json();

    if (!url || !name || !category) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL, name, and category are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Fetching content from URL: ${url}`);

    const urlResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DocuVaultAI/1.0)',
      },
    });

    if (!urlResponse.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch URL: ${urlResponse.status} ${urlResponse.statusText}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const html = await urlResponse.text();
    const extractedText = extractTextFromHTML(html);

    if (extractedText.length < 50) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient content extracted from URL' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Extracted ${extractedText.length} characters from URL`);

    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        name: name,
        type: 'text/html',
        category: category,
        expiration_date: expirationDate || null,
        size: `${Math.round(extractedText.length / 1024)} KB`,
        status: 'active',
        source_type: 'url',
        source_url: url,
        uploaded_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (docError || !document) {
      console.error('Document creation error:', docError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create document record' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`Document created with ID: ${document.id}`);

    const chunks = chunkText(extractedText);
    console.log(`Created ${chunks.length} chunks`);

    const chunkInserts = chunks.map((chunk, index) => ({
      document_id: document.id,
      chunk_index: index,
      chunk_text: chunk,
      embedding: null,
    }));

    const { error: chunksError } = await supabase
      .from('document_chunks')
      .insert(chunkInserts);

    if (chunksError) {
      console.error('Chunks insertion error:', chunksError);
      await supabase.from('documents').delete().eq('id', document.id);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create document chunks' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log('Generating embeddings for chunks...');

    try {
      const embeddingUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-embeddings`;
      const embeddingResponse = await fetch(embeddingUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ document_id: document.id }),
      });

      if (!embeddingResponse.ok) {
        console.error('Embedding generation failed, but document was created');
      }
    } catch (embeddingError) {
      console.error('Error triggering embeddings:', embeddingError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          document_id: document.id,
          chunks_created: chunks.length,
          content_length: extractedText.length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('URL processing error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
