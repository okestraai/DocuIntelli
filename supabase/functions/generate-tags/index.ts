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

    const { document_id }: RequestBody = await req.json();

    if (!document_id) {
      return new Response(
        JSON.stringify({ error: "document_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`🏷️ Generating tags for document: ${document_id}`);

    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("name, category, tags")
      .eq("id", document_id)
      .single();

    if (docError || !document) {
      throw new Error("Document not found");
    }

    if (document.tags && Array.isArray(document.tags) && document.tags.length > 0) {
      console.log(`✅ Document already has tags:`, document.tags);
      return new Response(
        JSON.stringify({
          success: true,
          tags: document.tags,
          message: "Document already has tags"
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: stats, error: statsError } = await supabase
      .from("document_chunks")
      .select("id, embedding")
      .eq("document_id", document_id);

    if (statsError) {
      throw new Error(`Failed to get chunk stats: ${statsError.message}`);
    }

    const totalChunks = stats.length;
    const chunksWithEmbeddings = stats.filter(chunk => chunk.embedding !== null).length;
    const progress = totalChunks > 0 ? (chunksWithEmbeddings / totalChunks) * 100 : 0;

    console.log(`📊 Embedding progress: ${progress.toFixed(1)}% (${chunksWithEmbeddings}/${totalChunks})`);

    if (progress < 60) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Embedding progress is ${progress.toFixed(1)}%. Tags will be generated at 60% completion.`,
          progress
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: sampleChunks, error: chunksError } = await supabase
      .from("document_chunks")
      .select("chunk_text")
      .eq("document_id", document_id)
      .not("embedding", "is", null)
      .order("chunk_index", { ascending: true })
      .limit(10);

    if (chunksError || !sampleChunks || sampleChunks.length === 0) {
      throw new Error("No chunks with embeddings found");
    }

    const sampleText = sampleChunks.map(c => c.chunk_text).join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are an expert at analyzing legal and financial documents. Generate exactly 5 relevant tags that describe the document's content, purpose, and key topics. Tags should be short (1-3 words), specific, and useful for categorization. Return only a JSON array of 5 strings."
        },
        {
          role: "user",
          content: `Document name: ${document.name}\nCategory: ${document.category}\n\nSample content:\n${sampleText}\n\nGenerate exactly 5 relevant tags as a JSON array.`
        }
      ],
      temperature: 0.3,
      max_tokens: 150,
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || "[]";
    console.log("🤖 OpenAI response:", responseText);

    let tags: string[] = [];
    try {
      tags = JSON.parse(responseText);
      if (!Array.isArray(tags)) {
        throw new Error("Response is not an array");
      }
      tags = tags.slice(0, 5);
    } catch (parseError) {
      console.error("Failed to parse tags:", parseError);
      const matches = responseText.match(/"([^"]+)"/g);
      if (matches && matches.length > 0) {
        tags = matches.slice(0, 5).map(m => m.replace(/"/g, ''));
      } else {
        const categoryTags: Record<string, string[]> = {
          warranty: ["Warranty", "Product Coverage", "Repair Terms", "Guarantee", "Service"],
          insurance: ["Insurance", "Policy Coverage", "Premium", "Benefits", "Claims"],
          lease: ["Lease Agreement", "Rental Terms", "Property", "Tenant", "Duration"],
          employment: ["Employment", "Job Contract", "Salary", "Benefits", "Terms"],
          contract: ["Contract", "Agreement", "Terms", "Obligations", "Legal"],
          other: ["Document", "Legal", "Agreement", "Terms", "Important"]
        };
        tags = categoryTags[document.category] || categoryTags.other;
      }
    }

    const { error: updateError } = await supabase
      .from("documents")
      .update({ tags })
      .eq("id", document_id);

    if (updateError) {
      throw new Error(`Failed to update document: ${updateError.message}`);
    }

    console.log(`✅ Tags generated and saved:`, tags);

    return new Response(
      JSON.stringify({
        success: true,
        tags,
        progress: progress.toFixed(1)
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