/**
 * Seed script: Inserts realistic dummy data for the Engagement Engine.
 *
 * Run:
 *   npx tsx scripts/seed-engagement-data.ts
 *
 * Prerequisites:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env (root or server/)
 *   - The engagement engine migration has been applied
 *   - At least one user exists in auth.users
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../server/.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================================================
// Helpers
// ============================================================================

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0]; // date only
}

function daysAgo(days: number): string {
  return daysFromNow(-days);
}

function timestampDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🌱 Seeding engagement engine dummy data...\n');

  // Get the first user
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError || !users?.users?.length) {
    console.error('❌ No users found. Sign up in the app first, then run this script.');
    process.exit(1);
  }

  const user = users.users[0];
  const userId = user.id;
  console.log(`👤 Using user: ${user.email} (${userId})\n`);

  // ----------------------------------------------------------
  // 1. Insert 12 documents across all categories & health states
  // ----------------------------------------------------------

  const documents = [
    // --- CRITICAL: Expired, missing metadata ---
    {
      name: 'Auto Insurance Policy - State Farm',
      category: 'insurance',
      type: 'application/pdf',
      size: 245000,
      file_path: `seed/${userId}/auto-insurance.pdf`,
      original_name: 'auto-insurance-2025.pdf',
      upload_date: daysAgo(200),
      expiration_date: daysAgo(15), // expired 15 days ago
      status: 'expired',
      processed: true,
      tags: ['auto', 'car', 'vehicle', 'liability'],
      issuer: 'State Farm',
      owner_name: null, // missing
      effective_date: daysAgo(380),
      review_cadence_days: 365,
      last_reviewed_at: timestampDaysAgo(400), // very overdue
      health_state: 'critical',
    },

    // --- CRITICAL: Expired lease, no review ---
    {
      name: 'Apartment Lease Agreement',
      category: 'lease',
      type: 'application/pdf',
      size: 520000,
      file_path: `seed/${userId}/apartment-lease.pdf`,
      original_name: 'lease-2024-2025.pdf',
      upload_date: daysAgo(365),
      expiration_date: daysAgo(30), // expired 30 days ago
      status: 'expired',
      processed: true,
      tags: ['apartment', 'rental', 'housing'],
      issuer: 'Greystar Properties',
      owner_name: 'John Smith',
      effective_date: daysAgo(395),
      review_cadence_days: 180,
      last_reviewed_at: timestampDaysAgo(200),
      health_state: 'critical',
    },

    // --- RISK: Expiring in 5 days, missing some metadata ---
    {
      name: 'Health Insurance - Blue Cross',
      category: 'insurance',
      type: 'application/pdf',
      size: 380000,
      file_path: `seed/${userId}/health-insurance.pdf`,
      original_name: 'health-insurance-bcbs.pdf',
      upload_date: daysAgo(350),
      expiration_date: daysFromNow(5), // expiring very soon!
      status: 'expiring',
      processed: true,
      tags: ['health', 'medical', 'dental'],
      issuer: 'Blue Cross Blue Shield',
      owner_name: null, // missing
      effective_date: daysAgo(360),
      review_cadence_days: null,
      last_reviewed_at: null,
      health_state: 'risk',
    },

    // --- WATCH: Expiring in 25 days ---
    {
      name: 'Employment Contract - TechCorp',
      category: 'employment',
      type: 'application/pdf',
      size: 156000,
      file_path: `seed/${userId}/employment-contract.pdf`,
      original_name: 'techcorp-contract-2025.pdf',
      upload_date: daysAgo(300),
      expiration_date: daysFromNow(25),
      status: 'expiring',
      processed: true,
      tags: ['employment', 'salary', 'benefits'],
      issuer: 'TechCorp Inc.',
      owner_name: 'John Smith',
      effective_date: daysAgo(330),
      review_cadence_days: 365,
      last_reviewed_at: timestampDaysAgo(100),
      health_state: 'watch',
    },

    // --- WATCH: Missing metadata, no expiration ---
    {
      name: 'Warranty - MacBook Pro',
      category: 'warranty',
      type: 'application/pdf',
      size: 98000,
      file_path: `seed/${userId}/macbook-warranty.pdf`,
      original_name: 'macbook-warranty.pdf',
      upload_date: daysAgo(120),
      expiration_date: null, // no expiration set
      status: 'active',
      processed: true,
      tags: null, // no tags
      issuer: null, // missing
      owner_name: null, // missing
      effective_date: null,
      review_cadence_days: null,
      last_reviewed_at: null,
      health_state: 'watch',
    },

    // --- HEALTHY: Well-maintained insurance ---
    {
      name: 'Homeowners Insurance - Allstate',
      category: 'insurance',
      type: 'application/pdf',
      size: 410000,
      file_path: `seed/${userId}/homeowners-insurance.pdf`,
      original_name: 'allstate-homeowners-2026.pdf',
      upload_date: daysAgo(60),
      expiration_date: daysFromNow(305),
      status: 'active',
      processed: true,
      tags: ['home', 'property', 'homeowner', 'coverage'],
      issuer: 'Allstate Insurance',
      owner_name: 'John Smith',
      effective_date: daysAgo(60),
      review_cadence_days: 365,
      last_reviewed_at: timestampDaysAgo(15),
      health_state: 'healthy',
    },

    // --- HEALTHY: Recent contract ---
    {
      name: 'Freelance Services Agreement',
      category: 'contract',
      type: 'application/pdf',
      size: 89000,
      file_path: `seed/${userId}/freelance-agreement.pdf`,
      original_name: 'freelance-agreement-2026.pdf',
      upload_date: daysAgo(30),
      expiration_date: daysFromNow(335),
      status: 'active',
      processed: true,
      tags: ['freelance', 'consulting', 'payment terms'],
      issuer: 'Acme Corp',
      owner_name: 'John Smith',
      effective_date: daysAgo(30),
      review_cadence_days: 180,
      last_reviewed_at: timestampDaysAgo(5),
      health_state: 'healthy',
    },

    // --- HEALTHY: Warranty with full metadata ---
    {
      name: 'Samsung TV Extended Warranty',
      category: 'warranty',
      type: 'application/pdf',
      size: 67000,
      file_path: `seed/${userId}/samsung-tv-warranty.pdf`,
      original_name: 'samsung-warranty-extended.pdf',
      upload_date: daysAgo(90),
      expiration_date: daysFromNow(640),
      status: 'active',
      processed: true,
      tags: ['electronics', 'tv', 'extended warranty'],
      issuer: 'Samsung Electronics',
      owner_name: 'John Smith',
      effective_date: daysAgo(90),
      review_cadence_days: 365,
      last_reviewed_at: timestampDaysAgo(30),
      health_state: 'healthy',
    },

    // --- WATCH: Vehicle registration (pairs with auto insurance) ---
    {
      name: 'Vehicle Registration - Honda Civic',
      category: 'other',
      type: 'application/pdf',
      size: 45000,
      file_path: `seed/${userId}/vehicle-registration.pdf`,
      original_name: 'dmv-registration-2026.pdf',
      upload_date: daysAgo(150),
      expiration_date: daysFromNow(60),
      status: 'active',
      processed: true,
      tags: ['vehicle', 'registration', 'dmv'],
      issuer: 'DMV',
      owner_name: 'John Smith',
      effective_date: daysAgo(150),
      review_cadence_days: null,
      last_reviewed_at: null,
      health_state: 'watch',
    },

    // --- RISK: Old contract, never reviewed, missing data ---
    {
      name: 'NDA - Previous Employer',
      category: 'contract',
      type: 'application/pdf',
      size: 34000,
      file_path: `seed/${userId}/nda-old-employer.pdf`,
      original_name: 'nda-signed-2023.pdf',
      upload_date: daysAgo(500),
      expiration_date: null, // no expiration
      status: 'active',
      processed: true,
      tags: null, // no tags
      issuer: null, // missing
      owner_name: null, // missing
      effective_date: null,
      review_cadence_days: null,
      last_reviewed_at: null,
      health_state: 'risk',
    },

    // --- HEALTHY: Recently uploaded lease ---
    {
      name: 'New Apartment Lease 2026',
      category: 'lease',
      type: 'application/pdf',
      size: 480000,
      file_path: `seed/${userId}/new-lease-2026.pdf`,
      original_name: 'lease-2026-2027.pdf',
      upload_date: daysAgo(10),
      expiration_date: daysFromNow(355),
      status: 'active',
      processed: true,
      tags: ['apartment', 'rental', 'new lease'],
      issuer: 'Avalon Bay Communities',
      owner_name: 'John Smith',
      effective_date: daysAgo(10),
      review_cadence_days: 180,
      last_reviewed_at: timestampDaysAgo(3),
      health_state: 'healthy',
    },

    // --- WATCH: Employment doc expiring in 45 days ---
    {
      name: 'Benefits Enrollment Summary',
      category: 'employment',
      type: 'application/pdf',
      size: 112000,
      file_path: `seed/${userId}/benefits-summary.pdf`,
      original_name: 'benefits-enrollment-2025.pdf',
      upload_date: daysAgo(250),
      expiration_date: daysFromNow(45),
      status: 'active',
      processed: true,
      tags: ['benefits', 'health', '401k', 'enrollment'],
      issuer: 'TechCorp HR',
      owner_name: 'John Smith',
      effective_date: daysAgo(250),
      review_cadence_days: 365,
      last_reviewed_at: timestampDaysAgo(180),
      health_state: 'watch',
    },
  ];

  console.log(`📄 Inserting ${documents.length} documents...`);

  const { data: insertedDocs, error: docError } = await supabase
    .from('documents')
    .insert(documents.map(d => ({ user_id: userId, ...d })))
    .select('id, name');

  if (docError) {
    console.error('❌ Failed to insert documents:', docError.message);
    process.exit(1);
  }

  console.log(`✅ Inserted ${insertedDocs.length} documents\n`);

  // Build name → id map
  const docMap = new Map<string, string>();
  for (const doc of insertedDocs) {
    docMap.set(doc.name, doc.id);
  }

  // ----------------------------------------------------------
  // 2. Insert review events (history)
  // ----------------------------------------------------------

  const reviewEvents = [
    {
      document_id: docMap.get('Homeowners Insurance - Allstate')!,
      action: 'reviewed',
      metadata: { note: 'Annual review - all good' },
      created_at: timestampDaysAgo(15),
    },
    {
      document_id: docMap.get('Homeowners Insurance - Allstate')!,
      action: 'confirmed_expiration',
      metadata: { confirmed_date: daysFromNow(305) },
      created_at: timestampDaysAgo(15),
    },
    {
      document_id: docMap.get('Freelance Services Agreement')!,
      action: 'reviewed',
      metadata: { note: 'Reviewed payment terms' },
      created_at: timestampDaysAgo(5),
    },
    {
      document_id: docMap.get('Samsung TV Extended Warranty')!,
      action: 'reviewed',
      metadata: {},
      created_at: timestampDaysAgo(30),
    },
    {
      document_id: docMap.get('New Apartment Lease 2026')!,
      action: 'reviewed',
      metadata: { note: 'Move-in complete, lease verified' },
      created_at: timestampDaysAgo(3),
    },
    {
      document_id: docMap.get('New Apartment Lease 2026')!,
      action: 'set_cadence',
      metadata: { cadence_days: 180 },
      created_at: timestampDaysAgo(3),
    },
    {
      document_id: docMap.get('Employment Contract - TechCorp')!,
      action: 'updated_metadata',
      metadata: { fields: ['issuer', 'owner_name'] },
      created_at: timestampDaysAgo(100),
    },
  ];

  console.log(`📝 Inserting ${reviewEvents.length} review events...`);

  const { error: revError } = await supabase
    .from('review_events')
    .insert(reviewEvents.map(e => ({ user_id: userId, ...e })));

  if (revError) {
    console.error('❌ Failed to insert review events:', revError.message);
  } else {
    console.log('✅ Review events inserted\n');
  }

  // ----------------------------------------------------------
  // 3. Insert gap dismissals (user dismissed 2 suggestions)
  // ----------------------------------------------------------

  const gapDismissals = [
    { suggestion_key: 'maintenance_records', source_category: 'insurance' },
    { suggestion_key: 'product_manual', source_category: 'warranty' },
  ];

  console.log(`🚫 Inserting ${gapDismissals.length} gap dismissals...`);

  const { error: gapError } = await supabase
    .from('gap_dismissals')
    .insert(gapDismissals.map(g => ({ user_id: userId, ...g })));

  if (gapError) {
    console.error('❌ Failed to insert gap dismissals:', gapError.message);
  } else {
    console.log('✅ Gap dismissals inserted\n');
  }

  // ----------------------------------------------------------
  // 4. Insert document relationships
  // ----------------------------------------------------------

  const autoInsuranceId = docMap.get('Auto Insurance Policy - State Farm');
  const vehicleRegId = docMap.get('Vehicle Registration - Honda Civic');
  const oldLeaseId = docMap.get('Apartment Lease Agreement');
  const newLeaseId = docMap.get('New Apartment Lease 2026');
  const employmentId = docMap.get('Employment Contract - TechCorp');
  const benefitsId = docMap.get('Benefits Enrollment Summary');

  const relationships = [
    {
      source_document_id: autoInsuranceId!,
      related_document_id: vehicleRegId!,
      relationship_type: 'related',
    },
    {
      source_document_id: newLeaseId!,
      related_document_id: oldLeaseId!,
      relationship_type: 'supersedes',
    },
    {
      source_document_id: employmentId!,
      related_document_id: benefitsId!,
      relationship_type: 'supplements',
    },
  ];

  console.log(`🔗 Inserting ${relationships.length} document relationships...`);

  const { error: relError } = await supabase
    .from('document_relationships')
    .insert(relationships.map(r => ({ user_id: userId, ...r })));

  if (relError) {
    console.error('❌ Failed to insert relationships:', relError.message);
  } else {
    console.log('✅ Document relationships inserted\n');
  }

  // ----------------------------------------------------------
  // 5. Insert preparedness snapshot (for trend comparison)
  // ----------------------------------------------------------

  const lastWeekDate = new Date();
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);

  const snapshot = {
    user_id: userId,
    score: 52, // slightly lower than current expected, so trend shows "up"
    factors: {
      metadataCompleteness: 14,
      expirationCoverage: 15,
      reviewFreshness: 12,
      healthDistribution: 11,
    },
    snapshot_date: lastWeekDate.toISOString().split('T')[0],
  };

  console.log('📊 Inserting preparedness snapshot...');

  const { error: snapError } = await supabase
    .from('preparedness_snapshots')
    .insert(snapshot);

  if (snapError) {
    console.error('❌ Failed to insert snapshot:', snapError.message);
  } else {
    console.log('✅ Preparedness snapshot inserted\n');
  }

  // ----------------------------------------------------------
  // Summary
  // ----------------------------------------------------------

  console.log('='.repeat(55));
  console.log('🎉 Seed data inserted successfully!\n');
  console.log('Documents by health state:');
  console.log('  🟢 Healthy (4): Homeowners Insurance, Freelance Agreement,');
  console.log('                   Samsung Warranty, New Lease 2026');
  console.log('  🟡 Watch   (4): Employment Contract, MacBook Warranty,');
  console.log('                   Vehicle Registration, Benefits Summary');
  console.log('  🟠 Risk    (2): Health Insurance (expiring in 5d), NDA');
  console.log('  🔴 Critical(2): Auto Insurance (expired), Old Lease (expired)');
  console.log('');
  console.log('What to test:');
  console.log('  1. Dashboard → TodayFeed shows preparedness score, health overview, action items');
  console.log('  2. Header → Click "Audit" for the Weekly Vault Audit view');
  console.log('  3. Vault → View any document → Health panel sidebar shows on right');
  console.log('  4. Try micro-actions: "Mark Reviewed", "Add Details", "Set Schedule"');
  console.log('  5. Gap suggestions: Should suggest renter insurance, vehicle title, etc.');
  console.log('');
  console.log('Preparedness trend: Last week snapshot = 52, current should be higher → "Improving"');
}

main().catch(err => {
  console.error('❌ Seed script failed:', err);
  process.exit(1);
});
