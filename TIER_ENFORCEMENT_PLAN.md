# Tier Limitation Enforcement Plan

## Overview
Comprehensive implementation plan to enforce document limits, AI chat limits, and feature gating across Free, Starter, and Pro tiers.

---

## 1. Database Schema Updates

### 1.1 Update Subscription Limits
```sql
-- Update default limits for free tier
ALTER TABLE user_subscriptions
  ALTER COLUMN document_limit SET DEFAULT 5,
  ALTER COLUMN ai_questions_limit SET DEFAULT 10;

-- Ensure existing free users have correct limits
UPDATE user_subscriptions
SET
  document_limit = 5,
  ai_questions_limit = 10
WHERE plan = 'free';

-- Set limits for paid tiers
UPDATE user_subscriptions
SET
  document_limit = 25,
  ai_questions_limit = 999999  -- Effectively unlimited
WHERE plan = 'starter';

UPDATE user_subscriptions
SET
  document_limit = 100,
  ai_questions_limit = 999999  -- Effectively unlimited
WHERE plan = 'pro';
```

### 1.2 Add Feature Flags Column
```sql
-- Add feature_flags JSONB column to user_subscriptions
ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}';

-- Set feature flags based on plan
UPDATE user_subscriptions
SET feature_flags = jsonb_build_object(
  'url_ingestion', CASE WHEN plan IN ('starter', 'pro') THEN true ELSE false END,
  'ocr_enabled', CASE WHEN plan IN ('starter', 'pro') THEN true ELSE false END,
  'auto_tags', CASE WHEN plan IN ('starter', 'pro') THEN true ELSE false END,
  'background_embedding', CASE WHEN plan IN ('starter', 'pro') THEN true ELSE false END,
  'priority_queue', CASE WHEN plan = 'pro' THEN 2 WHEN plan = 'starter' THEN 1 ELSE 0 END,
  'email_notifications', CASE WHEN plan IN ('starter', 'pro') THEN true ELSE false END,
  'multi_device_sync', CASE WHEN plan = 'pro' THEN true ELSE false END,
  'priority_support', CASE WHEN plan = 'pro' THEN true ELSE false END
);
```

### 1.3 Add Database Constraints
```sql
-- Add check constraint to prevent exceeding document limit
-- Note: This is a soft constraint, enforced in application layer

-- Create function to check document limit
CREATE OR REPLACE FUNCTION check_document_limit()
RETURNS TRIGGER AS $$
DECLARE
  user_limit INTEGER;
  user_count INTEGER;
BEGIN
  -- Get user's document limit
  SELECT document_limit INTO user_limit
  FROM user_subscriptions
  WHERE user_id = NEW.user_id;

  -- Count user's existing documents
  SELECT COUNT(*) INTO user_count
  FROM documents
  WHERE user_id = NEW.user_id;

  -- Check if limit exceeded
  IF user_count >= user_limit THEN
    RAISE EXCEPTION 'Document limit exceeded for user %', NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (optional - might interfere with uploads)
-- Recommendation: Enforce in application layer instead
-- CREATE TRIGGER document_limit_trigger
-- BEFORE INSERT ON documents
-- FOR EACH ROW
-- EXECUTE FUNCTION check_document_limit();
```

---

## 2. Backend API Enforcement

