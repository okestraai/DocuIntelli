import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { filePath } = await req.json();

    if (!filePath) {
      return new Response(
        JSON.stringify({ error: "File path is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Converting document to PDF:", filePath);

    // Use CloudConvert API for conversion
    const cloudConvertApiKey = Deno.env.get("CLOUDCONVERT_API_KEY");

    if (!cloudConvertApiKey) {
      console.error("CloudConvert API key not configured");
      return new Response(
        JSON.stringify({ error: "Conversion service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get the file from storage
    const fileUrl = `${supabaseUrl}/storage/v1/object/public/documents/${filePath}`;
    console.log("Fetching file from:", fileUrl);

    // Create CloudConvert job
    const jobResponse = await fetch("https://api.cloudconvert.com/v2/jobs", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cloudConvertApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tasks: {
          "import-file": {
            operation: "import/url",
            url: fileUrl,
          },
          "convert-file": {
            operation: "convert",
            input: "import-file",
            output_format: "pdf",
          },
          "export-file": {
            operation: "export/url",
            input: "convert-file",
          },
        },
      }),
    });

    if (!jobResponse.ok) {
      const errorText = await jobResponse.text();
      console.error("CloudConvert job creation failed:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to create conversion job" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const jobData = await jobResponse.json();
    const jobId = jobData.data.id;
    console.log("CloudConvert job created:", jobId);

    // Poll for job completion (max 30 seconds)
    let attempts = 0;
    const maxAttempts = 30;
    let jobStatus = jobData.data.status;
    let exportTask = null;

    while (attempts < maxAttempts && jobStatus !== "finished" && jobStatus !== "error") {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
        headers: {
          "Authorization": `Bearer ${cloudConvertApiKey}`,
        },
      });

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        jobStatus = statusData.data.status;
        
        if (jobStatus === "finished") {
          exportTask = statusData.data.tasks.find((t: any) => t.operation === "export/url");
          break;
        }
      }
      
      attempts++;
    }

    if (jobStatus !== "finished" || !exportTask || !exportTask.result?.files?.[0]?.url) {
      console.error("Conversion failed or timed out. Status:", jobStatus);
      return new Response(
        JSON.stringify({ error: "Conversion failed or timed out" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const pdfUrl = exportTask.result.files[0].url;
    console.log("PDF converted successfully:", pdfUrl);

    // Fetch the converted PDF
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch converted PDF" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const pdfBlob = await pdfResponse.arrayBuffer();

    // Return the PDF directly
    return new Response(pdfBlob, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="converted.pdf"`,
      },
    });

  } catch (error) {
    console.error("Error in convert-to-pdf:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error occurred" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});