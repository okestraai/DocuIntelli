# Tier Enforcement Implementation Roadmap

## Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│                   Enforcement Layers                         │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Database      │ Constraints & Defaults            │
│  Layer 2: Backend API   │ Middleware Guards                 │
│  Layer 3: Edge Functions│ Limit Checks                      │
│  Layer 4: Frontend      │ Feature Gates & UI                │
│  Layer 5: Queue System  │ Priority Processing               │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Timeline (3 Weeks)

### Week 1: Core Infrastructure ✅

#### Day 1-2: Database Layer
```sql
Status: Ready to implement
Files: migrations/001_tier_enforcement.sql

Tasks:
□ Add feature_flags column to user_subscriptions
□ Update default limits (5 docs, 10 questions for free)
□ Set feature flags for all plans
□ Create usage tracking tables
```

#### Day 3-4: Backend Middleware
```
Status: Ready to implement
Files: server/src/middleware/subscriptionGuard.ts

Tasks:
□ Create loadSubscription middleware
□ Create checkDocumentLimit middleware
□ Create checkAIQuestionLimit middleware
□ Create requireFeature middleware
□ Write unit tests
```

#### Day 5: Apply Middleware to Routes
```typescript
Files:
- server/src/routes/documents.ts
- server/src/routes/chat.ts
- server/src/routes/urlIngestion.ts

Tasks:
□ Apply guards to document upload endpoint
□ Apply guards to chat endpoint
□ Apply guards to URL ingestion endpoint
□ Test all endpoints
```

### Week 2: Frontend & Edge Functions 🔄

#### Day 1-2: Frontend Updates
```typescript
Files:
- src/hooks/useSubscription.ts
- src/components/FeatureGate.tsx

Tasks:
□ Add feature_flags to Subscription interface
□ Add canUseFeature function
□ Create FeatureGate component
□ Add usage percentage calculations
```

#### Day 3-4: Apply Feature Gates
```typescript
Files:
- src/components/DocumentUpload.tsx
- src/components/ChatInterface.tsx
- src/components/Settings.tsx

Tasks:
□ Gate URL ingestion
□ Show limit warnings
□ Disable buttons when limit reached
□ Show upgrade prompts
```

#### Day 5: Edge Function Updates
```typescript
Files:
- supabase/functions/chat-document/index.ts
- supabase/functions/generate-tags/index.ts

Tasks:
□ Add subscription checks to chat function
□ Add AI question counter increment
□ Add feature flag check to generate-tags
□ Test with different tiers
```

### Week 3: Polish & Monitoring 🎯

#### Day 1-2: Testing
```
Tasks:
□ Unit tests for all middleware
□ Integration tests for limits
□ E2E tests for user flows
□ Performance testing
```

#### Day 3: Usage Tracking
```typescript
Files:
- server/src/services/usageTracking.ts

Tasks:
□ Track feature usage
□ Track limit violations
□ Set up analytics queries
```

#### Day 4-5: Deployment & Monitoring
```
Tasks:
□ Deploy to staging
□ Smoke test all tiers
□ Deploy to production
□ Monitor for issues
□ Set up alerts
```

---

## Quick Start: Minimal Implementation

If you need to ship quickly, implement these in order:

### Phase 1: Basic Limits (Day 1) 🚀

```typescript
// 1. Update database
ALTER TABLE user_subscriptions
  ALTER COLUMN document_limit SET DEFAULT 5,
  ALTER COLUMN ai_questions_limit SET DEFAULT 10;

// 2. Add simple middleware to backend
router.use(async (req, res, next) => {
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', req.userId)
    .single();

  req.subscription = sub;
  next();
});

// Document limit check
router.post('/upload', async (req, res) => {
  const { count } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', req.userId);

  if (count >= req.subscription.document_limit) {
    return res.status(403).json({ error: 'Limit reached' });
  }
  // ... upload logic
});

// 3. Update frontend useSubscription
const canUploadDocument = documentCount < subscription.document_limit;
const canAskQuestion = subscription.plan !== 'free' ||
                       subscription.ai_questions_used < subscription.ai_questions_limit;
```

### Phase 2: Feature Gating (Day 2-3) 🔒

```typescript
// Add feature flags to database
ALTER TABLE user_subscriptions
ADD COLUMN feature_flags JSONB DEFAULT '{}';

// Simple feature check
function canUseFeature(subscription, feature) {
  const rules = {
    url_ingestion: ['starter', 'pro'],
    ocr: ['starter', 'pro'],
    priority_queue: ['pro']
  };
  return rules[feature]?.includes(subscription.plan);
}

// Apply in routes
if (!canUseFeature(req.subscription, 'url_ingestion')) {
  return res.status(403).json({ error: 'Feature not available' });
}
```

### Phase 3: UI Polish (Day 4-5) ✨

```typescript
// Show limits in UI
<div>
  Documents: {documentCount}/{subscription.document_limit}
  {documentCount >= subscription.document_limit && (
    <button onClick={handleUpgrade}>Upgrade</button>
  )}
</div>

// Gate features
{subscription.plan !== 'free' ? (
  <URLIngestionForm />
) : (
  <UpgradePrompt feature="URL Ingestion" />
)}
```

---

## File Structure