### 2.1 Create Subscription Guard Middleware
```typescript
// server/src/middleware/subscriptionGuard.ts

import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface SubscriptionInfo {
  plan: 'free' | 'starter' | 'pro';
  document_limit: number;
  ai_questions_limit: number;
  ai_questions_used: number;
  feature_flags: {
    url_ingestion: boolean;
    ocr_enabled: boolean;
    auto_tags: boolean;
    background_embedding: boolean;
    priority_queue: number;
    email_notifications: boolean;
    multi_device_sync: boolean;
    priority_support: boolean;
  };
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      subscription?: SubscriptionInfo;
      userId?: string;
    }
  }
}

/**
 * Middleware to load user subscription info
 */
export async function loadSubscription(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.userId; // Assume auth middleware sets this

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { data: subscription, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !subscription) {
      return res.status(403).json({ error: 'Subscription not found' });
    }

    req.subscription = subscription as SubscriptionInfo;
    next();
  } catch (error) {
    console.error('Subscription guard error:', error);
    res.status(500).json({ error: 'Failed to load subscription' });
  }
}

/**
 * Middleware to check document limit
 */
export async function checkDocumentLimit(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.userId;
    const subscription = req.subscription;

    if (!subscription) {
      return res.status(403).json({ error: 'Subscription not loaded' });
    }

    // Count user's documents
    const { count, error } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    if (count! >= subscription.document_limit) {
      return res.status(403).json({
        error: 'Document limit reached',
        limit: subscription.document_limit,
        current: count,
        plan: subscription.plan,
        upgrade_required: true,
      });
    }

    next();
  } catch (error) {
    console.error('Document limit check error:', error);
    res.status(500).json({ error: 'Failed to check document limit' });
  }
}

/**
 * Middleware to check AI question limit
 */
export async function checkAIQuestionLimit(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const subscription = req.subscription;

    if (!subscription) {
      return res.status(403).json({ error: 'Subscription not loaded' });
    }

    // Paid plans have unlimited questions
    if (subscription.plan !== 'free') {
      return next();
    }

    // Check free tier limit
    if (subscription.ai_questions_used >= subscription.ai_questions_limit) {
      return res.status(403).json({
        error: 'AI question limit reached',
        limit: subscription.ai_questions_limit,
        current: subscription.ai_questions_used,
        plan: subscription.plan,
        upgrade_required: true,
      });
    }

    next();
  } catch (error) {
    console.error('AI question limit check error:', error);
    res.status(500).json({ error: 'Failed to check AI question limit' });
  }
}

/**
 * Middleware to check feature access
 */
export function requireFeature(featureName: keyof SubscriptionInfo['feature_flags']) {
  return (req: Request, res: Response, next: NextFunction) => {
    const subscription = req.subscription;

    if (!subscription) {
      return res.status(403).json({ error: 'Subscription not loaded' });
    }

    const hasFeature = subscription.feature_flags?.[featureName];

    if (!hasFeature) {
      return res.status(403).json({
        error: `Feature '${featureName}' not available in ${subscription.plan} plan`,
        feature: featureName,
        plan: subscription.plan,
        upgrade_required: true,
      });
    }

    next();
  };
}
```

### 2.2 Apply Middleware to Routes
```typescript
// server/src/routes/documents.ts

import express from 'express';
import {
  loadSubscription,
  checkDocumentLimit,
  requireFeature,
} from '../middleware/subscriptionGuard';

const router = express.Router();

// Apply subscription loading to all routes
router.use(loadSubscription);

// Document upload - check limit
router.post(
  '/upload',
  checkDocumentLimit,
  uploadController.handleUpload
);

// URL ingestion - requires feature
router.post(
  '/ingest-url',
  requireFeature('url_ingestion'),
  checkDocumentLimit,
  urlIngestionController.ingestUrl
);

export default router;
```

```typescript
// server/src/routes/chat.ts

import express from 'express';
import {
  loadSubscription,
  checkAIQuestionLimit,
} from '../middleware/subscriptionGuard';

const router = express.Router();

router.use(loadSubscription);

// Chat endpoint - check AI question limit
router.post(
  '/ask',
  checkAIQuestionLimit,
  chatController.askQuestion
);

export default router;
```

---

## 3. Frontend Enforcement

### 3.1 Update useSubscription Hook
```typescript
// src/hooks/useSubscription.ts

export interface FeatureFlags {
  url_ingestion: boolean;
  ocr_enabled: boolean;
  auto_tags: boolean;
  background_embedding: boolean;
  priority_queue: number;
  email_notifications: boolean;
  multi_device_sync: boolean;
  priority_support: boolean;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: 'free' | 'starter' | 'pro';
  status: 'active' | 'canceled' | 'expired' | 'trialing';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  document_limit: number;
  ai_questions_limit: number;
  ai_questions_used: number;
  ai_questions_reset_date: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  feature_flags: FeatureFlags;
}

interface UseSubscriptionReturn {
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
  canUploadDocument: boolean;
  canAskQuestion: boolean;
  canUseFeature: (feature: keyof FeatureFlags) => boolean;
  documentCount: number;
  documentUsagePercent: number;
  aiQuestionUsagePercent: number;
  refreshSubscription: () => Promise<void>;
  incrementAIQuestions: () => Promise<void>;
}

export function useSubscription(): UseSubscriptionReturn {
  // ... existing code ...

  const canUseFeature = (feature: keyof FeatureFlags): boolean => {
    if (!subscription) return false;
    return subscription.feature_flags?.[feature] || false;
  };

  const documentUsagePercent = subscription
    ? (documentCount / subscription.document_limit) * 100
    : 0;

  const aiQuestionUsagePercent = subscription && subscription.plan === 'free'
    ? (subscription.ai_questions_used / subscription.ai_questions_limit) * 100
    : 0;

  return {
    subscription,
    loading,
    error,
    canUploadDocument,
    canAskQuestion,
    canUseFeature,
    documentCount,
    documentUsagePercent,
    aiQuestionUsagePercent,
    refreshSubscription: fetchSubscription,
    incrementAIQuestions,
  };
}
```

