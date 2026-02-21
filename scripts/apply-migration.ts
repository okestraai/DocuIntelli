/**
 * Applies the engagement engine migration SQL via Supabase HTTP API.
 * Run: npx tsx scripts/apply-migration.ts
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const projectRef = new URL(supabaseUrl!).hostname.split('.')[0];

async function runSQL(sql: string, label: string): Promise<boolean> {
  try {
    const resp = await fetch(`https://${projectRef}.supabase.co/pg/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey!,
      },
      body: JSON.stringify({ query: sql }),
    });

    if (resp.ok) {
      console.log(`  ✓ ${label}`);
      return true;
    }

    // Try alternate endpoint
    const resp2 = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey!,
      },
      body: JSON.stringify({ sql }),
    });

    if (resp2.ok) {
      console.log(`  ✓ ${label}`);
      return true;
    }

    const errorText = await resp.text();
    console.error(`  ✗ ${label}: ${errorText.slice(0, 200)}`);
    return false;
  } catch (err: any) {
    console.error(`  ✗ ${label}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log(`📦 Applying engagement engine migration to project: ${projectRef}\n`);

  const statements: [string, string][] = [
    [`ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz`, 'Add last_reviewed_at column'],
    [`ALTER TABLE documents ADD COLUMN IF NOT EXISTS review_cadence_days integer`, 'Add review_cadence_days column'],
    [`ALTER TABLE documents ADD COLUMN IF NOT EXISTS issuer text`, 'Add issuer column'],
    [`ALTER TABLE documents ADD COLUMN IF NOT EXISTS owner_name text`, 'Add owner_name column'],
    [`ALTER TABLE documents ADD COLUMN IF NOT EXISTS effective_date date`, 'Add effective_date column'],
    [`ALTER TABLE documents ADD COLUMN IF NOT EXISTS health_state text DEFAULT 'healthy'`, 'Add health_state column'],
    [`ALTER TABLE documents ADD COLUMN IF NOT EXISTS health_computed_at timestamptz`, 'Add health_computed_at column'],
    [`ALTER TABLE documents ADD COLUMN IF NOT EXISTS insights_cache jsonb`, 'Add insights_cache column'],
  ];

  const result = await runSQL(statements[0][0], statements[0][1]);

  if (!result) {
    console.log('\n⚠️  Cannot execute SQL programmatically. Please apply the migration manually:\n');
    console.log('Option 1: Supabase Dashboard SQL Editor');
    console.log(`  → Go to your Supabase dashboard → SQL Editor`);
    console.log(`  → Paste the contents of: supabase/migrations/20260212000000_engagement_engine.sql`);
    console.log(`  → Click "Run"\n`);
    console.log('Option 2: Link your project and push');
    console.log(`  npx supabase link --project-ref ${projectRef}`);
    console.log('  npx supabase db push\n');

    // Output the full SQL for easy copy
    const sqlPath = path.resolve(__dirname, '../supabase/migrations/20260212000000_engagement_engine.sql');
    const fullSql = fs.readFileSync(sqlPath, 'utf8');
    console.log('═'.repeat(60));
    console.log('Full migration SQL (copy to SQL Editor):');
    console.log('═'.repeat(60));
    console.log(fullSql);
    return;
  }

  // If first worked, run the rest
  for (let i = 1; i < statements.length; i++) {
    await runSQL(statements[i][0], statements[i][1]);
  }

  // Create tables
  const tablesSql = fs.readFileSync(
    path.resolve(__dirname, '../supabase/migrations/20260212000000_engagement_engine.sql'),
    'utf8'
  );

  // Extract CREATE TABLE and policy statements
  await runSQL(tablesSql, 'Full migration (tables + policies + indexes)');

  console.log('\n✅ Migration applied! Run seed script next:');
  console.log('  npx tsx scripts/seed-engagement-data.ts');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
