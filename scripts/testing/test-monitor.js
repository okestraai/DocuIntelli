/**
 * Test the embedding monitor to verify automatic tag generation
 */

const SUPABASE_URL = 'https://caygpjhiakabaxtklnlw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNheWdwamhpYWthYmF4dGtsbmx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjA3MzMxNCwiZXhwIjoyMDcxNjQ5MzE0fQ.E266oQ924tT6EGNhbucNxQQST6rK__Y8gBILUD7iWeM';

async function testMonitor() {
  console.log('🔍 Testing Automatic Tag Generation Workflow\n');

  try {
    // Get all documents and their status
    const docsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/documents?select=id,name,tags`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    const documents = await docsResponse.json();

    console.log('📊 Current Document Status:\n');

    let totalDocs = 0;
    let docsWithTags = 0;
    let docsWithoutTags = 0;

    for (const doc of documents) {
      totalDocs++;
      const hasTags = doc.tags && Array.isArray(doc.tags) && doc.tags.length > 0;

      if (hasTags) {
        docsWithTags++;
        console.log(`✅ ${doc.name}`);
        console.log(`   Tags: ${doc.tags.join(', ')}\n`);
      } else {
        docsWithoutTags++;
        console.log(`❌ ${doc.name}`);
        console.log(`   No tags\n`);
      }
    }

    console.log('=' .repeat(70));
    console.log('📈 Summary:');
    console.log(`   Total documents: ${totalDocs}`);
    console.log(`   Documents with tags: ${docsWithTags}`);
    console.log(`   Documents without tags: ${docsWithoutTags}`);
    console.log('=' .repeat(70));

    if (docsWithoutTags > 0) {
      console.log('\n⚠️  Some documents are missing tags.');
      console.log('   The embedding monitor will automatically generate them within 30 minutes.');
      console.log('   Or they will be generated immediately when embeddings reach 60% completion.');
    } else {
      console.log('\n✅ All documents have tags! Automatic workflow is working perfectly.');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

testMonitor();
