import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get("ALLOWED_ORIGIN") || "http://localhost:5173",
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface URLContentRequest {
  url: string;
  name: string;
  category: string;
  expirationDate?: string;
}

function sanitizeText(text: string): string {
  // Remove null bytes and other problematic characters for PostgreSQL
  let sanitized = text
    .replace(/\0/g, '') // Remove null bytes
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters except \t, \n, \r
    .replace(/\uFFFD/g, '') // Remove replacement character
    .replace(/[\uD800-\uDFFF]/g, ''); // Remove unpaired surrogates

  // Normalize Unicode
  try {
    sanitized = sanitized.normalize('NFC');
  } catch (e) {
    console.warn('Unicode normalization failed, using original text');
  }

  return sanitized;
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
    .replace(/&ndash;/g, '–')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));

  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/blockquote>/gi, '\n\n')
    .replace(/<\/article>/gi, '\n\n')
    .replace(/<\/section>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<h([1-6])[^>]*>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n');

  text = text.replace(/<[^>]+>/g, '');

  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/ \n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Sanitize the final text to remove problematic Unicode
  return sanitizeText(text);
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

    // SSRF protection: validate URL before fetching
    try {
      const parsedUrl = new URL(url);

      // Only allow http/https protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Only HTTP and HTTPS URLs are allowed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Block private/internal IP ranges
      const hostname = parsedUrl.hostname.toLowerCase();
      const blockedPatterns = [
        /^localhost$/i,
        /^127\./,
        /^10\./,
        /^192\.168\./,
        /^172\.(1[6-9]|2[0-9]|3[01])\./,
        /^169\.254\./,
        /^0\./,
        /^\[?::1\]?$/,
        /^\[?fc00:/i,
        /^\[?fd00:/i,
        /^\[?fe80:/i,
        /^metadata\.google\.internal$/i,
      ];

      for (const pattern of blockedPatterns) {
        if (pattern.test(hostname)) {
          return new Response(
            JSON.stringify({ success: false, error: 'URLs pointing to internal or private networks are not allowed' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
      }
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid URL format' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    let htmlResponse;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      htmlResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DocuIntelliBot/1.0)',
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

    const textEncoder = new TextEncoder();
    const textBuffer = textEncoder.encode(extractedText);

    const timestamp = Date.now();
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filePath = `${user.id}/${timestamp}_${sanitizedName}.txt`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, textBuffer, {
        contentType: 'text/plain',
        upsert: false,
      });

    if (uploadError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to upload content to storage',
          details: uploadError.message,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

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
      await supabase.storage.from('documents').remove([filePath]);
      return new Response(
        JSON.stringify({
          success: false,
          error: docError?.message || 'Failed to create document record',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Trigger process-document to handle chunking (fire-and-forget)
    const processUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-document`;
    fetch(processUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ document_id: document.id }),
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          document_id: document.id,
          content_length: extractedText.length,
          message: 'URL content saved. Processing will complete shortly.',
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
