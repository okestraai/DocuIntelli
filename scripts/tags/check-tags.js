/**
 * Check document tags status
 */

const SUPABASE_URL = 'https://caygpjhiakabaxtklnlw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNheWdwamhpYWthYmF4dGtsbmx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjA3MzMxNCwiZXhwIjoyMDcxNjQ5MzE0fQ.E266oQ924tT6EGNhbucNxQQST6rK__Y8gBILUD7iWeM';

async function checkTags() {
  console.log('🏷️  Checking document tags...\n');

  try {
    // Get all documents with their tags
    const docsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/documents?select=id,name,category,tags`,
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
    console.log(`📊 Found ${documents.length} documents\n`);

    for (const doc of documents) {
      console.log(`📄 ${doc.name}`);
      console.log(`   ID: ${doc.id}`);
      console.log(`   Category: ${doc.category}`);

      if (doc.tags && Array.isArray(doc.tags) && doc.tags.length > 0) {
        console.log(`   ✅ Tags: ${doc.tags.join(', ')}`);
      } else {
        console.log(`   ❌ No tags`);
      }
      console.log();
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkTags();
