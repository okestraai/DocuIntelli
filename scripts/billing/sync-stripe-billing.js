// One-time script to sync existing Stripe billing data to database
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function syncAllCustomersBillingData() {
  console.log('🔄 Starting Stripe billing data sync...\n');

  try {
    // Get all Stripe customers from database
    const { data: customers, error: customersError } = await supabase
      .from('stripe_customers')
      .select('customer_id, user_id')
      .is('deleted_at', null);

    if (customersError) {
      console.error('❌ Error fetching customers:', customersError);
      return;
    }

    if (!customers || customers.length === 0) {
      console.log('ℹ️  No Stripe customers found in database');
      return;
    }

    console.log(`📊 Found ${customers.length} customer(s) to sync\n`);

    // Sync billing data for each customer
    for (const customer of customers) {
      console.log(`\n🔄 Syncing customer: ${customer.customer_id}`);

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/stripe-sync-billing`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            customer_id: customer.customer_id,
            user_id: customer.user_id,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log(`✅ Successfully synced customer ${customer.customer_id}`);
        } else {
          const error = await response.text();
          console.error(`❌ Failed to sync customer ${customer.customer_id}:`, error);
        }
      } catch (error) {
        console.error(`❌ Error syncing customer ${customer.customer_id}:`, error.message);
      }

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n\n✅ Billing data sync complete!');
    console.log('\n📋 Summary:');
    console.log(`   Total customers processed: ${customers.length}`);

    // Verify sync results
    console.log('\n🔍 Verifying sync results...\n');

    const { count: pmCount } = await supabase
      .from('payment_methods')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null);

    const { count: invCount } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null);

    const { count: txCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null);

    console.log(`   Payment Methods: ${pmCount || 0}`);
    console.log(`   Invoices: ${invCount || 0}`);
    console.log(`   Transactions: ${txCount || 0}`);

    console.log('\n✅ All done! You can now view billing data in the app.');

  } catch (error) {
    console.error('❌ Sync error:', error);
  }
}

// Run the sync
syncAllCustomersBillingData();