```
DocuIntelli/
├── server/
│   ├── src/
│   │   ├── middleware/
│   │   │   └── subscriptionGuard.ts         [NEW] ⭐
│   │   ├── services/
│   │   │   ├── usageTracking.ts            [NEW] ⭐
│   │   │   └── jobQueue.ts                 [NEW] 📦
│   │   └── routes/
│   │       ├── documents.ts                [UPDATE]
│   │       └── chat.ts                     [UPDATE]
├── src/
│   ├── hooks/
│   │   └── useSubscription.ts              [UPDATE]
│   ├── components/
│   │   ├── FeatureGate.tsx                 [NEW] ⭐
│   │   ├── DocumentUpload.tsx              [UPDATE]
│   │   └── ChatInterface.tsx               [UPDATE]
├── supabase/
│   ├── functions/
│   │   ├── chat-document/
│   │   │   └── index.ts                    [UPDATE]
│   │   └── generate-tags/
│   │       └── index.ts                    [UPDATE]
│   └── migrations/
│       └── 001_tier_enforcement.sql         [NEW] ⭐
└── tests/
    ├── subscription.test.ts                [NEW] ⭐
    └── integration/
        └── limits.test.ts                  [NEW] ⭐

Legend:
⭐ Critical (implement first)
📦 Optional (nice to have)
```

---

## Common Pitfalls & Solutions

### Issue 1: Race Conditions
**Problem**: Multiple uploads happening simultaneously
**Solution**: Use database transactions
```typescript
await supabase.rpc('check_and_increment_count', {
  user_id: userId,
  limit: documentLimit
});
```

### Issue 2: Cached Subscription Data
**Problem**: Frontend shows stale limits
**Solution**: Refresh subscription after critical actions
```typescript
await uploadDocument();
await refreshSubscription();
```

### Issue 3: Edge Function Cold Starts
**Problem**: Slow limit checks
**Solution**: Cache subscription data in edge function
```typescript
const cacheKey = `sub:${user_id}`;
let sub = await cache.get(cacheKey);
if (!sub) {
  sub = await fetchSubscription(user_id);
  await cache.set(cacheKey, sub, 300); // 5 min
}
```

---

## Testing Strategy

### Manual Testing Checklist

#### Free Tier
- [ ] Upload 5 documents successfully
- [ ] 6th upload blocked with upgrade prompt
- [ ] Ask 10 questions successfully
- [ ] 11th question blocked with upgrade prompt
- [ ] URL ingestion button disabled/hidden
- [ ] No auto-tags generated

#### Starter Tier
- [ ] Upload 25 documents successfully
- [ ] 26th upload blocked with upgrade prompt
- [ ] Ask unlimited questions (test 100+)
- [ ] URL ingestion works
- [ ] Auto-tags generated
- [ ] OCR works

#### Pro Tier
- [ ] Upload 100 documents successfully
- [ ] 101st upload blocked with upgrade prompt
- [ ] Ask unlimited questions (test 100+)
- [ ] All features enabled
- [ ] Priority processing faster

### Automated Test Script
```bash
# Run full test suite
npm run test:limits

# Test specific tier
npm run test:limits -- --tier=free

# Test specific feature
npm run test:limits -- --feature=documents
```

---

## Monitoring Dashboard Queries

### Active Limits Status
```sql
SELECT
  plan,
  COUNT(*) as users,
  AVG(ai_questions_used * 100.0 / ai_questions_limit) as avg_ai_usage_pct,
  COUNT(*) FILTER (WHERE ai_questions_used >= ai_questions_limit) as users_at_ai_limit
FROM user_subscriptions
WHERE plan = 'free'
GROUP BY plan;
```

### Users Close to Limits (Upgrade Candidates)
```sql
SELECT
  u.email,
  s.plan,
  COUNT(d.id) as document_count,
  s.document_limit,
  s.ai_questions_used,
  s.ai_questions_limit
FROM user_subscriptions s
JOIN auth.users u ON u.id = s.user_id
LEFT JOIN documents d ON d.user_id = s.user_id
GROUP BY u.email, s.plan, s.document_limit, s.ai_questions_used, s.ai_questions_limit
HAVING COUNT(d.id) >= s.document_limit * 0.8  -- 80% of limit
   OR s.ai_questions_used >= s.ai_questions_limit * 0.8
ORDER BY COUNT(d.id) DESC;
```

### Feature Usage by Tier
```sql
SELECT
  s.plan,
  COUNT(DISTINCT ul.user_id) as users_using_feature,
  COUNT(*) as total_uses
FROM usage_logs ul
JOIN user_subscriptions s ON s.user_id = ul.user_id
WHERE ul.feature = 'url_ingestion'
  AND ul.timestamp > NOW() - INTERVAL '30 days'
GROUP BY s.plan;
```

---

## Success Criteria

### Week 1
✅ All limits enforced at backend level
✅ Tests passing
✅ No breaking changes for existing users

### Week 2
✅ Feature gates visible in UI
✅ Upgrade prompts showing correctly
✅ Edge functions enforcing limits

### Week 3
✅ Zero limit bypass incidents
✅ Monitoring dashboard live
✅ 10%+ conversion rate from free to paid

---

## Emergency Rollback Plan

If issues arise:

```bash
# Disable enforcement (feature flag)
UPDATE user_subscriptions
SET feature_flags = jsonb_set(
  feature_flags,
  '{enforcement_enabled}',
  'false'
);

# Or rollback database migration
psql $DATABASE_URL < rollback.sql

# Revert backend deployment
git revert HEAD
npm run deploy
```

---

**Next Step**: Start with database migrations (Week 1, Day 1-2)
**Reference**: See [TIER_ENFORCEMENT_PLAN.md](TIER_ENFORCEMENT_PLAN.md) for detailed implementation
