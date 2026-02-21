/**
 * Trigger tag generation for test terms document
 */

const SUPABASE_URL = 'https://caygpjhiakabaxtklnlw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNheWdwamhpYWthYmF4dGtsbmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNzMzMTQsImV4cCI6MjA3MTY0OTMxNH0.UYaF1hW_j2HGcFP5W1FMV_G7ODGJuz8qieyf9Qe4Z90';

async function generateTags() {
  console.log('🏷️  Generating tags for "test terms" document...\n');

  try {
    const documentId = '8b875672-53b1-41f5-b486-1183eeb429dc';

    const startTime = Date.now();
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/generate-tags`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          document_id: documentId,
        }),
      }
    );

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tag generation failed (${response.status}): ${errorText}`);
    }

    const result = await response.json();

    console.log('✅ Tag Generation Complete!\n');
    console.log('📊 Response Details:');
    console.log(`   ⏱️  Response time: ${duration}ms`);
    console.log(`   ✅ Success: ${result.success}`);

    if (result.tags && result.tags.length > 0) {
      console.log(`   🏷️  Generated ${result.tags.length} tags:`);
      result.tags.forEach((tag, idx) => {
        console.log(`      ${idx + 1}. ${tag}`);
      });
    }

    if (result.message) {
      console.log(`   📝 Message: ${result.message}`);
    }

    if (result.progress) {
      console.log(`   📊 Embedding Progress: ${result.progress}%`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

generateTags();
