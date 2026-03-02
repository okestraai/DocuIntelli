// Test URL document processing and chunking
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔍 Testing URL Document Processing\n');
console.log('='.repeat(70));

// Check if Supabase Edge Functions are accessible
async function checkEdgeFunctions() {
  console.log('\n✓ Test 1: Check Edge Functions Accessibility');

  const functions = [
    'process-url-content',
    'process-document',
    'generate-embeddings'
  ];

  for (const funcName of functions) {
    try {
      const funcUrl = `${supabaseUrl}/functions/v1/${funcName}`;
      const response = await fetch(funcUrl, {
        method: 'OPTIONS',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      console.log(`  ${funcName}: ${response.status === 200 ? '✅ Accessible' : `⚠️  Status ${response.status}`}`);
    } catch (error) {
      console.log(`  ${funcName}: ❌ Not accessible - ${error.message}`);
    }
  }
}

// Find unprocessed URL documents
async function findUnprocessedDocs() {
  console.log('\n✓ Test 2: Find Unprocessed URL Documents');

  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, name, source_type, source_url, processed, created_at')
    .eq('source_type', 'url')
    .eq('processed', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return [];
  }

  if (!docs || docs.length === 0) {
    console.log('  ℹ️  No unprocessed URL documents found');
    return [];
  }

  console.log(`  📄 Found ${docs.length} unprocessed URL document(s):`);
  docs.forEach((doc, i) => {
    console.log(`     ${i + 1}. ${doc.name} (ID: ${doc.id})`);
    console.log(`        URL: ${doc.source_url}`);
    console.log(`        Created: ${new Date(doc.created_at).toLocaleString()}`);
  });

  return docs;
}

// Check if document has chunks
async function checkDocumentChunks(documentId) {
  const { data: chunks, count, error } = await supabase
    .from('document_chunks')
    .select('id, chunk_index, chunk_text', { count: 'exact' })
    .eq('document_id', documentId)
    .order('chunk_index');

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    count: count || 0,
    hasEmbeddings: chunks && chunks.length > 0
  };
}

// Manually trigger processing for a document
async function triggerProcessing(documentId) {
  console.log(`\n  🔄 Attempting to process document ${documentId}...`);

  try {
    const processUrl = `${supabaseUrl}/functions/v1/process-document`;
    const response = await fetch(processUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ document_id: documentId }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.log(`  ❌ Processing failed: ${result.error || response.statusText}`);
      if (result.details) {
        console.log(`     Details: ${result.details}`);
      }
      return { success: false, error: result.error };
    }

    console.log(`  ✅ Processing successful!`);
    console.log(`     Chunks created: ${result.data?.chunks_processed || 0}`);
    return { success: true, data: result.data };

  } catch (error) {
    console.log(`  ❌ Processing error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Main test sequence
(async () => {
  try {
    // Test 1: Check Edge Functions
    await checkEdgeFunctions();

    // Test 2: Find unprocessed docs
    const unprocessedDocs = await findUnprocessedDocs();

    // Test 3: Check chunks for unprocessed docs
    if (unprocessedDocs.length > 0) {
      console.log('\n✓ Test 3: Check Chunks for Unprocessed Documents');

      for (const doc of unprocessedDocs) {
        const chunkInfo = await checkDocumentChunks(doc.id);
        console.log(`  📄 ${doc.name}:`);
        console.log(`     Chunks: ${chunkInfo.count}`);
        console.log(`     Status: ${chunkInfo.count > 0 ? '✅ Has chunks' : '❌ No chunks'}`);
      }

      // Test 4: Try processing the first unprocessed document
      console.log('\n✓ Test 4: Trigger Processing for First Unprocessed Document');
      const firstDoc = unprocessedDocs[0];
      console.log(`  📄 Processing: ${firstDoc.name}`);

      const result = await triggerProcessing(firstDoc.id);

      if (result.success) {
        // Wait a moment and check chunks again
        await new Promise(resolve => setTimeout(resolve, 2000));

        const updatedChunkInfo = await checkDocumentChunks(firstDoc.id);
        console.log(`\n  📊 After Processing:`);
        console.log(`     Chunks created: ${updatedChunkInfo.count}`);
        console.log(`     Status: ${updatedChunkInfo.count > 0 ? '✅ SUCCESS' : '⚠️  Still no chunks'}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📋 Summary:');
    console.log('='.repeat(70));

    const { data: allDocs, count: totalDocs } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('source_type', 'url');

    const { data: processedDocs, count: processedCount } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('source_type', 'url')
      .eq('processed', true);

    const { count: urlChunks } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .in('document_id', (allDocs || []).map(d => d.id));

    console.log(`Total URL documents: ${totalDocs || 0}`);
    console.log(`Processed: ${processedCount || 0}`);
    console.log(`Unprocessed: ${(totalDocs || 0) - (processedCount || 0)}`);
    console.log(`Total chunks for URL docs: ${urlChunks || 0}`);
    console.log('='.repeat(70));

    if (unprocessedDocs.length > 0 && (urlChunks || 0) === 0) {
      console.log('\n⚠️  ISSUE DETECTED:');
      console.log('URL documents are being created but not chunked.');
      console.log('Possible causes:');
      console.log('1. Edge Functions not deployed to Supabase');
      console.log('2. Function invocation is failing silently');
      console.log('3. Missing environment variables in Supabase');
      console.log('\nRecommendation: Deploy Edge Functions using Supabase CLI');
    } else if (unprocessedDocs.length === 0) {
      console.log('\n✅ All URL documents are processed!');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
})();
