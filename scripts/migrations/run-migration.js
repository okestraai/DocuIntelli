// Run the database migration to update to 4096 dimensions
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 Running Database Migration\n');
console.log('='.repeat(70));

(async () => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read the migration file
    const migrationSQL = readFileSync(
      'supabase/migrations/20260211000000_update_to_4096_dimensions.sql',
      'utf-8'
    );

    console.log('📄 Migration file loaded');
    console.log('🔄 Applying migration to database...\n');

    // Execute the migration
    // Note: Supabase JS client doesn't support running raw SQL directly
    // We'll provide instructions for manual execution

    console.log('⚠️  Migration SQL prepared. Please run it manually in Supabase SQL Editor:\n');
    console.log('1. Go to your Supabase dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy and paste the migration SQL from:');
    console.log('   supabase/migrations/20260211000000_update_to_4096_dimensions.sql');
    console.log('4. Click "Run" to execute\n');

    console.log('📋 Migration SQL Preview:');
    console.log('='.repeat(70));
    console.log(migrationSQL.substring(0, 500) + '...\n');
    console.log('='.repeat(70));

    // Check current embedding dimensions
    console.log('\n🔍 Checking current database state...');

    const { data: sampleChunk, error } = await supabase
      .from('document_chunks')
      .select('id, embedding')
      .not('embedding', 'is', null)
      .limit(1)
      .single();

    if (sampleChunk && sampleChunk.embedding) {
      console.log(`📊 Current embedding dimensions: ${sampleChunk.embedding.length}`);

      if (sampleChunk.embedding.length === 384) {
        console.log('⚠️  Database still using 384 dimensions - migration needed');
      } else if (sampleChunk.embedding.length === 4096) {
        console.log('✅ Database already updated to 4096 dimensions!');
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('📝 After running the migration:');
    console.log('   1. Existing 384-dim embeddings will be preserved but incompatible');
    console.log('   2. New embeddings will be 4096-dim from local API');
    console.log('   3. Run: node clear-old-embeddings.js (to reset all embeddings)');
    console.log('   4. Run: node process-all-embeddings-local.js (to regenerate)');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
})();
