import 'dotenv/config';
import { createClient } from "@supabase/supabase-js";

async function testInsert() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const dummyChunk = {
    document_id: "test-doc-123",
    user_id: "test-user-123",
    chunk_text: "This is a test chunk of text.",
    embedding: Array(1536).fill(0),
  };

  const { data, error } = await supabase
    .from("document_chunks")
    .insert([dummyChunk])
    .select("*");

  if (error) {
    console.error("❌ Insert error:", error);
  } else {
    console.log("✅ Insert success:", data);
  }
}

testInsert();
