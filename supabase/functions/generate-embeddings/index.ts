import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  document_id?: string;
  limit?: number;
}

interface DocumentChunk {
  id: string;
  chunk_text: string;
  chunk_index: number;
  document_id: string;
}

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("📊 Starting embedding generation...");

    let document_id: string | undefined;
    let limit = 3; // Process 3 chunks at a time to avoid timeouts

    if (req.method === "POST") {
      try {
        const body: RequestBody = await req.json();
        document_id = body.document_id;
        if (body.limit && body.limit > 0) {
          limit = Math.min(body.limit, 10); // Max 10 at a time
        }
      } catch {
        // No body or invalid JSON, use defaults
      }
    }

    let query = supabase
      .from("document_chunks")
      .select("id, chunk_text, chunk_index, document_id")
      .is("embedding", null)
      .not("chunk_text", "eq", "")
      .not("chunk_text", "is", null)
      .limit(limit);

    if (document_id) {
      console.log(`🎯 Filtering for document: ${document_id}`);
      query = query.eq("document_id", document_id);
    }

    const { data: chunks, error: fetchError } = await query;

    if (fetchError) {
      console.error("❌ Error fetching chunks:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch chunks", details: fetchError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!chunks || chunks.length === 0) {
      console.log("✅ No chunks need embedding generation");
      return new Response(
        JSON.stringify({ success: true, updated: 0, message: "No chunks to process" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`📝 Processing ${chunks.length} chunks...`);

    let updatedCount = 0;
    const errors: Array<{ chunkId: string; error: string }> = [];

    // Create embedding model session outside the loop
    const session = new Supabase.ai.Session("gte-small");

    for (const chunk of chunks as DocumentChunk[]) {
      try {
        console.log(`🔄 Chunk ${chunk.id} (${chunk.chunk_index}): text length = ${chunk.chunk_text.length}`);

        // Generate embedding using Supabase AI
        const embedding = await session.run(chunk.chunk_text, {
          mean_pool: true,
          normalize: true,
        });

        console.log(`🧮 Embedding generated, type: ${typeof embedding}, isArray: ${Array.isArray(embedding)}`);

        if (!embedding) {
          throw new Error("Embedding is null or undefined");
        }

        // Convert to array if needed
        let embeddingArray: number[];
        if (Array.isArray(embedding)) {
          embeddingArray = embedding;
        } else if (typeof embedding === 'object' && 'data' in embedding) {
          embeddingArray = (embedding as any).data;
        } else {
          throw new Error(`Invalid embedding format: ${typeof embedding}`);
        }

        if (!Array.isArray(embeddingArray) || embeddingArray.length === 0) {
          throw new Error(`Invalid embedding array: length = ${embeddingArray?.length}`);
        }

        console.log(`📊 Embedding array length: ${embeddingArray.length}`);

        const { error: updateError } = await supabase
          .from("document_chunks")
          .update({ embedding: embeddingArray })
          .eq("id", chunk.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        updatedCount++;
        console.log(`✅ Updated chunk ${chunk.id}`);
      } catch (err: any) {
        console.error(`❌ Error processing chunk ${chunk.id}:`, err.message);
        errors.push({ chunkId: chunk.id, error: err.message });
      }
    }

    // Check if there are more chunks to process
    const { count: remainingCount } = await supabase
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .is("embedding", null)
      .not("chunk_text", "eq", "")
      .not("chunk_text", "is", null);

    console.log(`🎉 Completed: ${updatedCount}/${chunks.length} chunks updated`);
    console.log(`📊 Remaining chunks with null embeddings: ${remainingCount || 0}`);

    return new Response(
      JSON.stringify({
        success: true,
        updated: updatedCount,
        total: chunks.length,
        remaining: remainingCount || 0,
        errors: errors.length > 0 ? errors : undefined,
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
