# 💳 Billing Settings - Complete Implementation Guide

## 📋 Overview

A comprehensive billing management system has been implemented with the following features:

### ✅ What's Included

1. **Billing Page with 5 Sub-tabs**:
   - 📊 Overview - Current plan status and quick actions
   - ⚙️ Manage Subscription - Upgrade/downgrade plans
   - 💳 Payment Method - Manage payment instruments
   - 📄 Transactions & Invoices - Payment history and invoices
   - 📈 Usage - Document and AI usage tracking

2. **Database Schema**:
   - `payment_methods` - Store customer payment methods from Stripe
   - `invoices` - Store invoices with PDF links
   - `transactions` - Complete payment transaction history

3. **Stripe Sync System**:
   - Automatic sync on webhook events
   - Manual sync capability
   - Real-time billing data updates

4. **UI Components**:
   - Fully responsive design
   - Follows existing design system
   - Reuses existing components (cards, badges, tables, modals)

---

## 🚀 Deployment Steps

### Step 1: Deploy Database Migration

Run the billing data schema migration:

```bash
# Apply the migration
supabase db push

# Or manually run the SQL in Supabase SQL Editor:
# supabase/migrations/20260211200000_create_billing_data_schema.sql
```

This creates:
- `payment_methods` table
- `invoices` table
- `transactions` table
- RLS policies for security
- Indexes for performance

### Step 2: Deploy Edge Functions

Deploy the billing sync Edge Function:

```bash
# Deploy stripe-sync-billing function
supabase functions deploy stripe-sync-billing

# Verify the existing stripe-webhook function has the billing sync integration
supabase functions deploy stripe-webhook
```

### Step 3: Configure Stripe Webhook Events

In your Stripe Dashboard, ensure the webhook includes these events for billing data sync:

**Required Events**:
- `invoice.created`
- `invoice.finalized`
- `invoice.paid`
- `invoice.payment_failed`
- `charge.succeeded`
- `charge.failed`
- `charge.refunded`
- `payment_method.attached`
- `payment_method.detached`
- `customer.updated`

These are in addition to the existing subscription events.

### Step 4: Test the Implementation

1. **Start the app**:
   ```bash
   # Backend
   cd server && npm start

   # Frontend
   npm run dev
   ```

2. **Access Billing Page**:
   - Log in to your app
   - Click on your profile/account settings
   - Navigate to the **Billing** tab

3. **Verify Data Sync**:
   - Complete a test subscription upgrade
   - Check that billing data appears in:
     - Payment Method tab
     - Transactions tab
     - Usage tab

---

## 📊 Database Tables

### payment_methods

Stores customer payment methods (cards) from Stripe.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `user_id` | uuid | References auth.users |
| `payment_method_id` | text | Stripe payment method ID |
| `customer_id` | text | Stripe customer ID |
| `brand` | text | Card brand (visa, mastercard, etc.) |
| `last4` | text | Last 4 digits |
| `exp_month` | integer | Expiration month |
| `exp_year` | integer | Expiration year |
| `is_default` | boolean | Default payment method |
| `created_at` | timestamptz | Creation timestamp |
| `deleted_at` | timestamptz | Soft delete timestamp |

### invoices

Stores Stripe invoices with download links.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `user_id` | uuid | References auth.users |
| `invoice_id` | text | Stripe invoice ID |
| `invoice_number` | text | Human-readable invoice number |
| `status` | text | paid, open, void, uncollectible |
| `total` | bigint | Total amount in cents |
| `subtotal` | bigint | Subtotal before tax |
| `tax` | bigint | Tax amount |
| `currency` | text | Currency code (usd) |
| `invoice_pdf` | text | PDF download URL |
| `hosted_invoice_url` | text | Stripe hosted invoice page |
| `paid_at` | timestamptz | Payment timestamp |
| `created_at` | timestamptz | Creation timestamp |

### transactions

