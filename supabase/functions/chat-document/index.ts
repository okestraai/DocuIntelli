import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  document_id: string;
  question: string;
  user_id: string;
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
      return new Response(
        JSON.stringify({ success: false, error: "OpenAI API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { document_id, question, user_id }: RequestBody = await req.json();

    if (!document_id || !question || !user_id) {
      return new Response(
        JSON.stringify({ success: false, error: "document_id, question, and user_id are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`💬 Processing question for document: ${document_id}`);

    // Load conversation history from database
    const { data: chatHistory, error: historyError } = await supabase
      .from("document_chats")
      .select("role, content")
      .eq("user_id", user_id)
      .eq("document_id", document_id)
      .order("created_at", { ascending: true })
      .limit(20);

    if (historyError) {
      console.error("❌ Error loading chat history:", historyError);
    }

    const conversation_history = chatHistory || [];
    console.log(`📚 Loaded ${conversation_history.length} previous messages`);

    // Step 1: Generate embedding for the question
    console.log(`🧮 Generating embedding for question...`);
    const embeddingModel = new Supabase.ai.Session("gte-small");
    const questionEmbedding = await embeddingModel.run(question, {
      mean_pool: true,
      normalize: true,
    });

    if (!questionEmbedding || !Array.isArray(questionEmbedding)) {
      throw new Error("Failed to generate question embedding");
    }

    console.log(`✅ Question embedding generated: ${questionEmbedding.length} dimensions`);

    // Step 2: Search for relevant chunks using vector similarity
    console.log(`🔍 Searching for relevant chunks...`);
    const { data: relevantChunks, error: searchError } = await supabase.rpc(
      "match_document_chunks",
      {
        query_embedding: questionEmbedding,
        match_document_id: document_id,
        match_count: 5,
        similarity_threshold: 0.3,
      }
    );

    if (searchError) {
      console.error("❌ Search error:", searchError);
      throw new Error(`Failed to search chunks: ${searchError.message}`);
    }

    console.log(`📊 Found ${relevantChunks?.length || 0} relevant chunks`);

    // Step 3: Build context from relevant chunks
    let context = "";
    if (relevantChunks && relevantChunks.length > 0) {
      context = relevantChunks
        .map((chunk: any, index: number) => 
          `[Chunk ${index + 1}, Relevance: ${Math.round(chunk.similarity * 100)}%]:\n${chunk.chunk_text}`
        )
        .join("\n\n");
    }

    console.log(`📝 Context built: ${context.length} characters`);

    // Step 4: Call OpenAI to generate response
    console.log(`🤖 Calling OpenAI...`);

    const systemPrompt = `You are a polite and helpful AI assistant that answers questions about documents.

STRICT RULES YOU MUST FOLLOW:
1. Always be polite and professional in your responses
2. Format your responses clearly with proper structure (use bullet points, numbered lists, or paragraphs as appropriate)
3. DO NOT mention chunk numbers, references, or sources in your response - speak naturally as if you've read the entire document
4. ONLY provide information that is explicitly stated in the document sections provided to you
5. DO NOT make assumptions, formulate new information, or hallucinate details not in the document
6. If the question asks about something NOT covered in the provided document sections, politely inform the user that this information is not available in the document
7. Use the conversation history to maintain context and provide more relevant responses

Example responses:
- If information is found: Provide it naturally and clearly formatted
- If information is NOT found: "I apologize, but I couldn't find information about that topic in this document. The document doesn't appear to cover this particular subject."`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversation_history,
    ];

    if (context) {
      messages.push({
        role: "system",
        content: `Here are the relevant sections from the document:\n\n${context}\n\nRemember: Only use information from these sections. Do not mention chunk numbers or references in your response.`,
      });
    } else {
      messages.push({
        role: "system",
        content: "No relevant sections were found in the document for this question. Politely inform the user that this information is not available in their document.",
      });
    }

    messages.push({ role: "user", content: question });

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
    }

    const openaiData = await openaiResponse.json();
    const answer = openaiData.choices[0].message.content;

    console.log(`✅ Answer generated: ${answer.length} characters`);

    const sources = relevantChunks?.map((chunk: any) => ({
      chunk_index: chunk.chunk_index,
      similarity: chunk.similarity,
      preview: chunk.chunk_text.slice(0, 150) + (chunk.chunk_text.length > 150 ? "..." : ""),
    })) || [];

    // Save user message to database
    const { error: userMessageError } = await supabase
      .from("document_chats")
      .insert({
        user_id,
        document_id,
        role: "user",
        content: question,
      });

    if (userMessageError) {
      console.error("❌ Error saving user message:", userMessageError);
    }

    // Save assistant response to database
    const { error: assistantMessageError } = await supabase
      .from("document_chats")
      .insert({
        user_id,
        document_id,
        role: "assistant",
        content: answer,
        sources: sources.length > 0 ? sources : null,
      });

    if (assistantMessageError) {
      console.error("❌ Error saving assistant message:", assistantMessageError);
    }

    console.log("�� Conversation saved to database");

    return new Response(
      JSON.stringify({
        success: true,
        answer: answer,
        sources: sources,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("❌ Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error", details: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
