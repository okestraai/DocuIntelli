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
  // Remove scripts, styles, and other non-content elements
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');

  // Convert common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');

  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Clean up whitespace
  text = text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();

  return text;
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
    console.log('🔑 Auth header present:', !!authHeader);

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
    console.log('📋 Request data:', { url, name, category, hasExpiration: !!expirationDate });

    if (!url || !name || !category) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL, name, and category are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`🌐 Fetching content from URL: ${url}`);

    // Fetch HTML content from URL
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
        console.error(`❌ URL fetch failed: ${htmlResponse.status} ${htmlResponse.statusText}`);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to fetch URL: ${htmlResponse.status} ${htmlResponse.statusText}`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    } catch (fetchError) {
      console.error('❌ URL fetch error:', fetchError);
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

    // Extract text from HTML
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

    // Convert text to a text file buffer
    const textEncoder = new TextEncoder();
    const textBuffer = textEncoder.encode(extractedText);

    // Create unique file path
    const timestamp = Date.now();
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filePath = `${user.id}/${timestamp}_${sanitizedName}.txt`;

    console.log(`💾 Uploading text file to storage: ${filePath}`);

    // Upload text file to Supabase Storage
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

    // Calculate size
    const sizeInKB = Math.round(textBuffer.length / 1024);
    const sizeText = sizeInKB > 0 ? `${sizeInKB} KB` : '1 KB';

    // Create document record
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
      // Clean up uploaded file
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

    // Trigger process-document function to chunk and create embeddings
    console.log('🔄 Triggering document processing...');

    try {
      const processUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-document`;
      const processResponse = await fetch(processUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ document_id: document.id }),
      });

      if (!processResponse.ok) {
        const errorText = await processResponse.text();
        console.error('❌ Document processing failed:', errorText);
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              document_id: document.id,
              message: 'Content uploaded. Processing will happen automatically.',
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      const processResult = await processResponse.json();
      console.log('✅ Document processed successfully:', processResult);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            document_id: document.id,
            chunks_created: processResult.data?.chunks_processed || 0,
            message: 'URL content extracted and processed successfully',
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );

    } catch (processError) {
      console.error('❌ Error triggering processing:', processError);
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            document_id: document.id,
            message: 'Content uploaded successfully. Processing will happen automatically.',
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

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
