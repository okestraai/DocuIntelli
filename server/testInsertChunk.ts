import 'dotenv/config';
import { createClient } from "@supabase/supabase-js";

async function testInsert() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const document_id = "b9f07911-3af9-4514-857d-ee882c865e8";
  const user_id = "ce1072ba-822d-42c0-b705-4ca2e5f991db";

  console.log("📌 Using document_id:", document_id);
  console.log("📌 Using user_id:", user_id);

  const dummyChunk = {
    document_id, // Supabase should accept plain UUID strings
    user_id,
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
