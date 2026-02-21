// Verify billing data in database
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyBillingData() {
  console.log('🔍 Verifying billing data in database...\n');

  // Check payment methods
  console.log('💳 Payment Methods:');
  const { data: paymentMethods, error: pmError } = await supabase
    .from('payment_methods')
    .select('*')
    .is('deleted_at', null);

  if (pmError) {
    console.error('Error:', pmError);
  } else {
    paymentMethods?.forEach(pm => {
      console.log(`   - ${pm.brand} •••• ${pm.last4} (expires ${pm.exp_month}/${pm.exp_year})`);
      console.log(`     Default: ${pm.is_default ? 'Yes' : 'No'}`);
    });
  }

  // Check invoices
  console.log('\n📄 Invoices:');
  const { data: invoices, error: invError } = await supabase
    .from('invoices')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (invError) {
    console.error('Error:', invError);
  } else {
    invoices?.forEach(inv => {
      const amount = (inv.total / 100).toFixed(2);
      console.log(`   - Invoice #${inv.invoice_number || inv.invoice_id.substring(0, 8)}`);
      console.log(`     Amount: $${amount} ${inv.currency.toUpperCase()}`);
      console.log(`     Status: ${inv.status}`);
      console.log(`     PDF: ${inv.invoice_pdf ? 'Available' : 'N/A'}`);
    });
  }

  // Check transactions
  console.log('\n💰 Transactions:');
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (txError) {
    console.error('Error:', txError);
  } else {
    transactions?.forEach(tx => {
      const amount = (tx.amount / 100).toFixed(2);
      console.log(`   - Transaction ${tx.transaction_id.substring(0, 8)}`);
      console.log(`     Amount: $${amount} ${tx.currency.toUpperCase()}`);
      console.log(`     Status: ${tx.status}`);
      console.log(`     Method: ${tx.payment_method_brand || 'N/A'} ${tx.payment_method_last4 ? '•••• ' + tx.payment_method_last4 : ''}`);
    });
  }

  console.log('\n✅ Verification complete!');
}

verifyBillingData();
