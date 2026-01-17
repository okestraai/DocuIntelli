import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import puppeteer from 'npm:puppeteer@22.0.0';

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  let browser;
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

    console.log(`🌐 Converting URL to PDF: ${url}`);

    // Launch Puppeteer browser
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();

    // Set timeout and navigate to URL
    await page.setDefaultNavigationTimeout(30000);

    try {
      await page.goto(url, { waitUntil: 'networkidle2' });
    } catch (navigationError) {
      await browser.close();
      console.error('❌ Navigation error:', navigationError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to load URL. Please check if the URL is accessible.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('📄 Generating PDF from webpage...');

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px',
      },
    });

    await browser.close();
    browser = null;

    console.log(`✅ PDF generated: ${pdfBuffer.length} bytes`);

    // Create unique file path
    const timestamp = Date.now();
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filePath = `${user.id}/${timestamp}_${sanitizedName}.pdf`;

    console.log(`💾 Uploading PDF to storage: ${filePath}`);

    // Upload PDF to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Upload error:', uploadError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to upload PDF to storage',
          details: uploadError.message,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log('✅ PDF uploaded successfully');

    // Calculate size
    const sizeInKB = Math.round(pdfBuffer.length / 1024);
    const sizeText = sizeInKB > 0 ? `${sizeInKB} KB` : '1 KB';

    // Create document record
    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        name: name,
        original_name: name,
        type: 'application/pdf',
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

    // Trigger process-document function to extract text and create chunks
    console.log('🔄 Triggering document processing...');

    try {
      const processUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-document`;
      const processResponse = await fetch(processUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ document_id: document.id }),
      });

      if (!processResponse.ok) {
        const errorText = await processResponse.text();
        console.error('❌ Document processing failed:', errorText);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Document uploaded but processing failed. It will be processed automatically.',
            document_id: document.id,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 207 }
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
            message: 'URL converted to PDF and processed successfully',
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
            message: 'PDF created successfully. Processing will happen automatically.',
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

  } catch (error) {
    console.error('❌ URL processing error:', error);

    // Clean up browser if still open
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
