import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    console.log("🚀 Starting batch embedding generation...");

    let totalProcessed = 0;
    let hasMore = true;
    const maxIterations = 50;
    let iteration = 0;

    while (hasMore && iteration < maxIterations) {
      iteration++;
      console.log(`\n📦 Batch ${iteration}...`);

      const embeddingUrl = `${supabaseUrl}/functions/v1/generate-embeddings`;
      const response = await fetch(embeddingUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 1 }),
      });

      if (!response.ok) {
        console.error(`❌ Batch ${iteration} failed:`, response.status);
        break;
      }

      const result = await response.json();
      console.log(`✅ Batch ${iteration}: ${result.updated} embeddings created, ${result.remaining} remaining`);

      totalProcessed += result.updated || 0;

      if (!result.remaining || result.remaining === 0 || result.updated === 0) {
        hasMore = false;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`\n🎉 Batch processing completed!`);
    console.log(`📊 Total embeddings created: ${totalProcessed}`);

    return new Response(
      JSON.stringify({
        success: true,
        total_processed: totalProcessed,
        iterations: iteration,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("❌ Fatal error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error", details: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});