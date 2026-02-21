# Tier Enforcement Implementation Status

## ✅ Phase 1: Database Layer (COMPLETE)

### Created Files
- **[supabase/migrations/001_tier_enforcement.sql](supabase/migrations/001_tier_enforcement.sql)**

### What's Included
✅ Added `feature_flags` JSONB column to `user_subscriptions`
✅ Updated default limits (5 docs, 10 questions for free)
✅ Set feature flags for all three tiers (free, starter, pro)
✅ Created `usage_logs` table for analytics
✅ Created `limit_violations` table for monitoring
✅ Created automatic trigger for setting defaults
✅ Created helper functions:
  - `check_document_limit(user_id)`
  - `check_ai_question_limit(user_id)`
✅ Created analytics views:
  - `users_approaching_limits`
  - `feature_usage_by_tier`

### Next Steps
```sql
-- Run this migration in Supabase SQL Editor
-- File: supabase/migrations/001_tier_enforcement.sql

-- Or run via CLI:
supabase db push
```

---

## ✅ Phase 2: Backend Middleware (COMPLETE)

### Created Files
- **[server/src/middleware/subscriptionGuard.ts](server/src/middleware/subscriptionGuard.ts)**
- **[server/src/routes/documents.example.ts](server/src/routes/documents.example.ts)**
- **[server/src/routes/chat.example.ts](server/src/routes/chat.example.ts)**

### Middleware Functions

#### Core Functions
1. **`loadSubscription()`** - Loads user subscription (apply to all routes)
2. **`checkDocumentLimit()`** - Enforces document limit
3. **`checkAIQuestionLimit()`** - Enforces AI question limit (free tier)
4. **`requireFeature(featureName)`** - Factory for feature gating
5. **`incrementAIQuestions()`** - Increments counter after successful AI question
6. **`logFeatureUsage()`** - Tracks feature usage for analytics

#### Usage Example
```typescript
import {
  loadSubscription,
  checkDocumentLimit,
  requireFeature,
} from './middleware/subscriptionGuard';

// Apply to all routes
router.use(loadSubscription);

// Document upload with limit check
router.post('/upload', checkDocumentLimit, uploadHandler);

// URL ingestion with feature gate + limit
router.post(
  '/ingest-url',
  requireFeature('url_ingestion'),
  checkDocumentLimit,
  ingestHandler
);
```

### Next Steps
1. Copy patterns from `.example.ts` files to your actual route files
2. Import and apply middleware
3. Test with different user tiers

---

## ⏳ Phase 3: Apply to Actual Routes (TODO)

### Files to Update

#### 1. Document Routes
```typescript
File: server/src/routes/documents.ts (if exists)

Steps:
□ Import subscription guards
□ Apply loadSubscription to router
□ Add checkDocumentLimit to upload endpoints
□ Add requireFeature('url_ingestion') to URL ingestion
□ Add logging to track usage
```

#### 2. Chat Routes
```typescript
File: server/src/routes/chat.ts (if exists)

Steps:
□ Import subscription guards
□ Apply loadSubscription to router
□ Add checkAIQuestionLimit to chat endpoints
□ Add incrementAIQuestions after successful response
□ Add logging to track usage
```

#### 3. Main App
```typescript
File: server/src/index.ts or server/src/app.ts

Steps:
□ Import updated route files
□ Ensure routes are mounted correctly
□ Test error handling
```

---

## ⏳ Phase 4: Edge Functions (TODO)

### Files to Update

#### 1. Chat Document Function
```typescript
File: supabase/functions/chat-document/index.ts

Add at the beginning:
```typescript
// Load subscription
const { data: subscription } = await supabase
  .from('user_subscriptions')
  .select('plan, ai_questions_limit, ai_questions_used, feature_flags')
  .eq('user_id', user_id)
  .single();

// Check limit (free tier)
if (subscription.plan === 'free') {
  if (subscription.ai_questions_used >= subscription.ai_questions_limit) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'AI question limit reached',
        upgrade_required: true,
      }),
      { status: 403, headers: corsHeaders }
    );
  }
}

// Increment counter
await supabase
  .from('user_subscriptions')
  .update({ ai_questions_used: subscription.ai_questions_used + 1 })
  .eq('user_id', user_id);

// Get priority for queue
const priority = subscription.feature_flags.priority_queue;
```

#### 2. Generate Tags Function
```typescript
File: supabase/functions/generate-tags/index.ts

Add feature check:
```typescript
// Check if auto-tags enabled
const { data: subscription } = await supabase
  .from('user_subscriptions')
  .select('feature_flags')
  .eq('user_id', document.user_id)
  .single();

if (!subscription?.feature_flags?.auto_tags) {
  return new Response(
    JSON.stringify({
      success: false,
      message: 'Auto-tag generation not available in free plan',
      upgrade_required: true,
    }),
    { status: 403, headers: corsHeaders }
  );
}
```

---

## ⏳ Phase 5: Frontend Updates (TODO)

### Files to Update

#### 1. useSubscription Hook
```typescript
File: src/hooks/useSubscription.ts

Add:
□ FeatureFlags interface
□ feature_flags to Subscription interface
□ canUseFeature(feature) function
□ documentUsagePercent calculation
□ aiQuestionUsagePercent calculation
```

#### 2. FeatureGate Component
```typescript
File: src/components/FeatureGate.tsx (NEW)

Create component that:
□ Checks if user has feature access
□ Shows locked UI for unavailable features
□ Displays upgrade prompts
□ Handles onUpgrade callback
```

