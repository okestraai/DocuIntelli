import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("🔄 Starting automatic NULL embedding processing...");

    const { count: nullCount } = await supabase
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .is("embedding", null)
      .not("chunk_text", "eq", "")
      .not("chunk_text", "is", null);

    if (!nullCount || nullCount === 0) {
      console.log("✅ No chunks with NULL embeddings found");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No chunks need processing",
          processed: 0,
          remaining: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`📊 Found ${nullCount} chunks with NULL embeddings`);

    const batchSize = 5;
    const maxBatches = 10;
    let totalProcessed = 0;
    let batchesProcessed = 0;

    for (let i = 0; i < maxBatches && totalProcessed < nullCount; i++) {
      console.log(`🔄 Processing batch ${i + 1}/${maxBatches}...`);

      const embeddingUrl = `${supabaseUrl}/functions/v1/generate-embeddings`;
      const response = await fetch(embeddingUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          limit: batchSize,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`❌ Batch ${i + 1} failed:`, errorData);
        break;
      }

      const result = await response.json();
      totalProcessed += result.updated || 0;
      batchesProcessed++;

      console.log(`✅ Batch ${i + 1} completed: ${result.updated} chunks processed`);

      if (result.remaining === 0) {
        console.log("🎉 All chunks processed!");
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const { count: remainingCount } = await supabase
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .is("embedding", null)
      .not("chunk_text", "eq", "")
      .not("chunk_text", "is", null);

    console.log(`🎉 Processing complete: ${totalProcessed} chunks processed, ${remainingCount || 0} remaining`);

    console.log("🏷️ Checking for documents ready for tag generation...");

    const { data: documents } = await supabase
      .from("documents")
      .select("id, tags")
      .or("tags.is.null,tags.eq.{}");

    if (documents && documents.length > 0) {
      for (const doc of documents) {
        const { data: stats } = await supabase
          .from("document_chunks")
          .select("id, embedding")
          .eq("document_id", doc.id);

        if (stats && stats.length > 0) {
          const totalChunks = stats.length;
          const chunksWithEmbeddings = stats.filter(chunk => chunk.embedding !== null).length;
          const progress = (chunksWithEmbeddings / totalChunks) * 100;

          if (progress >= 60 && (!doc.tags || doc.tags.length === 0)) {
            console.log(`🏷️ Document ${doc.id} is ${progress.toFixed(1)}% complete, generating tags...`);

            try {
              const tagsUrl = `${supabaseUrl}/functions/v1/generate-tags`;
              const tagsResponse = await fetch(tagsUrl, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${supabaseServiceKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ document_id: doc.id }),
              });

              if (tagsResponse.ok) {
                const tagsResult = await tagsResponse.json();
                console.log(`✅ Tags generated for document ${doc.id}:`, tagsResult.tags);
              }
            } catch (tagError) {
              console.error(`⚠️ Failed to generate tags for document ${doc.id}:`, tagError);
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Automatic embedding processing completed",
        processed: totalProcessed,
        batches: batchesProcessed,
        remaining: remainingCount || 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("❌ Fatal error:", err);
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