Stores payment transactions (charges).

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `user_id` | uuid | References auth.users |
| `transaction_id` | text | Stripe charge ID |
| `charge_id` | text | Charge ID |
| `payment_intent_id` | text | Payment intent ID |
| `amount` | bigint | Amount in cents |
| `currency` | text | Currency code |
| `status` | text | succeeded, pending, failed |
| `description` | text | Transaction description |
| `receipt_url` | text | Receipt URL |
| `payment_method_brand` | text | Card brand |
| `payment_method_last4` | text | Last 4 digits |
| `refunded` | boolean | Refund status |
| `created_at` | timestamptz | Creation timestamp |

---

## 🔄 How Billing Sync Works

### Automatic Sync (via Webhooks)

1. **User Action**: User subscribes, updates payment method, or receives invoice
2. **Stripe Event**: Stripe sends webhook event to your endpoint
3. **Webhook Handler**: `stripe-webhook` Edge Function processes event
4. **Billing Sync**: After subscription sync, calls `stripe-sync-billing` function
5. **Data Population**: Billing data synced to `payment_methods`, `invoices`, `transactions` tables
6. **UI Update**: User sees updated billing data in real-time

### Manual Sync (via API)

You can also manually trigger a billing data sync:

```typescript
import { syncBillingData } from '../lib/api';

// Trigger manual sync
const result = await syncBillingData();
if (result.success) {
  console.log('Billing data synced successfully');
}
```

This is useful for:
- Initial data population
- Recovering from sync failures
- Refreshing stale data

---

## 🎨 UI Components

### Billing Page Structure

```
ProfileModal
  └─ Billing Tab
      ├─ Overview
      │   ├─ Current Plan Card
      │   ├─ Status Badge
      │   ├─ Renewal Date
      │   ├─ Payment Method
      │   └─ Quick Actions
      │
      ├─ Manage Subscription
      │   ├─ Current Plan Highlight
      │   └─ Available Plans Grid
      │
      ├─ Payment Method
      │   ├─ Default Payment Method
      │   └─ Other Payment Methods
      │
      ├─ Transactions & Invoices
      │   ├─ Invoices Table
      │   │   └─ View/Download Actions
      │   └─ Transactions Table
      │
      └─ Usage
          ├─ Documents Usage Bar
          ├─ AI Questions Usage Bar
          └─ Upgrade Recommendation
```

### Design System Compliance

✅ **Colors**: Uses emerald/teal gradients matching existing theme
✅ **Typography**: Follows existing font sizes and weights
✅ **Components**: Reuses existing cards, badges, tables, buttons
✅ **Icons**: Uses lucide-react icons consistent with app
✅ **Spacing**: Follows Tailwind spacing scale
✅ **Responsive**: Mobile-first responsive design

---

## 🔐 Security

### Row Level Security (RLS)

All billing tables have RLS enabled:

```sql
-- Users can only view their own billing data
CREATE POLICY "Users can view own payment methods"
  ON payment_methods FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

-- Service role can manage all data (for webhooks)
CREATE POLICY "Service role can manage payment methods"
  ON payment_methods FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
```

### Data Protection

- ✅ Never store full credit card numbers
- ✅ Only store last 4 digits and brand
- ✅ Payment processing handled by Stripe
- ✅ Sensitive data encrypted in transit and at rest
- ✅ Soft deletes for audit trail

---

## 📱 User Experience

### Overview Tab
- **Purpose**: Quick snapshot of billing status
- **Shows**: Current plan, status badge, renewal date, payment method
- **Actions**: Upgrade, manage subscription, update payment

### Manage Subscription Tab
- **Purpose**: Change subscription plan
- **Shows**: Current plan highlighted, available plans
- **Actions**: Upgrade/downgrade via Stripe Customer Portal

### Payment Method Tab
- **Purpose**: Manage payment instruments
- **Shows**: Default payment method, other methods
- **Actions**: Update card, set default, remove (via Stripe)

### Transactions Tab
- **Purpose**: View payment history
- **Shows**: Invoices with download links, transaction history
- **Actions**: Download invoice PDF, view invoice details

