import { supabase } from "./supabaseClient";

export async function saveChunks(
  fileId: string,
  chunks: { index: number; content: string }[]
) {
  const { error } = await supabase
    .from("document_chunks")
    .insert(
      chunks.map(chunk => ({
        file_id: fileId,
        chunk_index: chunk.index,
        text: chunk.content
      }))
    );

  if (error) throw error;
}
