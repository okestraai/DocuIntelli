# Pricing Model Update Summary

## Overview
Successfully updated DocuVault AI pricing from a 4-tier model to a 3-tier document-based pricing model with unlimited AI chats for paid tiers.

## New Pricing Structure

### 🆓 Free - $0/month
**Target**: Trial users
- **5 documents** (was 2)
- **10 AI questions/month** (was 5)
- File upload only
- Single device
- Standard LLM queue (lowest priority)
- ❌ No URL ingestion
- ❌ No background embedding refresh
- ❌ No auto tag generation
- ❌ No OCR

### ⚡ Starter - $7/month
**Target**: Individuals
- **25 documents**
- **Unlimited AI chats** (was 50/month)
- File + URL ingestion
- OCR for images
- Email notifications
- Standard LLM queue (medium priority)
- Background embedding generation
- Auto tags enabled
- Basic summarization

### 👑 Pro - $19/month (Most Popular)
**Target**: Power users & families
- **100 documents**
- **Unlimited AI chats** (was 200/month)
- File + URL ingestion
- All Starter features
- **Priority LLM queue** ⚡
- Faster embedding generation
- Advanced tagging & relationship mapping
- AI summaries + key data extraction
- Multi-device sync
- Priority support

## Key Changes

### Removed
- ❌ **Business Plan** ($29/month) - Removed entirely
- Focus on individual/family users rather than teams

### Philosophy Changes
1. **Document-based pricing**: Pay for storage, not usage
2. **Unlimited AI chats**: Paid tiers get unlimited questions
3. **Priority queue system**: Higher tiers get faster LLM processing
4. **Feature gating**: URL ingestion, auto-tags, embeddings tied to tier

## Files Updated

### Frontend Components
1. **[PricingPage.tsx](src/components/PricingPage.tsx)**
   - Removed Business plan
   - Updated all pricing, limits, and features
   - Changed grid from 4 to 3 columns
   - Updated FAQs to reflect new model

2. **[Dashboard.tsx](src/components/Dashboard.tsx)**
   - Updated plan display logic
   - Changed AI questions to show ∞ for paid plans
   - Added Starter plan styling
   - Updated plan descriptions

3. **[UpgradeModal.tsx](src/components/UpgradeModal.tsx)**
   - Removed business plan from type signature

4. **[App.tsx](src/App.tsx)**
   - Updated handleSelectPlan to use new plan types

### Type Definitions & Hooks
5. **[useSubscription.ts](src/hooks/useSubscription.ts)**
   - Updated Subscription interface: `'free' | 'starter' | 'pro'`
   - Changed canAskQuestion logic: paid plans get unlimited
   - Updated default free tier limits (5 docs, 10 questions)

### API & Backend
6. **[lib/api.ts](src/lib/api.ts)**
   - Removed business from createCheckoutSession
   - Removed VITE_STRIPE_BUSINESS_PRICE_ID

### Configuration
7. **[.env.example](.env.example)**
   - Removed business price ID
   - Added pricing comments

## Database Changes Needed

### Update user_subscriptions table defaults:
```sql
-- Update free tier limits
ALTER TABLE user_subscriptions
  ALTER COLUMN document_limit SET DEFAULT 5,
  ALTER COLUMN ai_questions_limit SET DEFAULT 10;

-- Update any existing free tier users
UPDATE user_subscriptions
SET
  document_limit = 5,
  ai_questions_limit = 10
WHERE plan = 'free';

-- Ensure starter plan can have unlimited chats
-- (backend will check plan !== 'free' for unlimited)
```

### Plan Configuration Table (Recommended):
```sql
CREATE TABLE plan_configs (
  plan_name TEXT PRIMARY KEY,
  document_limit INTEGER NOT NULL,
  ai_questions_limit INTEGER, -- NULL means unlimited
  price_monthly DECIMAL(10,2),
  priority_level INTEGER DEFAULT 0,
  features JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO plan_configs VALUES
  ('free', 5, 10, 0, 0, '{"url_ingestion": false, "auto_tags": false, "ocr": false}'),
  ('starter', 25, NULL, 7, 1, '{"url_ingestion": true, "auto_tags": true, "ocr": true}'),
  ('pro', 100, NULL, 19, 2, '{"url_ingestion": true, "auto_tags": true, "ocr": true, "priority_queue": true}');
```

## Stripe Configuration

### Create New Products in Stripe:
1. **Starter Plan**: $7/month
   - Metadata: `plan=starter`, `document_limit=25`, `ai_questions_limit=unlimited`

2. **Pro Plan**: $19/month
   - Metadata: `plan=pro`, `document_limit=100`, `ai_questions_limit=unlimited`

### Update Environment Variables:
```bash
VITE_STRIPE_STARTER_PRICE_ID=price_[starter_price_id]
VITE_STRIPE_PRO_PRICE_ID=price_[pro_price_id]
# Remove: VITE_STRIPE_BUSINESS_PRICE_ID
```

## Implementation Benefits

### For Users:
✅ Simpler pricing structure (3 tiers vs 4)
✅ Unlimited AI chats on paid plans
✅ Clear value proposition at each tier
✅ Pay for what you store, not what you use

### For Business:
✅ Encourages upgrades when document limit is reached
✅ No AI chat overage issues to manage
✅ Priority queue allows better resource allocation
✅ Clear monetization path tied to storage

## Testing Checklist

- [ ] Verify Stripe checkout works for Starter plan
- [ ] Verify Stripe checkout works for Pro plan
- [ ] Test free tier document limit (5 documents)
- [ ] Test free tier AI question limit (10 questions)
- [ ] Verify paid plans show unlimited (∞) for AI questions
- [ ] Test plan display in Dashboard
- [ ] Test upgrade modal
- [ ] Test document upload limits per tier
- [ ] Verify priority queue handling (if implemented)
- [ ] Test existing "business" plan users (migration needed)

## Migration Notes

### Existing Business Plan Users:
```sql
-- Option 1: Migrate to Pro (recommended)
UPDATE user_subscriptions
SET plan = 'pro'
WHERE plan = 'business';

-- Option 2: Grandfather business plan (keep existing features)
-- No action needed - business plan users keep their plan
-- Note: Need to update code to handle legacy 'business' plan
```

## Next Steps

1. ✅ Update all TypeScript types and interfaces
2. ✅ Update UI components
3. ✅ Update API functions
4. ⏳ Create Stripe products for Starter ($7) and Pro ($19)
5. ⏳ Update environment variables with new Stripe price IDs
6. ⏳ Update database schema and defaults
7. ⏳ Migrate existing users (if any)
8. ⏳ Test checkout flow end-to-end
9. ⏳ Implement priority queue system (backend)
10. ⏳ Deploy changes

## Priority Queue Implementation (Future)

For backend implementation:
```typescript
// Priority levels
const PRIORITY = {
  free: 0,
  starter: 1,
  pro: 2
};

// Add to job queue with priority
await queue.add('generate-embedding', {
  documentId,
  userId,
  priority: PRIORITY[userPlan]
});
```

## Success Metrics

Track these metrics after launch:
- Free → Starter conversion rate
- Starter → Pro conversion rate
- Average documents per user by tier
- AI chat usage by tier
- Revenue per user (ARPU)
- Churn rate by tier

---

**Status**: ✅ Code updates complete. Ready for database and Stripe configuration.
