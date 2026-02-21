import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

interface TagGenerationResult {
  success: boolean;
  tags?: string[];
  message?: string;
  progress?: string;
  error?: string;
}

/**
 * Generate tags for a specific document using Supabase Edge Function
 * @param documentId - The UUID of the document
 * @returns Tag generation result
 */
export async function generateDocumentTags(
  documentId: string
): Promise<TagGenerationResult> {
  try {
    console.log(`🏷️  Generating tags for document: ${documentId}`);

    const { data, error } = await supabase.functions.invoke('generate-tags', {
      body: { document_id: documentId },
    });

    if (error) {
      console.error(`❌ Error generating tags:`, error);
      return {
        success: false,
        error: error.message,
      };
    }

    if (data.success) {
      console.log(`✅ Tags generated:`, data.tags);
      return {
        success: true,
        tags: data.tags,
        message: data.message,
        progress: data.progress,
      };
    } else {
      console.log(`⏳ ${data.message}`);
      return {
        success: false,
        message: data.message,
        progress: data.progress,
      };
    }
  } catch (error: any) {
    console.error(`❌ Tag generation error:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Generate tags for all documents that don't have them
 * @returns Summary of tag generation results
 */
export async function generateAllDocumentTags(): Promise<{
  success: boolean;
  total: number;
  processed: number;
  tagged: number;
  skipped: number;
  errors: number;
  results: Array<{
    documentId: string;
    documentName: string;
    status: string;
    tags?: string[];
    message?: string;
  }>;
}> {
  try {
    console.log('🏷️  Starting tag generation for all documents...\n');

    // Get all documents without tags or with empty tags array
    const { data: documents, error: queryError } = await supabase
      .from('documents')
      .select('id, name, tags, category')
      .or('tags.is.null,tags.eq.{}');

    if (queryError) {
      console.error('❌ Error querying documents:', queryError);
      return {
        success: false,
        total: 0,
        processed: 0,
        tagged: 0,
        skipped: 0,
        errors: 1,
        results: [],
      };
    }

    const total = documents?.length || 0;
    console.log(`📚 Found ${total} documents without tags\n`);

    if (total === 0) {
      return {
        success: true,
        total: 0,
        processed: 0,
        tagged: 0,
        skipped: 0,
        errors: 0,
        results: [],
      };
    }

    let processed = 0;
    let tagged = 0;
    let skipped = 0;
    let errors = 0;
    const results: Array<{
      documentId: string;
      documentName: string;
      status: string;
      tags?: string[];
      message?: string;
    }> = [];

    for (const doc of documents!) {
      processed++;
      console.log(
        `[${processed}/${total}] Processing: ${doc.name} (${doc.id})`
      );

      const result = await generateDocumentTags(doc.id);

      if (result.success && result.tags) {
        tagged++;
        results.push({
          documentId: doc.id,
          documentName: doc.name,
          status: 'tagged',
          tags: result.tags,
        });
      } else if (result.message) {
        skipped++;
        results.push({
          documentId: doc.id,
          documentName: doc.name,
          status: 'skipped',
          message: result.message,
        });
      } else {
        errors++;
        results.push({
          documentId: doc.id,
          documentName: doc.name,
          status: 'error',
          message: result.error || 'Unknown error',
        });
      }

      // Small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log('\n' + '='.repeat(70));
    console.log('📊 Tag Generation Summary:');
    console.log(`   Total documents: ${total}`);
    console.log(`   Successfully tagged: ${tagged}`);
    console.log(`   Skipped (not enough embeddings): ${skipped}`);
    console.log(`   Errors: ${errors}`);
    console.log('='.repeat(70));

    return {
      success: true,
      total,
      processed,
      tagged,
      skipped,
      errors,
      results,
    };
  } catch (error: any) {
    console.error('❌ Error in tag generation:', error);
    return {
      success: false,
      total: 0,
      processed: 0,
      tagged: 0,
      skipped: 0,
      errors: 1,
      results: [],
    };
  }
}
