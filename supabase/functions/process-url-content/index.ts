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
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');

  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');

  text = text.replace(/<[^>]+>/g, ' ');

  text = text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();

  return text;
}

function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) {
      chunks.push(chunk);
    }
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
    console.log('🚀 Process URL Content function started');

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
      console.error('❌ User auth error:', userError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    console.log('✅ User authenticated:', user.id);

    const { url, name, category, expirationDate }: URLContentRequest = await req.json();

    if (!url || !name || !category) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL, name, and category are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`🌐 Fetching content from URL: ${url}`);

    let htmlResponse;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      htmlResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DocuVaultBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!htmlResponse.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to fetch URL: ${htmlResponse.status} ${htmlResponse.statusText}`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    } catch (fetchError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: fetchError instanceof Error && fetchError.name === 'AbortError'
            ? 'URL fetch timeout (30s limit)'
            : 'Failed to fetch URL. Please check if the URL is accessible.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const html = await htmlResponse.text();
    console.log(`✅ Fetched ${html.length} bytes from URL`);

    const extractedText = extractTextFromHTML(html);

    if (!extractedText || extractedText.length < 50) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Insufficient content extracted from URL. The page may be empty or requires JavaScript.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`✅ Extracted ${extractedText.length} characters of text`);

    const textEncoder = new TextEncoder();
    const textBuffer = textEncoder.encode(extractedText);

    const timestamp = Date.now();
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filePath = `${user.id}/${timestamp}_${sanitizedName}.txt`;

    console.log(`💾 Uploading text file to storage: ${filePath}`);

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, textBuffer, {
        contentType: 'text/plain',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Upload error:', uploadError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to upload content to storage',
          details: uploadError.message,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log('✅ Text file uploaded successfully');

    const sizeInKB = Math.round(textBuffer.length / 1024);
    const sizeText = sizeInKB > 0 ? `${sizeInKB} KB` : '1 KB';

    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        name: name,
        original_name: name,
        type: 'text/plain',
        category: category,
        expiration_date: expirationDate || null,
        size: sizeText,
        file_path: filePath,
        status: 'active',
        source_type: 'url',
        source_url: url,
        processed: false,
      })
      .select('id')
      .single();

    if (docError || !document) {
      console.error('❌ Document creation error:', docError);
      await supabase.storage.from('documents').remove([filePath]);
      return new Response(
        JSON.stringify({
          success: false,
          error: docError?.message || 'Failed to create document record',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`✅ Document created with ID: ${document.id}`);

    console.log('✂️ Chunking text...');
    const chunks = chunkText(extractedText);
    console.log(`✅ Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No valid text chunks could be created from the URL content'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const chunkInserts = chunks.map((chunk, index) => ({
      document_id: document.id,
      user_id: user.id,
      chunk_index: index,
      chunk_text: chunk,
      embedding: null,
    }));

    console.log('💾 Inserting chunks into database...');
    const { error: chunksError } = await supabase
      .from('document_chunks')
      .insert(chunkInserts);

    if (chunksError) {
      console.error('❌ Chunks insertion error:', chunksError);
      await supabase.from('documents').delete().eq('id', document.id);
      await supabase.storage.from('documents').remove([filePath]);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to create document chunks',
          details: chunksError.message,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`✅ Inserted ${chunks.length} chunks into database`);

    await supabase
      .from('documents')
      .update({ processed: true })
      .eq('id', document.id);

    console.log('🧠 Triggering embedding generation...');
    try {
      const embeddingUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-embeddings`;
      fetch(embeddingUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ document_id: document.id, continue_processing: true }),
      }).catch(err => console.error('Embedding trigger error:', err));
    } catch (embeddingError) {
      console.error('❌ Error triggering embeddings:', embeddingError);
    }

    console.log('🎉 URL processing completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          document_id: document.id,
          chunks_created: chunks.length,
          content_length: extractedText.length,
          message: 'URL content extracted and processed successfully',
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('❌ URL processing error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
