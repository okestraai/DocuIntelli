import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** Build CORS headers dynamically from the request Origin. */
function getCorsHeaders(req: Request) {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "http://localhost:5173,http://localhost:5000")
    .split(",").map((o) => o.trim());
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Impersonation-Proof",
  };
}

/**
 * Verify an HMAC-signed impersonation proof token.
 * Matches the same logic as server/src/middleware/impersonation.ts.
 * Uses Web Crypto API (available in Deno runtime).
 */
async function verifyImpersonationProof(token: string, authenticatedUserId: string): Promise<boolean> {
  try {
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!secret) return false;

    const decoded = atob(token);
    const parts = decoded.split(":");
    if (parts.length !== 4) return false;

    const [_adminId, targetUserId, timestamp, signature] = parts;
    if (targetUserId !== authenticatedUserId) return false;

    const age = Date.now() - parseInt(timestamp, 10);
    if (isNaN(age) || age < 0 || age > 24 * 60 * 60 * 1000) return false;

    const payload = `${_adminId}:${targetUserId}:${timestamp}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const expected = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return expected === signature;
  } catch {
    return false;
  }
}

interface RequestBody {
  document_id: string;
  question: string;
  user_id: string;
  warmup?: boolean;
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");

    // ── Parallel batch 1: auth + embedding (embedding is slowest, start immediately) ──
    const questionFormatted = `Instruct: Given a web search query, retrieve relevant passages\nQuery: ${question}`;

    const [authResult, embeddingResponse] = await Promise.all([
      supabase.auth.getUser(token),
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

    const { data: { user: authUser }, error: authError } = authResult;
    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const user_id = authUser.id;

    // ── Parallel batch 2: doc ownership + chat history + impersonation check ──
    const impersonationProof = req.headers.get("X-Impersonation-Proof");

    const [docResult, historyResult, isImpersonated] = await Promise.all([
      supabase
        .from("documents")
        .select("id")
        .eq("id", document_id)
        .eq("user_id", user_id)
        .single(),
      supabase
        .from("document_chats")
        .select("role, content")
        .eq("user_id", user_id)
        .eq("document_id", document_id)
        .order("created_at", { ascending: true })
        .limit(8),
      impersonationProof
        ? verifyImpersonationProof(impersonationProof, user_id)
        : Promise.resolve(false),
    ]);

    if (docResult.error || !docResult.data) {
      return new Response(
        JSON.stringify({ success: false, error: "Document not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`💬 Processing question for document: ${document_id}`);

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

    // ── Vector similarity search ──────────────────────────────────────────
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

    // Build context from relevant chunks — cap each to reduce prompt size
    const MAX_CHUNK_CHARS = 600;
    let context = "";
    if (relevantChunks && relevantChunks.length > 0) {
      context = relevantChunks
        .map((chunk: any) => {
          const text = chunk.chunk_text;
          return text.length > MAX_CHUNK_CHARS ? text.slice(0, MAX_CHUNK_CHARS) + "..." : text;
        })
        .join("\n---\n");
    }

    const sources = relevantChunks?.map((chunk: any) => ({
      chunk_index: chunk.chunk_index,
      similarity: chunk.similarity,
      preview: chunk.chunk_text.slice(0, 150) + (chunk.chunk_text.length > 150 ? "..." : ""),
    })) || [];

    console.log(`📝 Context built: ${context.length} characters`);

    // ── Build chat messages ──────────────────────────────────────────────
    // System message is CONSTANT so vLLM prefix cache always hits (~100%).
    // Variable content (chunks) goes in a user message before the question.
    const systemMessage = `You are a concise document assistant. Answer using ONLY the provided document sections. Be brief and direct.
Rules: Only state facts from the sections provided by the user. If not found, say so. Never mention sources. Use conversation history for follow-up context.`;

    const contextMessage = context
      ? `[Document sections]\n${context}\n[End sections]`
      : `No relevant sections were found in this document.`;

    const messages = [
      { role: "system", content: systemMessage },
      ...conversation_history,
      { role: "user", content: `${contextMessage}\n\nQuestion: ${question}` },
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
        max_tokens: 400,
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
                // Skip when impersonated — admin chats should not appear in user history
                if (!isImpersonated) {
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
                } else {
                  console.log("⚡ Impersonation mode — skipping chat persistence");
                }

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
            if (!isImpersonated) {
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
