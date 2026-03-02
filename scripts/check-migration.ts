import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sb = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function check() {
  const r1 = await sb.from('documents').select('id, last_reviewed_at, health_state, issuer, owner_name').limit(1);
  console.log('documents engagement cols:', r1.error ? 'MISSING - ' + r1.error.message : 'OK');
  const r2 = await sb.from('review_events').select('id').limit(1);
  console.log('review_events table:', r2.error ? 'MISSING - ' + r2.error.message : 'OK');
  const r3 = await sb.from('gap_dismissals').select('id').limit(1);
  console.log('gap_dismissals table:', r3.error ? 'MISSING - ' + r3.error.message : 'OK');
  const r4 = await sb.from('document_relationships').select('id').limit(1);
  console.log('document_relationships table:', r4.error ? 'MISSING - ' + r4.error.message : 'OK');
  const r5 = await sb.from('preparedness_snapshots').select('id').limit(1);
  console.log('preparedness_snapshots table:', r5.error ? 'MISSING - ' + r5.error.message : 'OK');

  const allOk = !r1.error && !r2.error && !r3.error && !r4.error && !r5.error;
  console.log(allOk ? '\n✅ Migration verified!' : '\n❌ Some tables/columns missing');
}
check();
