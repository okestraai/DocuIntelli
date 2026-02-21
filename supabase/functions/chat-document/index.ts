import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "http://localhost:5173",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  document_id: string;
  question: string;
  user_id: string;
  warmup?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();

    // Warmup ping — return immediately to keep the function hot
    if (body.warmup) {
      return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vllmChatUrl = Deno.env.get("VLLM_CHAT_URL") || "https://chat.affinityecho.com";
    const vllmEmbedderUrl = Deno.env.get("VLLM_EMBEDDER_URL") || "https://embedder.affinityecho.com";
    const cfAccessClientId = Deno.env.get("CF_ACCESS_CLIENT_ID");
    const cfAccessClientSecret = Deno.env.get("CF_ACCESS_CLIENT_SECRET");

    if (!cfAccessClientId || !cfAccessClientSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Cloudflare Access credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { document_id, question } = body as RequestBody;

    if (!document_id || !question) {
      return new Response(
        JSON.stringify({ success: false, error: "document_id and question are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof question !== "string" || question.length > 2000) {
      return new Response(
        JSON.stringify({ success: false, error: "Question must be a string of 2000 characters or less" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract user_id from JWT instead of trusting request body
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const user_id = authUser.id;

    // Verify user owns the document
    const { data: docOwnership, error: docError } = await supabase
      .from("documents")
      .select("id")
      .eq("id", document_id)
      .eq("user_id", user_id)
      .single();

    if (docError || !docOwnership) {
      return new Response(
        JSON.stringify({ success: false, error: "Document not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`💬 Processing question for document: ${document_id}`);

    // ── Parallel: chat history + query embedding ────────────────────────────
    const questionFormatted = `Instruct: Given a web search query, retrieve relevant passages\nQuery: ${question}`;

    const [historyResult, embeddingResponse] = await Promise.all([
      // Load last 10 messages (trimmed from 20 to reduce prompt length)
      supabase
        .from("document_chats")
        .select("role, content")
        .eq("user_id", user_id)
        .eq("document_id", document_id)
        .order("created_at", { ascending: true })
        .limit(10),

      // Generate query embedding
      fetch(`${vllmEmbedderUrl}/v1/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Access-Client-Id": cfAccessClientId,
          "CF-Access-Client-Secret": cfAccessClientSecret,
        },
        body: JSON.stringify({
          model: "intfloat/e5-mistral-7b-instruct",
          input: [questionFormatted],
        }),
      }),
    ]);

    if (historyResult.error) {
      console.error("❌ Error loading chat history:", historyResult.error);
    }

    const conversation_history = historyResult.data || [];
    console.log(`📚 Loaded ${conversation_history.length} previous messages`);

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      throw new Error(`vLLM Embedding API error: ${embeddingResponse.status} - ${errorText}`);
    }

    const embeddingData = await embeddingResponse.json();
    const questionEmbedding = embeddingData.data[0].embedding;

    if (!questionEmbedding || !Array.isArray(questionEmbedding)) {
      throw new Error("Failed to generate question embedding");
    }

    console.log(`✅ Question embedding generated: ${questionEmbedding.length} dimensions`);

    // ── Vector similarity search (match_count tuned from 5 to 4) ────────────
    const { data: relevantChunks, error: searchError } = await supabase.rpc(
      "match_document_chunks",
      {
        query_embedding: questionEmbedding,
        match_document_id: document_id,
        match_count: 4,
        similarity_threshold: 0.3,
      }
    );

    if (searchError) {
      console.error("❌ Search error:", searchError);
      throw new Error(`Failed to search chunks: ${searchError.message}`);
    }

    console.log(`📊 Found ${relevantChunks?.length || 0} relevant chunks`);

    // Build context from relevant chunks (plain separators, no labels/percentages)
    let context = "";
    if (relevantChunks && relevantChunks.length > 0) {
      context = relevantChunks
        .map((chunk: any) => chunk.chunk_text)
        .join("\n---\n");
    }

    const sources = relevantChunks?.map((chunk: any) => ({
      chunk_index: chunk.chunk_index,
      similarity: chunk.similarity,
      preview: chunk.chunk_text.slice(0, 150) + (chunk.chunk_text.length > 150 ? "..." : ""),
    })) || [];

    console.log(`📝 Context built: ${context.length} characters`);

    // ── Build chat messages (single system message with context inline) ──────
    const systemBase = `You are a helpful document assistant. Answer questions using ONLY the provided document sections. Use plain text, no markdown. Be concise and conversational.

Rules:
- Only state facts found in the document sections below. Never invent or assume information.
- If the answer is not in the provided sections, say so politely.
- Never mention sources, references, or where information came from.
- Use conversation history for follow-up context.`;

    let systemContent: string;
    if (context) {
      systemContent = `${systemBase}\n\nDocument sections:\n${context}`;
    } else {
      systemContent = `${systemBase}\n\nNo relevant sections were found. Inform the user this information is not in their document.`;
    }

    const messages = [
      { role: "system", content: systemContent },
      ...conversation_history,
      { role: "user", content: question },
    ];

    // ── Streaming chat response ─────────────────────────────────────────────
    console.log(`🤖 Calling vLLM Chat (streaming)...`);

    const chatResponse = await fetch(`${vllmChatUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Access-Client-Id": cfAccessClientId,
        "CF-Access-Client-Secret": cfAccessClientSecret,
      },
      body: JSON.stringify({
        model: "hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4",
        messages,
        temperature: 0.4,
        max_tokens: 500,
        stream: true,
      }),
    });

    if (!chatResponse.ok) {
      const errorData = await chatResponse.text();
      throw new Error(`vLLM Chat API error: ${chatResponse.status} - ${errorData}`);
    }

    // Pipe vLLM SSE stream → client SSE stream
    const encoder = new TextEncoder();
    const reader = chatResponse.body!.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let fullAnswer = "";
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            // Keep the last potentially incomplete line in the buffer
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;

              const data = trimmed.slice(6);
              if (data === "[DONE]") {
                // Send final event with sources and full answer
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "done", sources, answer: fullAnswer })}\n\n`
                  )
                );

                console.log(`✅ Answer streamed: ${fullAnswer.length} characters`);

                // Fire-and-forget parallel DB saves
                Promise.all([
                  supabase.from("document_chats").insert({
                    user_id,
                    document_id,
                    role: "user",
                    content: question,
                  }),
                  supabase.from("document_chats").insert({
                    user_id,
                    document_id,
                    role: "assistant",
                    content: fullAnswer,
                    sources: sources.length > 0 ? sources : null,
                  }),
                ]).then(() => {
                  console.log("💾 Conversation saved to database");
                }).catch((err) => {
                  console.error("❌ Error saving chat messages:", err);
                });

                controller.close();
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || "";
                if (content) {
                  fullAnswer += content;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "chunk", content })}\n\n`
                    )
                  );
                }
              } catch {
                // Skip malformed JSON lines
              }
            }
          }

          // Stream ended without [DONE] — still save what we have
          if (fullAnswer) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "done", sources, answer: fullAnswer })}\n\n`
              )
            );
            Promise.all([
              supabase.from("document_chats").insert({ user_id, document_id, role: "user", content: question }),
              supabase.from("document_chats").insert({
                user_id,
                document_id,
                role: "assistant",
                content: fullAnswer,
                sources: sources.length > 0 ? sources : null,
              }),
            ]).catch((err) => console.error("❌ Error saving chat messages:", err));
          }
          controller.close();
        } catch (error: any) {
          console.error("❌ Streaming error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
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
