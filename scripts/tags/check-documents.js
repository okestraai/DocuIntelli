/**
 * Check documents and their embedding status
 */

const SUPABASE_URL = 'https://caygpjhiakabaxtklnlw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNheWdwamhpYWthYmF4dGtsbmx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjA3MzMxNCwiZXhwIjoyMDcxNjQ5MzE0fQ.E266oQ924tT6EGNhbucNxQQST6rK__Y8gBILUD7iWeM';

async function checkDocuments() {
  console.log('📊 Checking documents in database...\n');

  try {
    // Get all documents
    console.log('📋 Fetching all documents...');
    const docsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/documents?select=id,name,category,user_id`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!docsResponse.ok) {
      throw new Error(`Failed to fetch documents: ${docsResponse.status}`);
    }

    const documents = await docsResponse.json();
    console.log(`✅ Found ${documents.length} documents\n`);

    if (documents.length === 0) {
      console.log('⚠️  No documents in database');
      return;
    }

    // Check each document's chunks and embeddings
    for (const doc of documents) {
      console.log(`📄 Document: ${doc.name}`);
      console.log(`   ID: ${doc.id}`);
      console.log(`   Category: ${doc.category}`);
      console.log(`   User ID: ${doc.user_id}`);

      // Get chunk stats
      const chunksResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/document_chunks?select=id,embedding&document_id=eq.${doc.id}`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      );

      if (chunksResponse.ok) {
        const chunks = await chunksResponse.json();
        const withEmbeddings = chunks.filter(c => c.embedding !== null).length;
        console.log(`   Chunks: ${chunks.length} total, ${withEmbeddings} with embeddings`);
      }
      console.log();
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkDocuments();
