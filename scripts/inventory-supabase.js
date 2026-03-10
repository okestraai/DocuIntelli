const SUPABASE_URL = 'https://caygpjhiakabaxtklnlw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNheWdwamhpYWthYmF4dGtsbmx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjA3MzMxNCwiZXhwIjoyMDcxNjQ5MzE0fQ.E266oQ924tT6EGNhbucNxQQST6rK__Y8gBILUD7iWeM';

const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function count(table) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`;
    const res = await fetch(url, { headers: { ...headers, Prefer: 'count=exact' }, signal: AbortSignal.timeout(10000) });
    const ct = res.headers.get('content-range');
    return ct ? ct.split('/')[1] : '0';
  } catch { return '?'; }
}

(async () => {
  const tables = [
    'documents', 'document_chunks', 'document_chats', 'user_subscriptions', 'user_profiles',
    'notification_logs', 'usage_logs', 'plaid_items', 'plaid_accounts', 'plaid_transactions',
    'financial_insights', 'financial_goals', 'financial_goal_accounts', 'financial_goal_activities',
    'life_events', 'life_event_requirement_status', 'life_event_requirement_matches',
    'review_events', 'gap_dismissals', 'preparedness_snapshots',
    'user_devices', 'global_chats', 'in_app_notifications',
    'payment_methods', 'invoices', 'transactions',
    'stripe_customers', 'stripe_subscriptions', 'stripe_orders',
    'signup_otps', 'limit_violations', 'dunning_log', 'admin_audit_log',
    'detected_loans', 'loan_analyses', 'plaid_link_tokens',
    'document_files', 'document_relationships', 'doc_classifications'
  ];

  console.log('=== Supabase Data Inventory ===\n');

  // Run all counts in parallel
  const results = await Promise.all(tables.map(async t => ({ table: t, count: await count(t) })));
  const nonEmpty = [];
  for (const r of results) {
    const num = parseInt(r.count) || 0;
    if (num > 0) {
      console.log(`  ${r.table}: ${r.count} rows`);
      nonEmpty.push(r);
    }
  }
  console.log(`\n  (${results.length - nonEmpty.length} tables with 0 rows omitted)`);

  // Auth users (parallel with table counts)
  console.log('\n--- Auth Users ---');
  try {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=100`, {
      headers, signal: AbortSignal.timeout(10000)
    });
    const authData = await authRes.json();
    const users = authData.users || [];
    console.log(`  Total: ${users.length}`);
    users.forEach(u => {
      const meta = u.user_metadata || {};
      console.log(`    ${u.email} | id=${u.id} | provider=${u.app_metadata?.provider || 'email'} | confirmed=${!!u.email_confirmed_at} | name=${meta.full_name || meta.display_name || '-'}`);
    });
  } catch (e) { console.log('  Error:', e.message); }

  // Storage
  console.log('\n--- Storage ---');
  try {
    const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/documents`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit: 1000, offset: 0 }),
      signal: AbortSignal.timeout(10000)
    });
    if (listRes.ok) {
      const items = await listRes.json();
      const folders = items.filter(i => i.id === null);
      const files = items.filter(i => i.id !== null);
      console.log(`  Root folders: ${folders.length}, Root files: ${files.length}`);

      // List each folder's contents in parallel
      const folderResults = await Promise.all(folders.map(async folder => {
        try {
          const subRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/documents`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix: folder.name + '/', limit: 1000, offset: 0 }),
            signal: AbortSignal.timeout(10000)
          });
          if (subRes.ok) {
            const subItems = await subRes.json();
            return { folder: folder.name, files: subItems.filter(s => s.id !== null) };
          }
        } catch {}
        return { folder: folder.name, files: [] };
      }));

      let totalFiles = files.length;
      for (const fr of folderResults) {
        totalFiles += fr.files.length;
        if (fr.files.length > 0) {
          console.log(`  ${fr.folder}/: ${fr.files.length} files`);
          fr.files.forEach(f => {
            const size = f.metadata ? `${(f.metadata.size / 1024).toFixed(1)}KB` : '?';
            console.log(`    ${f.name} (${size}, ${f.metadata?.mimetype || '?'})`);
          });
        }
      }
      console.log(`\n  Total files: ${totalFiles}`);
    }
  } catch (e) { console.log('  Error:', e.message); }
})();
