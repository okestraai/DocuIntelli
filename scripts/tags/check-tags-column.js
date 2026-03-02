// Check if tags column exists and get document data
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🏷️  Checking Tags Column\n');
console.log('='.repeat(70));

(async () => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try to query documents with tags column
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, name, tags, category, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42703') {
        console.log('❌ Tags column does not exist in documents table');
        console.log('');
        console.log('Migration needed:');
        console.log('  File: supabase/migrations/20251125225906_add_tags_to_documents.sql');
        console.log('');
        console.log('Apply this migration in Supabase SQL Editor');
      } else {
        console.error('❌ Error:', error);
      }
      process.exit(1);
    }

    console.log(`📚 Total documents: ${documents.length}\n`);

    const withTags = documents.filter((d) => d.tags && d.tags.length > 0);
    const withoutTags = documents.filter((d) => !d.tags || d.tags.length === 0);

    console.log(`✅ Documents with tags: ${withTags.length}`);
    console.log(`⚠️  Documents without tags: ${withoutTags.length}\n`);

    if (withTags.length > 0) {
      console.log('Documents with tags:');
      withTags.forEach((doc) => {
        console.log(`  📄 ${doc.name}`);
        console.log(`     Tags: ${doc.tags.join(', ')}`);
      });
      console.log('');
    }

    if (withoutTags.length > 0) {
      console.log('Documents without tags:');
      withoutTags.forEach((doc) => {
        console.log(`  📄 ${doc.name} (ID: ${doc.id.substring(0, 8)}...)`);
      });
      console.log('');
    }

    if (withoutTags.length > 0) {
      console.log('='.repeat(70));
      console.log('🔄 Tag generation service needed');
      console.log('='.repeat(70));
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
