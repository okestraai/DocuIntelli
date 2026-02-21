import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "http://localhost:5173",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  document_id?: string;
  limit?: number;
  continue_processing?: boolean;
}

interface DocumentChunk {
  id: string;
  chunk_text: string;
  chunk_index: number;
  document_id: string;
}

const BATCH_SIZE = 3;
const TIME_BUDGET_MS = 120_000; // 120s — stay within edge function limits

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const startTime = Date.now();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("📊 Starting embedding generation...");

    let document_id: string | undefined;
    let continue_processing = false;

    if (req.method === "POST") {
      try {
        const body: RequestBody = await req.json();
        document_id = body.document_id;
        continue_processing = body.continue_processing || false;
      } catch {
        // No body or invalid JSON, use defaults
      }
    }

    // Get vLLM embedding service configuration
    const vllmEmbedderUrl = Deno.env.get("VLLM_EMBEDDER_URL");
    const cfAccessClientId = Deno.env.get("CF_ACCESS_CLIENT_ID");
    const cfAccessClientSecret = Deno.env.get("CF_ACCESS_CLIENT_SECRET");

    if (!vllmEmbedderUrl) {
      throw new Error("VLLM_EMBEDDER_URL not configured");
    }

    const embeddingHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (cfAccessClientId && cfAccessClientSecret) {
      embeddingHeaders["CF-Access-Client-Id"] = cfAccessClientId;
      embeddingHeaders["CF-Access-Client-Secret"] = cfAccessClientSecret;
    }

    let totalUpdated = 0;
    let totalProcessed = 0;
    const allErrors: Array<{ chunkId: string; error: string }> = [];
    let tagTriggered = false;

    // Process chunks in a loop until done or time budget exceeded
    while (true) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        console.log("⏰ Time budget exceeded, stopping");
        break;
      }

      // Fetch next batch
      let query = supabase
        .from("document_chunks")
        .select("id, chunk_text, chunk_index, document_id")
        .is("embedding", null)
        .not("chunk_text", "eq", "")
        .not("chunk_text", "is", null)
        .order("created_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (document_id) {
        query = query.eq("document_id", document_id);
      }

      const { data: chunks, error: fetchError } = await query;

      if (fetchError) {
        console.error("❌ Error fetching chunks:", fetchError);
        break;
      }

      if (!chunks || chunks.length === 0) {
        console.log("✅ No more chunks need embedding generation");
        break;
      }

      console.log(`📝 Processing batch of ${chunks.length} chunks...`);

      for (const chunk of chunks as DocumentChunk[]) {
        if (Date.now() - startTime > TIME_BUDGET_MS) {
          console.log("⏰ Time budget exceeded mid-batch");
          break;
        }

        try {
          const embeddingResponse = await fetch(`${vllmEmbedderUrl}/v1/embeddings`, {
            method: "POST",
            headers: embeddingHeaders,
            body: JSON.stringify({
              input: chunk.chunk_text,
              model: "intfloat/e5-mistral-7b-instruct",
            }),
          });

          if (!embeddingResponse.ok) {
            const errorText = await embeddingResponse.text();
            throw new Error(`vLLM API error: ${embeddingResponse.status} - ${errorText}`);
          }

          const embeddingResult = await embeddingResponse.json();
          const embeddingArray = embeddingResult.data?.[0]?.embedding;

          if (!embeddingArray || !Array.isArray(embeddingArray) || embeddingArray.length === 0) {
            throw new Error(`Invalid embedding: ${embeddingArray ? `length=${embeddingArray.length}` : "null"}`);
          }

          const { error: updateError } = await supabase
            .from("document_chunks")
            .update({ embedding: embeddingArray })
            .eq("id", chunk.id);

          if (updateError) {
            throw new Error(updateError.message);
          }

          totalUpdated++;
          console.log(`✅ Chunk ${chunk.chunk_index} done (${totalUpdated} total)`);
        } catch (err: any) {
          console.error(`❌ Error chunk ${chunk.id}:`, err.message);
          allErrors.push({ chunkId: chunk.id, error: err.message });
        }
        totalProcessed++;
      }

      // After each batch, check tag generation for document-specific processing
      if (document_id && totalUpdated > 0 && !tagTriggered) {
        try {
          const { count: totalChunks } = await supabase
            .from("document_chunks")
            .select("id", { count: "exact", head: true })
            .eq("document_id", document_id);

          const { count: embeddedChunks } = await supabase
            .from("document_chunks")
            .select("id", { count: "exact", head: true })
            .eq("document_id", document_id)
            .not("embedding", "is", null);

          if (totalChunks && embeddedChunks && totalChunks > 0) {
            const progress = (embeddedChunks / totalChunks) * 100;
            console.log(`📊 Progress: ${progress.toFixed(1)}% (${embeddedChunks}/${totalChunks})`);

            if (progress >= 60) {
              const { data: docData } = await supabase
                .from("documents")
                .select("tags, tag_generation_triggered")
                .eq("id", document_id)
                .single();

              const hasTags = docData?.tags && Array.isArray(docData.tags) && docData.tags.length > 0;
              const alreadyTriggered = docData?.tag_generation_triggered === true;

              // Trigger at 60%, or retry at 100% if previous attempt failed
              if (!hasTags && (!alreadyTriggered || progress >= 100)) {
                console.log(`🏷️ Triggering tag generation at ${progress.toFixed(1)}%`);

                await supabase
                  .from("documents")
                  .update({ tag_generation_triggered: true })
                  .eq("id", document_id);

                // Await the trigger to ensure it fires before isolate shuts down
                try {
                  const authHeader = req.headers.get("Authorization") || `Bearer ${supabaseServiceKey}`;
                  await fetch(`${supabaseUrl}/functions/v1/generate-tags`, {
                    method: "POST",
                    headers: {
                      "Authorization": authHeader,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ document_id }),
                  });
                } catch (tagErr) {
                  console.error("Failed to trigger tag generation:", tagErr);
                }

                tagTriggered = true;
              }
            }
          }
        } catch (progressError: any) {
          console.error("⚠️ Progress check error:", progressError.message);
        }
      }

      // If not continue_processing, stop after first batch
      if (!continue_processing) {
        break;
      }
    }

    // Final remaining count
    let finalQuery = supabase
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .is("embedding", null)
      .not("chunk_text", "eq", "")
      .not("chunk_text", "is", null);

    if (document_id) {
      finalQuery = finalQuery.eq("document_id", document_id);
    }

    const { count: remainingCount } = await finalQuery;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`🎉 Done in ${elapsed}s: ${totalUpdated}/${totalProcessed} updated, ${remainingCount || 0} remaining`);

    return new Response(
      JSON.stringify({
        success: true,
        updated: totalUpdated,
        total: totalProcessed,
        remaining: remainingCount || 0,
        elapsed_seconds: parseFloat(elapsed),
        errors: allErrors.length > 0 ? allErrors : undefined,
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
