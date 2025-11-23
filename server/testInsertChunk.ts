import 'dotenv/config';
import { createClient } from "@supabase/supabase-js";

async function testInsert() {
  // Connect to Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ✅ Step 1: Fetch a valid document row
  const { data: docs, error: docError } = await supabase
    .from("documents")
    .select("id, user_id")
    .limit(1);

  if (docError) {
    console.error("❌ Error fetching documents:", docError);
    return;
  }
  if (!docs || docs.length === 0) {
    console.error("❌ No documents found in table. Insert a document first.");
    return;
  }

  const { id: document_id, user_id } = docs[0];
  console.log("📌 Using IDs:", { document_id, user_id });

  // ✅ Step 2: Build dummy chunk
  const dummyChunk = {
    document_id,
    user_id,
    chunk_text: "This is a test chunk of text.",
    embedding: Array(1536).fill(0), // dummy embedding
  };

  // ✅ Step 3: Insert into document_chunks
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

// Run script
testInsert();