### 3.2 Create Feature Gate Component
```typescript
// src/components/FeatureGate.tsx

import React from 'react';
import { useSubscription } from '../hooks/useSubscription';
import { Lock, Crown } from 'lucide-react';
import type { FeatureFlags } from '../hooks/useSubscription';

interface FeatureGateProps {
  feature: keyof FeatureFlags;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showUpgrade?: boolean;
  onUpgrade?: () => void;
}

export function FeatureGate({
  feature,
  children,
  fallback,
  showUpgrade = true,
  onUpgrade,
}: FeatureGateProps) {
  const { subscription, canUseFeature } = useSubscription();

  if (canUseFeature(feature)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showUpgrade) {
    return null;
  }

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
        <div className="text-center p-6">
          <Lock className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-700 mb-2">
            {getFeatureName(feature)} requires {getRequiredPlan(feature)} or higher
          </p>
          <button
            onClick={onUpgrade}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:from-emerald-700 hover:to-teal-700"
          >
            <Crown className="h-4 w-4" />
            Upgrade Now
          </button>
        </div>
      </div>
      <div className="opacity-50 pointer-events-none">{children}</div>
    </div>
  );
}

function getFeatureName(feature: keyof FeatureFlags): string {
  const names: Record<keyof FeatureFlags, string> = {
    url_ingestion: 'URL Ingestion',
    ocr_enabled: 'OCR',
    auto_tags: 'Auto Tags',
    background_embedding: 'Background Embedding',
    priority_queue: 'Priority Processing',
    email_notifications: 'Email Notifications',
    multi_device_sync: 'Multi-Device Sync',
    priority_support: 'Priority Support',
  };
  return names[feature] || feature;
}

function getRequiredPlan(feature: keyof FeatureFlags): string {
  const planMap: Record<keyof FeatureFlags, string> = {
    url_ingestion: 'Starter',
    ocr_enabled: 'Starter',
    auto_tags: 'Starter',
    background_embedding: 'Starter',
    priority_queue: 'Pro',
    email_notifications: 'Starter',
    multi_device_sync: 'Pro',
    priority_support: 'Pro',
  };
  return planMap[feature] || 'Starter';
}
```

### 3.3 Apply Feature Gates in UI
```typescript
// src/components/DocumentUpload.tsx

import { FeatureGate } from './FeatureGate';
import { useSubscription } from '../hooks/useSubscription';

export function DocumentUpload() {
  const { subscription, canUploadDocument, documentCount } = useSubscription();

  return (
    <div>
      {/* File Upload - Always available */}
      <div className="mb-4">
        <button
          onClick={handleFileUpload}
          disabled={!canUploadDocument}
          className={`... ${!canUploadDocument ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Upload File ({documentCount}/{subscription?.document_limit})
        </button>
        {!canUploadDocument && (
          <p className="text-sm text-red-600 mt-2">
            Document limit reached. Upgrade to continue.
          </p>
        )}
      </div>

      {/* URL Ingestion - Gated feature */}
      <FeatureGate feature="url_ingestion" onUpgrade={handleUpgrade}>
        <div className="mb-4">
          <input
            type="url"
            placeholder="Enter URL to ingest..."
            className="..."
          />
          <button onClick={handleUrlIngest} className="...">
            Ingest URL
          </button>
        </div>
      </FeatureGate>
    </div>
  );
}
```

---

## 4. Edge Function Enforcement

### 4.1 Update chat-document Edge Function
```typescript
// supabase/functions/chat-document/index.ts

// Add subscription check at the beginning
const { data: subscription, error: subError } = await supabase
  .from('user_subscriptions')
  .select('plan, ai_questions_limit, ai_questions_used')
  .eq('user_id', user_id)
  .single();

