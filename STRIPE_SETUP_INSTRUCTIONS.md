# ✅ Stripe Setup Complete - Final Steps

## 🎉 What's Already Done

✅ **Frontend `.env` Updated** with:
- `VITE_STRIPE_PUBLISHABLE_KEY`
- `VITE_STRIPE_STARTER_PRICE_ID` → `price_1SzmJJC1d2bwLolG6IatDmAT` ($7/month)
- `VITE_STRIPE_PRO_PRICE_ID` → `price_1SzmGgC1d2bwLolGhBHMtuFZ` ($19/month)

✅ **Webhook Configured** at:
- `https://caygpjhiakabaxtklnlw.supabase.co/functions/v1/stripe-webhook`
- Signing Secret: `whsec_YOUR_WEBHOOK_SECRET_HERE`

---

## 📋 Remaining Steps

### 1. Set Supabase Edge Function Secrets

Since the Supabase CLI is not installed, you need to set these secrets through the **Supabase Dashboard**:

**Go to**: [Supabase Dashboard](https://supabase.com/dashboard/project/caygpjhiakabaxtklnlw/settings/vault/secrets) → Settings → Edge Functions → Secrets

**Add these 4 secrets**:

| Secret Name | Value |
|-------------|-------|
| `STRIPE_SECRET_KEY` | `sk_test_YOUR_STRIPE_SECRET_KEY_HERE` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_YOUR_WEBHOOK_SECRET_HERE` |
| `STRIPE_STARTER_PRICE_ID` | `price_1SzmJJC1d2bwLolG6IatDmAT` |
| `STRIPE_PRO_PRICE_ID` | `price_1SzmGgC1d2bwLolGhBHMtuFZ` |

**How to Add Secrets**:
1. Click **"New secret"**
2. Enter the name (e.g., `STRIPE_SECRET_KEY`)
3. Enter the value
4. Click **"Add secret"**
5. Repeat for all 4 secrets

---

### 2. Deploy Edge Functions

You can deploy through the Supabase Dashboard or install the Supabase CLI:

#### Option A: Install Supabase CLI (Recommended)
```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref caygpjhiakabaxtklnlw

# Deploy functions
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
supabase functions deploy stripe-customer-portal
```

#### Option B: Deploy via Dashboard
1. Go to [Edge Functions](https://supabase.com/dashboard/project/caygpjhiakabaxtklnlw/functions)
2. Click **"Create a new function"**
3. Upload each function folder:
   - `supabase/functions/stripe-checkout`
   - `supabase/functions/stripe-webhook`
   - `supabase/functions/stripe-customer-portal`

---

### 3. Configure Stripe Tax (Optional but Recommended)

1. Go to [Stripe Dashboard → Tax](https://dashboard.stripe.com/settings/tax)
2. **Enable Stripe Tax**
3. Set your **tax registration** (if applicable)
4. Configure **automatic tax calculation**

This enables the `automatic_tax: { enabled: true }` feature we added to checkout.

---

### 4. Configure Customer Portal

1. Go to [Stripe Dashboard → Customer Portal](https://dashboard.stripe.com/settings/billing/portal)
2. **Customize branding**:
   - Upload your logo
   - Set brand colors
3. **Configure features**:
   - ✅ Allow customers to update payment methods
   - ✅ Allow customers to cancel subscriptions
   - ✅ Show billing history
   - ✅ Allow downloading invoices

---

## 🧪 Test Your Setup

### 1. Start Your App
```bash
# Terminal 1: Start backend
cd server
npm start

# Terminal 2: Start frontend
npm run dev
```

### 2. Test Checkout Flow
1. Open your app: `http://localhost:5173`
2. Login/Sign up
3. Click **"Upgrade to Starter"**
4. Use test card: **4242 4242 4242 4242**
   - Any future expiry date
   - Any CVC
   - Any ZIP code
5. Complete checkout
6. You should see: **"Subscription Activated! 🎉"**

### 3. Verify Subscription
- Check your **Dashboard** shows:
  - Plan: **Starter**
  - Documents: **X / 25**
  - AI Questions: **X / ∞** (unlimited)

### 4. Test Customer Portal
1. As a paid user, click **"Manage Subscription"**
2. You'll be redirected to Stripe Customer Portal
3. Try updating payment method
4. Click **"Return to [Your App]"**
5. You should see: **"Subscription Updated"**

---

## 🔍 Verify Webhook

After a successful checkout, check:

1. **Stripe Dashboard** → Webhooks → Your endpoint
2. View **recent events**
3. Look for `checkout.session.completed`
4. Status should be: **Succeeded ✅**

---

## 📊 Database Verification

Run this query in **Supabase SQL Editor**:

```sql
-- Check subscription was created
SELECT
  u.email,
  s.plan,
  s.status,
  s.document_limit,
  s.ai_questions_limit,
  s.stripe_customer_id,
  s.stripe_subscription_id,
  s.stripe_price_id
FROM user_subscriptions s
JOIN auth.users u ON u.id = s.user_id
WHERE s.plan != 'free'
ORDER BY s.created_at DESC
LIMIT 5;
```

**Expected Result**:
- `plan`: 'starter' or 'pro'
- `status`: 'active'
- `document_limit`: 25 (starter) or 100 (pro)
- `ai_questions_limit`: 999999 (unlimited)
- `stripe_customer_id`: cus_xxxxx
- `stripe_subscription_id`: sub_xxxxx
- `stripe_price_id`: price_1SzmJJC1d2bwLolG6IatDmAT or price_1SzmGgC1d2bwLolGhBHMtuFZ

---

## 🚨 Troubleshooting

### Issue: "Price ID not configured" error
**Solution**: Make sure you added the Price IDs to both:
- Frontend `.env` file (already done ✅)
- Supabase Edge Function secrets (see Step 1 above)

### Issue: Webhook not receiving events
**Solution**:
1. Check webhook is enabled in Stripe Dashboard
2. Verify endpoint URL is correct
3. Check signing secret matches

### Issue: Subscription not updating in database
**Solution**:
1. Check Supabase logs: Settings → Edge Functions → Logs
2. Look for webhook errors
3. Verify `stripe_customers` table has entries

### Issue: "Checkout session creation failed"
**Solution**:
1. Verify `STRIPE_SECRET_KEY` is set in Supabase secrets
2. Check Edge Function logs for errors
3. Make sure functions are deployed

---

## 📈 What Happens Next?

Once setup is complete:

1. **Users upgrade** → Redirected to Stripe Checkout
2. **Payment successful** → Webhook receives event
3. **Webhook updates** → `user_subscriptions` table
4. **User redirected back** → See success message
5. **Dashboard updates** → Shows new plan and limits
6. **Enforcement active** → Document/AI limits enforced

---

## 🎯 Summary

**Your Stripe Integration**:
- ✅ Checkout Session: Collects billing address & calculates tax
- ✅ Webhook: Syncs subscriptions to database
- ✅ Customer Portal: Lets users manage subscriptions
- ✅ Tier Enforcement: Limits enforced (5→25→100 docs)
- ✅ AI Counter: Fixed and working with unlimited for paid tiers

**Ready for Production**:
- Switch to **Live Mode** in Stripe Dashboard
- Update keys to `sk_live_...` and `pk_live_...`
- Update price IDs to live prices
- Test one more time with real card

---

**Status**: ⏳ **Waiting for Step 1** (Add secrets to Supabase Dashboard)

**After completing Step 1**, deploy the functions (Step 2) and you're ready to test!
