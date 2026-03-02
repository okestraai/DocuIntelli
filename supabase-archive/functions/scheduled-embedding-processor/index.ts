import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/** Build CORS headers dynamically from the request Origin. */
function getCorsHeaders(req: Request) {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "http://localhost:5173,http://localhost:5000")
    .split(",").map((o) => o.trim());
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Impersonation-Proof",
  };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    console.log("⏰ Scheduled embedding processor triggered at:", new Date().toISOString());

    // Call the process-null-embeddings function
    const processUrl = `${supabaseUrl}/functions/v1/process-null-embeddings`;
    
    console.log("🔄 Calling process-null-embeddings function...");
    
    const response = await fetch(processUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("❌ process-null-embeddings failed:", errorData);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to process embeddings",
          details: errorData,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const result = await response.json();
    console.log("✅ Embedding processing result:", result);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Scheduled embedding processing completed",
        result,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("❌ Scheduled processor error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        details: err.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