### Usage Tab
- **Purpose**: Monitor plan usage
- **Shows**: Document usage vs limit, AI questions used
- **Features**: Progress bars, reset date, upgrade prompts

---

## 🧪 Testing Checklist

### Initial Setup
- [ ] Database migration applied successfully
- [ ] Edge functions deployed
- [ ] Webhook events configured in Stripe
- [ ] Billing tab appears in Profile modal

### Data Sync
- [ ] Complete a test subscription
- [ ] Verify payment method appears in Payment Method tab
- [ ] Check invoice appears in Transactions tab
- [ ] Confirm transaction recorded

### UI Testing
- [ ] All tabs render without errors
- [ ] Loading states display correctly
- [ ] Empty states show when no data
- [ ] Tables display data properly
- [ ] Buttons and actions work

### Subscription Flow
- [ ] Upgrade plan works
- [ ] Customer Portal opens correctly
- [ ] Cancel subscription works
- [ ] Reactivate subscription works

### Edge Cases
- [ ] Free plan user (no billing data)
- [ ] Multiple payment methods
- [ ] Failed payments
- [ ] Canceled subscriptions
- [ ] Past due status

---

## 🐛 Troubleshooting

### No billing data showing

**Check**:
1. User has a Stripe customer ID: Query `stripe_customers` table
2. Billing sync function is deployed
3. Webhook is receiving events
4. Edge function logs for errors

**Solution**: Manually trigger sync:
```typescript
import { syncBillingData } from '../lib/api';
await syncBillingData();
```

### Payment methods not updating

**Check**:
1. Webhook includes `payment_method.attached` event
2. Edge function has permission to write to `payment_methods` table
3. Customer ID matches

**Solution**: Redeploy webhook function and verify events

### Invoices not appearing

**Check**:
1. Webhook includes invoice events
2. Invoices exist in Stripe Dashboard
3. `invoices` table has RLS policies

**Solution**: Check Supabase logs for sync errors

### UI not loading

**Check**:
1. Browser console for errors
2. Network tab for failed API calls
3. TypeScript compilation errors

**Solution**: Restart dev server, clear browser cache

---

## 🚀 Production Checklist

Before going live:

- [ ] Switch Stripe to **Live Mode**
- [ ] Update Stripe keys to live keys (sk_live_...)
- [ ] Update webhook endpoint to production URL
- [ ] Test complete user journey
- [ ] Monitor webhook delivery in Stripe Dashboard
- [ ] Set up error monitoring for Edge Functions
- [ ] Configure backup/recovery for billing data
- [ ] Test customer portal customization
- [ ] Verify invoice branding matches your company

---

## 📚 Additional Resources

### Stripe Documentation
- [Billing Quickstart](https://docs.stripe.com/billing/quickstart)
- [Customer Portal](https://docs.stripe.com/billing/subscriptions/integrating-customer-portal)
- [Webhooks Best Practices](https://docs.stripe.com/webhooks/best-practices)
- [Invoice API](https://docs.stripe.com/api/invoices)

### Supabase Documentation
- [Edge Functions](https://supabase.com/docs/guides/functions)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Database Migrations](https://supabase.com/docs/guides/cli/local-development#database-migrations)

---

## 🎯 Summary

**Implemented**:
✅ Complete billing management UI with 5 sub-tabs
✅ Database schema for payment methods, invoices, transactions
✅ Automatic Stripe to DB sync via webhooks
✅ Manual sync capability
✅ Responsive design following existing patterns
✅ Comprehensive RLS policies
✅ Empty states and loading states
✅ Error handling and user feedback

**Ready for**:
- Production deployment
- User testing
- Data migration from existing Stripe data

**Next Steps**:
1. Deploy database migration
2. Deploy Edge Functions
3. Configure Stripe webhooks
4. Test end-to-end flow
5. Populate historical data (if needed)
6. Go live!

---

**Status**: ✅ **Implementation Complete - Ready for Deployment**