#### 3. Apply Gates to UI
```typescript
Files:
- src/components/DocumentUpload.tsx
- src/components/ChatInterface.tsx
- src/components/Settings.tsx

Steps:
□ Import FeatureGate
□ Wrap premium features (URL ingestion, etc.)
□ Show limit warnings when approaching limits
□ Disable buttons when limits reached
□ Show usage percentages
```

---

## Testing Checklist

### Unit Tests
```bash
□ Test loadSubscription middleware
□ Test checkDocumentLimit with different counts
□ Test checkAIQuestionLimit for free/paid tiers
□ Test requireFeature with different features
□ Test incrementAIQuestions counter
```

### Integration Tests
```bash
□ Upload documents until limit reached
□ Verify 403 error with correct message
□ Ask AI questions until limit reached (free tier)
□ Verify unlimited for paid tiers
□ Test URL ingestion blocked for free tier
□ Test URL ingestion works for paid tiers
```

### Manual Testing
```bash
□ Create test user with free tier
□ Upload 5 documents → success
□ Upload 6th document → blocked
□ Ask 10 questions → success
□ Ask 11th question → blocked
□ Try URL ingestion → blocked

□ Upgrade to starter
□ Upload 25 documents → success
□ Ask 100+ questions → all succeed
□ Use URL ingestion → works

□ Upgrade to pro
□ Upload 100 documents → success
□ Ask unlimited questions → works
□ All features enabled
```

---

## Deployment Steps

### 1. Database Migration
```bash
# Option A: Via Supabase Dashboard
1. Open Supabase SQL Editor
2. Paste contents of 001_tier_enforcement.sql
3. Run migration
4. Verify tables and columns created

# Option B: Via Supabase CLI
supabase db push
```

### 2. Backend Deployment
```bash
# Build backend
cd server
npm run build

# Run tests
npm test

# Deploy
npm run deploy
# or
pm2 restart docuintelli-backend
```

### 3. Edge Functions Deployment
```bash
# Deploy updated functions
supabase functions deploy chat-document
supabase functions deploy generate-tags

# Set environment variables
supabase secrets set CF_ACCESS_CLIENT_ID=xxx
supabase secrets set CF_ACCESS_CLIENT_SECRET=xxx
```

### 4. Frontend Deployment
```bash
# Build frontend
npm run build

# Deploy
# (depends on your hosting - Vercel, Netlify, etc.)
```

---

## Monitoring & Alerts

### Query: Users Hitting Limits
```sql
SELECT
  u.email,
  s.plan,
  lv.limit_type,
  COUNT(*) as violations_last_7days
FROM limit_violations lv
JOIN auth.users u ON u.id = lv.user_id
JOIN user_subscriptions s ON s.user_id = lv.user_id
WHERE lv.timestamp > NOW() - INTERVAL '7 days'
GROUP BY u.email, s.plan, lv.limit_type
ORDER BY violations_last_7days DESC
LIMIT 20;
```

### Query: Feature Usage by Tier
```sql
SELECT * FROM feature_usage_by_tier
WHERE usage_date = CURRENT_DATE
ORDER BY total_uses DESC;
```

### Query: Upgrade Candidates
```sql
SELECT * FROM users_approaching_limits
WHERE document_usage_pct >= 80
   OR ai_usage_pct >= 80
ORDER BY document_usage_pct DESC, ai_usage_pct DESC
LIMIT 50;
```

---

## Current Progress

### ✅ Completed (60%)
- [x] Database schema design
- [x] Migration SQL file
- [x] Backend middleware implementation
- [x] Example route patterns
- [x] Helper functions
- [x] Analytics views
- [x] Comprehensive documentation

### ⏳ In Progress (40%)
- [ ] Apply middleware to actual routes
- [ ] Update Edge Functions
- [ ] Update frontend components
- [ ] Create FeatureGate component
- [ ] Write tests
- [ ] Deploy to staging
- [ ] Deploy to production

---

## Quick Start Guide

### Fastest Path to Production (1 Day)

#### Morning (4 hours)
```bash
1. Run database migration (30 min)
2. Update documents.ts with middleware (1 hour)
3. Update chat.ts with middleware (1 hour)
4. Update Edge Functions (1 hour)
5. Quick smoke test (30 min)
```

#### Afternoon (4 hours)
```bash
6. Update useSubscription hook (1 hour)
7. Add limit warnings to UI (1 hour)
8. Test all three tiers (1 hour)
9. Deploy to production (1 hour)
```

### Result
- ✅ Document limits enforced
- ✅ AI question limits enforced (free tier)
- ✅ Basic feature gating working
- ✅ Usage tracking enabled
- ⏳ Advanced UI features (can add later)

---

## Support & Troubleshooting

### Common Issues

**Issue**: Migration fails
- Check if columns already exist
- Run rollback if needed: `DROP COLUMN feature_flags;`
- Try again

**Issue**: Middleware not working
- Verify loadSubscription is first in chain
- Check auth header is being sent
- Verify Supabase credentials

**Issue**: Limits not enforcing
- Check if middleware is applied to route
- Verify database values are correct
- Check logs for errors

**Issue**: Frontend not showing limits
- Verify feature_flags in subscription response
- Check useSubscription hook updated
- Refresh subscription data

---

## Next Actions

**Right Now** (30 minutes):
1. Review this document
2. Run database migration
3. Test migration succeeded

**Today** (4 hours):
1. Update your actual route files
2. Apply middleware
3. Test with curl/Postman

**This Week**:
1. Update Edge Functions
2. Update frontend
3. Deploy to staging
4. Full testing

**Success Metrics** (Track after deployment):
- Limit hit rate by tier
- Upgrade conversion rate
- Support tickets related to limits
- Revenue impact

---

**Status**: Ready for implementation
**Next Step**: Run database migration
**Estimated Time**: 1-3 days for full implementation
