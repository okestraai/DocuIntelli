import 'dotenv/config';
import { createClient } from "@supabase/supabase-js";

async function testInsert() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const dummyChunk = {
    document_id: "b9f07911-3af9-4514-857d-ee882c865e8",
    user_id: "ce1072ba-822d-42c0-b705-4ca2e5f991db",
    chunk_text: "This is a test chunk of text.",
    embedding: `{${Array(1536).fill(0).join(",")}}`, // <-- proper vector serialization
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
