import { createClient } from "@supabase/supabase-js";

async function testInsert() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // must be service role
  );

  const dummyChunk = {
    document_id: "test-doc-123",     // any UUID/string from your documents table
    user_id: "test-user-123",        // use a real auth.users UUID if possible
    chunk_text: "This is a test chunk of text.",
    embedding: Array(1536).fill(0),  // dummy vector of 1536 zeros
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
