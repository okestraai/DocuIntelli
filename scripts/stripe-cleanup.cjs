/**
 * Stripe Test Data Cleanup Script
 * Deletes all test data from Stripe sandbox for a clean slate.
 *
 * Usage: node scripts/stripe-cleanup.js
 */

require('dotenv').config();

const Stripe = require('../server/node_modules/stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Safety check — refuse to run against live keys
if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
  console.error('ABORT: This script only runs against test keys (sk_test_*). Exiting.');
  process.exit(1);
}

async function deleteAll(resource, label) {
  let deleted = 0;
  try {
    for await (const item of resource.list({ limit: 100 })) {
      try {
        await resource.del(item.id);
        deleted++;
      } catch (err) {
        // Some resources can't be deleted directly, skip them
        console.warn(`  Could not delete ${label} ${item.id}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`  Could not list ${label}: ${err.message}`);
  }
  console.log(`  ${label}: ${deleted} deleted`);
  return deleted;
}

async function cancelAllSubscriptions() {
  let canceled = 0;
  try {
    for await (const sub of stripe.subscriptions.list({ limit: 100, status: 'all' })) {
      if (['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status)) {
        try {
          await stripe.subscriptions.cancel(sub.id);
          canceled++;
        } catch (err) {
          console.warn(`  Could not cancel subscription ${sub.id}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.warn(`  Could not list subscriptions: ${err.message}`);
  }
  console.log(`  Subscriptions canceled: ${canceled}`);
  return canceled;
}

async function voidOpenInvoices() {
  let voided = 0;
  try {
    for await (const invoice of stripe.invoices.list({ limit: 100, status: 'open' })) {
      try {
        await stripe.invoices.voidInvoice(invoice.id);
        voided++;
      } catch (err) {
        console.warn(`  Could not void invoice ${invoice.id}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`  Could not list invoices: ${err.message}`);
  }
  console.log(`  Invoices voided: ${voided}`);
  return voided;
}

async function deactivatePrices() {
  let deactivated = 0;
  try {
    for await (const price of stripe.prices.list({ limit: 100, active: true })) {
      try {
        await stripe.prices.update(price.id, { active: false });
        deactivated++;
      } catch (err) {
        console.warn(`  Could not deactivate price ${price.id}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`  Could not list prices: ${err.message}`);
  }
  console.log(`  Prices deactivated: ${deactivated}`);
  return deactivated;
}

async function archiveProducts() {
  let archived = 0;
  try {
    for await (const product of stripe.products.list({ limit: 100, active: true })) {
      try {
        await stripe.products.update(product.id, { active: false });
        archived++;
      } catch (err) {
        console.warn(`  Could not archive product ${product.id}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`  Could not list products: ${err.message}`);
  }
  console.log(`  Products archived: ${archived}`);
  return archived;
}

async function main() {
  console.log('=== Stripe Test Data Cleanup ===\n');
  console.log(`Using key: ${process.env.STRIPE_SECRET_KEY.slice(0, 12)}...${process.env.STRIPE_SECRET_KEY.slice(-4)}\n`);

  // Order matters — cancel subs before deleting customers
  console.log('1. Canceling active subscriptions...');
  await cancelAllSubscriptions();

  console.log('2. Voiding open invoices...');
  await voidOpenInvoices();

  console.log('3. Deleting customers (also removes their payment methods, cards, sources)...');
  await deleteAll(stripe.customers, 'Customers');

  console.log('4. Deleting coupons...');
  await deleteAll(stripe.coupons, 'Coupons');

  console.log('5. Deactivating prices (cannot be deleted, only deactivated)...');
  await deactivatePrices();

  console.log('6. Archiving products (cannot be deleted, only archived)...');
  await archiveProducts();

  console.log('7. Deleting webhook endpoints...');
  await deleteAll(stripe.webhookEndpoints, 'Webhook endpoints');

  console.log('\n=== Cleanup complete! ===');
  console.log('Note: Payment intents, charges, and events cannot be deleted via API.');
  console.log('For a truly complete wipe, use: Dashboard → Developers → Test Data → "Delete all test data"');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
