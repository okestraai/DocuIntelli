// Clear stale Stripe data from database
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function clearStripeData() {
  console.log('🧹 Clearing stale Stripe data...');

  try {
    // Delete all Stripe customers
    const { error: deleteCustomersError } = await supabase
      .from('stripe_customers')
      .delete()
      .neq('customer_id', '');

    if (deleteCustomersError) {
      console.error('❌ Error deleting stripe_customers:', deleteCustomersError);
    } else {
      console.log('✅ Cleared stripe_customers table');
    }

    // Delete all Stripe subscriptions
    const { error: deleteSubscriptionsError } = await supabase
      .from('stripe_subscriptions')
      .delete()
      .neq('customer_id', '');

    if (deleteSubscriptionsError) {
      console.error('❌ Error deleting stripe_subscriptions:', deleteSubscriptionsError);
    } else {
      console.log('✅ Cleared stripe_subscriptions table');
    }

    // Reset user_subscriptions to free plan
    const { error: resetSubscriptionsError } = await supabase
      .from('user_subscriptions')
      .update({
        plan: 'free',
        status: 'active',
        document_limit: 5,
        ai_questions_limit: 10,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        stripe_price_id: null,
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
      })
      .not('user_id', 'is', null);

    if (resetSubscriptionsError) {
      console.error('❌ Error resetting user_subscriptions:', resetSubscriptionsError);
    } else {
      console.log('✅ Reset user_subscriptions to free plan');
    }

    console.log('\n🎉 Database cleared successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Refresh your app at http://localhost:5176');
    console.log('2. Log out and log back in');
    console.log('3. Try the upgrade flow again');

  } catch (error) {
    console.error('❌ Error clearing database:', error);
  }
}

clearStripeData();