if (subError || !subscription) {
  return new Response(
    JSON.stringify({ success: false, error: 'Subscription not found' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Check AI question limit for free tier
if (subscription.plan === 'free') {
  if (subscription.ai_questions_used >= subscription.ai_questions_limit) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'AI question limit reached',
        limit: subscription.ai_questions_limit,
        used: subscription.ai_questions_used,
        upgrade_required: true,
      }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Increment AI question counter
await supabase
  .from('user_subscriptions')
  .update({
    ai_questions_used: subscription.ai_questions_used + 1,
    updated_at: new Date().toISOString(),
  })
  .eq('user_id', user_id);

// Priority queue handling
const priority = subscription.plan === 'pro' ? 2 :
                 subscription.plan === 'starter' ? 1 : 0;

// Use priority for vLLM request prioritization (future implementation)
```

### 4.2 Update generate-tags Edge Function
```typescript
// supabase/functions/generate-tags/index.ts

// Check if auto-tags feature is enabled
const { data: subscription } = await supabase
  .from('user_subscriptions')
  .select('plan, feature_flags')
  .eq('user_id', document.user_id)
  .single();

const autoTagsEnabled = subscription?.feature_flags?.auto_tags || false;

if (!autoTagsEnabled) {
  return new Response(
    JSON.stringify({
      success: false,
      message: 'Auto-tag generation not available in free plan',
      upgrade_required: true,
    }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

---

## 5. Priority Queue Implementation

### 5.1 Create Job Queue Service
```typescript
// server/src/services/jobQueue.ts

import Bull from 'bull';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Create queues for different priority levels
export const embeddingQueue = new Bull('embedding', {
  redis: {
    host: 'localhost',
    port: 6379,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Priority levels
export const PRIORITY = {
  free: 0,
  starter: 1,
  pro: 2,
};

/**
 * Add embedding job with priority
 */
export async function queueEmbeddingJob(
  documentId: string,
  userId: string,
  userPlan: 'free' | 'starter' | 'pro'
) {
  const priority = PRIORITY[userPlan];

  await embeddingQueue.add(
    'generate-embeddings',
    {
      documentId,
      userId,
      plan: userPlan,
    },
    {
      priority,
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  console.log(`📋 Queued embedding job for ${documentId} with priority ${priority}`);
}

/**
 * Process embedding jobs
 */
embeddingQueue.process('generate-embeddings', async (job) => {
  const { documentId, userId, plan } = job.data;
  console.log(`🔄 Processing embedding job for ${documentId} (${plan} plan)`);

  // Import and call embedding service
  const { processDocumentVLLMEmbeddings } = await import('./vllmEmbeddings');
  const result = await processDocumentVLLMEmbeddings(documentId);

  return result;
});

// Monitor queue
embeddingQueue.on('completed', (job, result) => {
  console.log(`✅ Embedding job completed: ${job.id}`);
});

embeddingQueue.on('failed', (job, err) => {
  console.error(`❌ Embedding job failed: ${job?.id}`, err.message);
});
```

### 5.2 Update Chunking Service to Use Queue
```typescript
// server/src/services/chunking.ts

import { queueEmbeddingJob } from './jobQueue';

export async function processDocument(documentId: string) {
  // ... existing chunking code ...

  // Get user's plan
  const { data: document } = await supabase
    .from('documents')
    .select('user_id')
    .eq('id', documentId)
    .single();

  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('plan')
    .eq('user_id', document.user_id)
    .single();

  const userPlan = subscription?.plan || 'free';

  // Queue embedding generation with priority
  await queueEmbeddingJob(documentId, document.user_id, userPlan);

  return {
    success: true,
    chunksProcessed: insertedChunks?.length || 0,
    embeddingStatus: 'queued',
  };
}
```

---

## 6. Monitoring & Analytics

### 6.1 Create Usage Tracking
```typescript
// server/src/services/usageTracking.ts

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Track feature usage
 */
export async function trackFeatureUsage(
  userId: string,
  feature: string,
  metadata?: any
) {
  await supabase.from('usage_logs').insert({
    user_id: userId,
    feature,
    metadata,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Track limit violations
 */
export async function trackLimitViolation(
  userId: string,
  limitType: 'document' | 'ai_question',
  currentValue: number,
  limitValue: number
) {
  await supabase.from('limit_violations').insert({
    user_id: userId,
    limit_type: limitType,
    current_value: currentValue,
    limit_value: limitValue,
    timestamp: new Date().toISOString(),
  });

  console.warn(`🚫 Limit violation: User ${userId} hit ${limitType} limit`);
}
```

### 6.2 Create Usage Dashboard Query
```sql
-- Create usage_logs table
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  feature TEXT NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_timestamp ON usage_logs(timestamp);

-- Create limit_violations table
CREATE TABLE IF NOT EXISTS limit_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  limit_type TEXT NOT NULL,
  current_value INTEGER,
  limit_value INTEGER,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_limit_violations_user_id ON limit_violations(user_id);
CREATE INDEX idx_limit_violations_timestamp ON limit_violations(timestamp);

-- Query to find users hitting limits frequently
SELECT
  u.email,
  s.plan,
  lv.limit_type,
  COUNT(*) as violation_count,
  MAX(lv.timestamp) as last_violation
FROM limit_violations lv
JOIN auth.users u ON u.id = lv.user_id
JOIN user_subscriptions s ON s.user_id = lv.user_id
WHERE lv.timestamp > NOW() - INTERVAL '30 days'
GROUP BY u.email, s.plan, lv.limit_type
HAVING COUNT(*) > 3
ORDER BY violation_count DESC;
```

---

## 7. Testing Plan

### 7.1 Unit Tests
```typescript
// tests/subscription.test.ts

describe('Subscription Limits', () => {
  it('should prevent document upload when limit reached', async () => {
    const freeUser = await createTestUser('free');
    // Upload 5 documents (free limit)
    for (let i = 0; i < 5; i++) {
      await uploadDocument(freeUser.id);
    }
    // 6th upload should fail
    await expect(uploadDocument(freeUser.id)).rejects.toThrow('Document limit reached');
  });

  it('should allow unlimited AI questions for paid tiers', async () => {
    const starterUser = await createTestUser('starter');
    // Ask 100 questions (should all succeed)
    for (let i = 0; i < 100; i++) {
      const response = await askQuestion(starterUser.id, 'test question');
      expect(response.success).toBe(true);
    }
  });

  it('should enforce free tier AI question limit', async () => {
    const freeUser = await createTestUser('free');
    // Ask 10 questions (free limit)
    for (let i = 0; i < 10; i++) {
      await askQuestion(freeUser.id, 'test question');
    }
    // 11th question should fail
    await expect(askQuestion(freeUser.id, 'test')).rejects.toThrow('AI question limit reached');
  });

  it('should block URL ingestion for free tier', async () => {
    const freeUser = await createTestUser('free');
    await expect(ingestUrl(freeUser.id, 'https://example.com')).rejects.toThrow(
      'Feature not available'
    );
  });

  it('should allow URL ingestion for paid tiers', async () => {
    const starterUser = await createTestUser('starter');
    const response = await ingestUrl(starterUser.id, 'https://example.com');
    expect(response.success).toBe(true);
  });
});
```

### 7.2 Integration Tests
```typescript
// tests/integration/limits.test.ts

describe('Limit Enforcement Integration', () => {
  it('should enforce limits across frontend and backend', async () => {
    // Test full flow from UI to database
  });

  it('should update usage counters correctly', async () => {
    // Verify counters increment and reset properly
  });

  it('should respect priority queue ordering', async () => {
    // Verify Pro users get processed before Free users
  });
});
```

---

## 8. Deployment Checklist

### Phase 1: Database Updates
- [ ] Run migration to add feature_flags column
- [ ] Update free tier limits (5 docs, 10 questions)
- [ ] Set feature flags for all existing users
- [ ] Create usage_logs and limit_violations tables
- [ ] Create database functions/triggers

### Phase 2: Backend Updates
- [ ] Deploy subscription middleware
- [ ] Apply middleware to all relevant routes
- [ ] Update Edge Functions with limit checks
- [ ] Deploy job queue system (optional)
- [ ] Add usage tracking

### Phase 3: Frontend Updates
- [ ] Update useSubscription hook with feature flags
- [ ] Deploy FeatureGate component
- [ ] Add feature gates to all premium features
- [ ] Update UI to show limit warnings
- [ ] Test upgrade flow

### Phase 4: Monitoring
- [ ] Set up usage analytics dashboard
- [ ] Configure alerts for limit violations
- [ ] Monitor queue performance
- [ ] Track conversion rates

### Phase 5: User Communication
- [ ] Email existing users about changes
- [ ] Update documentation
- [ ] Add tooltips/hints for gated features
- [ ] Provide upgrade prompts

---

## 9. Priority Implementation Order

### High Priority (Week 1)
1. ✅ Database schema updates
2. ✅ Backend middleware for document limits
3. ✅ Backend middleware for AI question limits
4. ✅ Frontend useSubscription updates
5. ✅ Basic feature gating in UI

### Medium Priority (Week 2)
6. ⏳ Edge Function limit enforcement
7. ⏳ FeatureGate component
8. ⏳ Usage tracking
9. ⏳ Comprehensive testing

### Low Priority (Week 3+)
10. ⏳ Priority queue system
11. ⏳ Analytics dashboard
12. ⏳ Advanced monitoring

---

## 10. Success Metrics

Track these KPIs after deployment:
- **Limit Hit Rate**: % of users hitting limits per tier
- **Upgrade Conversion**: % of users upgrading after hitting limits
- **Feature Usage**: Usage of gated features by tier
- **Support Tickets**: Related to limits/feature access
- **Revenue Impact**: MRR change after enforcement

