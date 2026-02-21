// Verify all documents have chunks
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('📊 Verifying Document Chunks\n');
console.log('='.repeat(70));

(async () => {
  // Get all documents
  const { data: docs, error: docsError } = await supabase
    .from('documents')
    .select('id, name, source_type, processed')
    .order('created_at', { ascending: false });

  if (docsError) {
    console.error('Error:', docsError.message);
    return;
  }

  console.log(`\n📄 Total Documents: ${docs.length}\n`);

  for (const doc of docs) {
    const { count, error } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', doc.id);

    const chunkCount = count || 0;
    const status = chunkCount > 0 ? '✅' : '❌';
    const sourceLabel = doc.source_type === 'url' ? '[URL]' : '[FILE]';

    console.log(`${status} ${sourceLabel} ${doc.name}`);
    console.log(`   Chunks: ${chunkCount} | Processed: ${doc.processed ? 'Yes' : 'No'}`);
  }

  console.log('\n' + '='.repeat(70));

  // Summary
  const { count: totalChunks } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true });

  const { count: processedDocs } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('processed', true);

  console.log('📊 Summary:');
  console.log(`   Total documents: ${docs.length}`);
  console.log(`   Processed documents: ${processedDocs}`);
  console.log(`   Total chunks: ${totalChunks}`);
  console.log(`   Average chunks per doc: ${(totalChunks / docs.length).toFixed(1)}`);
  console.log('='.repeat(70));

  if (docs.length === processedDocs && totalChunks > 0) {
    console.log('\n✅ SUCCESS: All documents are processed and chunked!');
  } else {
    console.log('\n⚠️  Some documents may need processing');
  }
})();
