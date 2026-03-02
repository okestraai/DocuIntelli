// Check document tags and identify documents without tags
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🏷️  Checking Document Tags\n');
console.log('='.repeat(70));

(async () => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, title, tags, created_at, url')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error:', error);
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
        console.log(`  📄 ${doc.title || doc.url || doc.id}`);
        console.log(`     Tags: ${doc.tags.join(', ')}`);
      });
      console.log('');
    }

    if (withoutTags.length > 0) {
      console.log('⚠️  Documents without tags:');
      withoutTags.forEach((doc) => {
        console.log(`  📄 ${doc.title || doc.url || doc.id}`);
        console.log(`     ID: ${doc.id}`);
      });
      console.log('');
      console.log('='.repeat(70));
      console.log('🔄 These documents need tags generated');
      console.log('='.repeat(70));
    } else {
      console.log('✅ All documents have tags!');
      console.log('='.repeat(70));
    }

    process.exit(withoutTags.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
