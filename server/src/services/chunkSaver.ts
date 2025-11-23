import { supabase } from "../supabaseClient";

export async function saveChunks(
  documentId: string,
  userId: string,
  chunks: { index: number; content: string }[]
) {
  const formatted = chunks.map(chunk => ({
    document_id: documentId,
    user_id: userId,
    chunk_text: chunk.content,
    chunk_index: chunk.index,
    embedding: null // fill later with OpenAI or LLaMA embeddings
  }));

  const { error } = await supabase
    .from("document_chunks")
    .insert(formatted);

  if (error) {
    console.error("Supabase insert error:", error);
    throw error;
  }
}
