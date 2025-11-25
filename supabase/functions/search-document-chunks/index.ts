import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import OpenAI from "npm:openai@4.67.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  document_id: string;
  query: string;
  match_threshold?: number;
  match_count?: number;
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
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const { document_id, query, match_threshold = 0.7, match_count = 10 }: RequestBody = await req.json();

    if (!document_id || !query) {
      return new Response(
        JSON.stringify({ error: "document_id and query are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`🔍 Searching in document ${document_id} for: "${query}"`);

    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      dimensions: 384,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;
    console.log(`✅ Generated query embedding with ${queryEmbedding.length} dimensions`);

    const { data: matches, error: searchError } = await supabase.rpc(
      "match_document_chunks",
      {
        query_embedding: queryEmbedding,
        match_threshold,
        match_count,
        filter_document_id: document_id,
      }
    );

    if (searchError) {
      console.error("Search error:", searchError);
      throw new Error(`Search failed: ${searchError.message}`);
    }

    console.log(`📊 Found ${matches?.length || 0} matching chunks`);

    const results = matches?.map((match: any) => ({
      chunk_id: match.id,
      chunk_index: match.chunk_index,
      chunk_text: match.chunk_text,
      similarity: match.similarity,
    })) || [];

    return new Response(
      JSON.stringify({
        success: true,
        query,
        results,
        count: results.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("❌ Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});