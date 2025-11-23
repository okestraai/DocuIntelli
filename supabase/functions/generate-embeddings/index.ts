import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  document_id?: string;
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

    if (req.method === "POST") {
      try {
        const body: RequestBody = await req.json();
        document_id = body.document_id;
      } catch {
        // No body or invalid JSON, process all chunks
      }
    }

    let query = supabase
      .from("document_chunks")
      .select("id, chunk_text, chunk_index, document_id")
      .is("embedding", null);

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

    for (const chunk of chunks as DocumentChunk[]) {
      try {
        console.log(`🔄 Generating embedding for chunk ${chunk.id} (index: ${chunk.chunk_index})`);

        const embeddingResponse = await supabase.functions.invoke("supabase-ai", {
          body: {
            model: "gte-small",
            input: chunk.chunk_text,
          },
        });

        if (embeddingResponse.error) {
          throw new Error(embeddingResponse.error.message || "Failed to generate embedding");
        }

        const embedding = embeddingResponse.data;

        if (!embedding || !Array.isArray(embedding)) {
          throw new Error("Invalid embedding format");
        }

        const { error: updateError } = await supabase
          .from("document_chunks")
          .update({ embedding })
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

    console.log(`🎉 Completed: ${updatedCount}/${chunks.length} chunks updated`);

    return new Response(
      JSON.stringify({
        success: true,
        updated: updatedCount,
        total: chunks.length,
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
