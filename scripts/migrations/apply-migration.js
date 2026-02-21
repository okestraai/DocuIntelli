// Apply the 4096-dimension migration to Supabase
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 Applying Database Migration\n');
console.log('='.repeat(70));

(async () => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read migration SQL
    const migrationSQL = readFileSync(
      'supabase/migrations/20260211000000_update_to_4096_dimensions.sql',
      'utf-8'
    );

    console.log('📄 Migration loaded');
    console.log('🔄 Executing SQL statements...\n');

    // Split into individual statements and execute
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('/*') && !s.startsWith('--'));

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`📝 Statement ${i + 1}/${statements.length}...`);

      try {
        // Use rpc to execute raw SQL (if available) or try direct query
        const { error } = await supabase.rpc('exec_sql', { sql_string: statement });

        if (error) {
          // If rpc doesn't exist, we need to use Supabase dashboard
          console.log(`⚠️  Cannot execute via API: ${error.message}`);
          console.log('   Please run migration manually in Supabase SQL Editor');
          break;
        }

        console.log('   ✅ Success');
      } catch (err) {
        console.log(`   ⚠️  ${err.message}`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('⚠️  Note: Supabase JS Client cannot execute raw DDL statements');
    console.log('Please apply migration manually in Supabase dashboard:');
    console.log('1. Go to Supabase SQL Editor');
    console.log('2. Copy migration from: supabase/migrations/20260211000000_update_to_4096_dimensions.sql');
    console.log('3. Paste and click Run');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
})();
