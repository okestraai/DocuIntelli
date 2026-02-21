/**
 * Subscription Guard Middleware
 *
 * Enforces tier limitations and feature access across the API
 */

import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { sendNotificationEmail, resolveUserInfo } from '../services/emailService';
import { cacheGet, cacheSet, cacheDel, cacheIncr, cacheDecr } from '../services/redisClient';

const SUB_CACHE_TTL = 300;      // 5 minutes
const DOC_COUNT_CACHE_TTL = 120; // 2 minutes
const DEVICE_CACHE_TTL = 60;    // 1 minute — shorter since device state changes more often

const DEVICE_LIMITS: Record<string, number> = {
  free: 1,
  starter: 2,
  pro: 5,
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface FeatureFlags {
  url_ingestion: boolean;
  ocr_enabled: boolean;
  auto_tags: boolean;
  background_embedding: boolean;
  priority_queue: number;
  email_notifications: boolean;
  multi_device_sync: boolean;
  priority_support: boolean;
  global_search: boolean;
}

export interface SubscriptionInfo {
  id: string;
  user_id: string;
  plan: 'free' | 'starter' | 'pro';
  status: 'active' | 'canceled' | 'expired' | 'trialing' | 'canceling';
  document_limit: number;
  ai_questions_limit: number;
  ai_questions_used: number;
  monthly_upload_limit: number;
  monthly_uploads_used: number;
  monthly_upload_reset_date: string;
  feature_flags: FeatureFlags;
  stripe_subscription_id?: string | null;
  current_period_end?: string | null;
  pending_plan?: string | null;
  documents_to_keep?: string[] | null;
  payment_status?: 'active' | 'past_due' | 'restricted' | 'downgraded';
  dunning_step?: number;
  payment_failed_at?: string | null;
  restricted_at?: string | null;
  deletion_scheduled_at?: string | null;
  previous_plan?: string | null;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      subscription?: SubscriptionInfo;
      userId?: string;
      deviceId?: string;
    }
  }
}

/**
 * Middleware to load user subscription info
 * This should be the first middleware in the chain
 */
export async function loadSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get user ID from auth header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'No authorization header' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      res.status(401).json({ error: 'Invalid authentication token' });
      return;
    }

    req.userId = user.id;

    // Capture device ID from header (if present)
    const deviceId = req.headers['x-device-id'] as string | undefined;
    if (deviceId) {
      req.deviceId = deviceId;
    }

    // Load subscription — try Redis cache first
    const cacheKey = `sub:${user.id}`;
    const cached = await cacheGet<SubscriptionInfo>(cacheKey);

    if (cached) {
      req.subscription = cached;
    } else {
      const { data: subscription, error: subError } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (subError || !subscription) {
        // Create default free subscription if not exists
        const { data: newSub, error: createError } = await supabase
          .from('user_subscriptions')
          .insert({
            user_id: user.id,
            plan: 'free',
            status: 'active',
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating subscription:', createError);
          res.status(500).json({ error: 'Failed to create subscription' });
          return;
        }

        req.subscription = newSub as SubscriptionInfo;
        await cacheSet(cacheKey, newSub, SUB_CACHE_TTL);

        // New user — send welcome email (non-blocking)
        resolveUserInfo(user.id).then(userInfo => {
          if (userInfo) {
            sendNotificationEmail(user.id, 'welcome', {
              userName: userInfo.userName,
              email: userInfo.email,
            }).catch(err => console.error('📧 Welcome email failed:', err));
          }
        });
      } else {
        req.subscription = subscription as SubscriptionInfo;
        await cacheSet(cacheKey, subscription, SUB_CACHE_TTL);
      }
    }

    // ── Device limit enforcement ─────────────────────────────────
    if (req.deviceId && req.subscription) {
      try {
        const blocked = await enforceDeviceLimit(
          req, res, req.userId!, req.deviceId, req.subscription
        );
        if (blocked) return; // 403 already sent
      } catch (deviceErr) {
        console.error('Device tracking error (non-blocking):', deviceErr);
      }
    }

    next();
  } catch (error) {
    console.error('Subscription guard error:', error);
    res.status(500).json({ error: 'Failed to load subscription' });
  }
}

/**
 * Middleware to block write operations when user's payment is restricted.
 * Returns 402 Payment Required so the frontend can show the DunningBanner.
 * Read-only endpoints should NOT use this middleware.
 */
export function checkDunningRestriction(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const subscription = req.subscription;
  if (!subscription) {
    next();
    return;
  }

  const paymentStatus = subscription.payment_status || 'active';

  if (paymentStatus === 'restricted' || paymentStatus === 'downgraded') {
    res.status(402).json({
      error: 'Account restricted due to unpaid balance',
      code: 'PAYMENT_REQUIRED',
      payment_status: paymentStatus,
      dunning_step: subscription.dunning_step || 0,
      deletion_scheduled_at: subscription.deletion_scheduled_at || null,
      message: paymentStatus === 'restricted'
        ? 'Your account is restricted because payment failed. Update your payment method to restore access.'
        : 'Your account has been downgraded to Free due to non-payment. Resubscribe to restore your plan.',
    });
    return;
  }

  next();
}

/**
 * Middleware to check if user can upload more documents
 */
export async function checkDocumentLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    const subscription = req.subscription;

    if (!subscription || !userId) {
      res.status(403).json({ error: 'Subscription not loaded' });
      return;
    }

    // Count user's current documents — try Redis cache first
    const countCacheKey = `doc_count:${userId}`;
    let currentCount: number;
    const cachedCount = await cacheGet<number>(countCacheKey);

    if (cachedCount !== null) {
      currentCount = cachedCount;
    } else {
      const { count, error } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      currentCount = count || 0;
      await cacheSet(countCacheKey, currentCount, DOC_COUNT_CACHE_TTL);
    }

    if (currentCount >= subscription.document_limit) {
      // Log limit violation
      await logLimitViolation(userId, 'document', currentCount, subscription.document_limit);

      res.status(403).json({
        error: 'Document limit reached',
        code: 'DOCUMENT_LIMIT_EXCEEDED',
        limit: subscription.document_limit,
        current: currentCount,
        plan: subscription.plan,
        upgrade_required: true,
        message: `You've reached your ${subscription.plan} plan limit of ${subscription.document_limit} documents. Upgrade to upload more.`,
      });
      return;
    }

    const usagePercent = Math.round((currentCount / subscription.document_limit) * 100);

    // Send usage limit warning at 80% threshold (non-blocking, one-time)
    if (usagePercent >= 80 && usagePercent < 100 && userId) {
      resolveUserInfo(userId).then(userInfo => {
        if (userInfo) {
          sendNotificationEmail(userId, 'usage_limit_warning', {
            userName: userInfo.userName,
            limitType: 'documents',
            currentUsage: currentCount,
            limit: subscription.document_limit,
            plan: subscription.plan,
          }).catch(() => {}); // Silently ignore email errors
        }
      });
    }

    // Add metadata to request for logging
    req.body._limitCheck = {
      type: 'document',
      current: currentCount,
      limit: subscription.document_limit,
      usage_percent: usagePercent,
    };

    next();
  } catch (error) {
    console.error('Document limit check error:', error);
    res.status(500).json({ error: 'Failed to check document limit' });
  }
}

/**
 * Middleware to check if user has remaining monthly upload quota
 */
export async function checkMonthlyUploadLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    const subscription = req.subscription;

    if (!subscription || !userId) {
      res.status(403).json({ error: 'Subscription not loaded' });
      return;
    }

    if (subscription.monthly_uploads_used >= subscription.monthly_upload_limit) {
      await logLimitViolation(userId, 'monthly_upload', subscription.monthly_uploads_used, subscription.monthly_upload_limit);

      res.status(403).json({
        error: 'Monthly upload limit reached',
        code: 'MONTHLY_UPLOAD_LIMIT_EXCEEDED',
        limit: subscription.monthly_upload_limit,
        current: subscription.monthly_uploads_used,
        plan: subscription.plan,
        upgrade_required: true,
        message: `You've reached your ${subscription.plan} plan limit of ${subscription.monthly_upload_limit} uploads this month. Upgrade to upload more.`,
      });
      return;
    }

    const usagePercent = Math.round((subscription.monthly_uploads_used / subscription.monthly_upload_limit) * 100);

    if (usagePercent >= 80 && usagePercent < 100 && userId) {
      resolveUserInfo(userId).then(userInfo => {
        if (userInfo) {
          sendNotificationEmail(userId, 'usage_limit_warning', {
            userName: userInfo.userName,
            limitType: 'monthly uploads',
            currentUsage: subscription.monthly_uploads_used,
            limit: subscription.monthly_upload_limit,
            plan: subscription.plan,
          }).catch(() => {});
        }
      });
    }

    next();
  } catch (error) {
    console.error('Monthly upload limit check error:', error);
    res.status(500).json({ error: 'Failed to check monthly upload limit' });
  }
}

/**
 * Increment the monthly upload counter after a successful upload.
 * Applies to ALL plans (unlike AI questions which only counts free).
 */
export async function incrementMonthlyUploads(
  subscriptionId: string,
  currentCount: number
): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_subscriptions')
      .update({
        monthly_uploads_used: currentCount + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscriptionId);

    if (error) {
      console.error('Error incrementing monthly uploads:', error);
    }
  } catch (err) {
    console.error('Error incrementing monthly uploads:', err);
    // Don't throw — this should not block the upload
  }
}

/**
 * Middleware to check if user can ask more AI questions
 */
export async function checkAIQuestionLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    const subscription = req.subscription;

    if (!subscription || !userId) {
      res.status(403).json({ error: 'Subscription not loaded' });
      return;
    }

    // Paid plans have unlimited questions
    if (subscription.plan !== 'free') {
      next();
      return;
    }

    // Check free tier limit
    if (subscription.ai_questions_used >= subscription.ai_questions_limit) {
      // Log limit violation
      await logLimitViolation(
        userId,
        'ai_question',
        subscription.ai_questions_used,
        subscription.ai_questions_limit
      );

      res.status(403).json({
        error: 'AI question limit reached',
        code: 'AI_QUESTION_LIMIT_EXCEEDED',
        limit: subscription.ai_questions_limit,
        current: subscription.ai_questions_used,
        plan: subscription.plan,
        upgrade_required: true,
        message: `You've reached your ${subscription.plan} plan limit of ${subscription.ai_questions_limit} AI questions this month. Upgrade for unlimited questions.`,
      });
      return;
    }

    // Add metadata to request
    req.body._limitCheck = {
      type: 'ai_question',
      current: subscription.ai_questions_used,
      limit: subscription.ai_questions_limit,
      usage_percent: Math.round(
        (subscription.ai_questions_used / subscription.ai_questions_limit) * 100
      ),
    };

    next();
  } catch (error) {
    console.error('AI question limit check error:', error);
    res.status(500).json({ error: 'Failed to check AI question limit' });
  }
}

/**
 * Middleware factory to check feature access
 * Usage: app.use(requireFeature('url_ingestion'))
 */
export function requireFeature(featureName: keyof FeatureFlags) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const subscription = req.subscription;

    if (!subscription) {
      res.status(403).json({ error: 'Subscription not loaded' });
      return;
    }

    const hasFeature = subscription.feature_flags?.[featureName];

    // Handle boolean features
    if (typeof hasFeature === 'boolean' && !hasFeature) {
      res.status(403).json({
        error: `Feature '${featureName}' not available`,
        code: 'FEATURE_NOT_AVAILABLE',
        feature: featureName,
        plan: subscription.plan,
        upgrade_required: true,
        message: `${getFeatureName(featureName)} is not available in the ${subscription.plan} plan. Upgrade to access this feature.`,
      });
      return;
    }

    // Handle numeric features (like priority_queue)
    if (featureName === 'priority_queue' && hasFeature === 0) {
      res.status(403).json({
        error: 'Priority queue not available',
        code: 'FEATURE_NOT_AVAILABLE',
        feature: featureName,
        plan: subscription.plan,
        upgrade_required: true,
        message: `Priority processing is not available in the ${subscription.plan} plan.`,
      });
      return;
    }

    // Add priority level to request if applicable
    if (featureName === 'priority_queue') {
      req.body._priority = hasFeature;
    }

    next();
  };
}

/**
 * Middleware to increment AI question counter
 * Should be called after a successful AI question
 */
export async function incrementAIQuestions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    const subscription = req.subscription;

    if (!subscription || !userId) {
      // Don't block the request, just log
      console.warn('Cannot increment AI questions: subscription not loaded');
      next();
      return;
    }

    // Only increment for free tier (paid tiers have unlimited)
    if (subscription.plan === 'free') {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({
          ai_questions_used: subscription.ai_questions_used + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);

      if (error) {
        console.error('Error incrementing AI questions:', error);
      }

      // Log usage
      await logFeatureUsage(userId, 'ai_question', {
        count: subscription.ai_questions_used + 1,
        limit: subscription.ai_questions_limit,
      });
    }

    next();
  } catch (error) {
    console.error('Error in incrementAIQuestions middleware:', error);
    // Don't block the request
    next();
  }
}

/**
 * Helper function to get human-readable feature name
 */
function getFeatureName(feature: keyof FeatureFlags): string {
  const names: Record<keyof FeatureFlags, string> = {
    url_ingestion: 'URL Ingestion',
    ocr_enabled: 'OCR',
    auto_tags: 'Auto Tag Generation',
    background_embedding: 'Background Embedding',
    priority_queue: 'Priority Processing',
    email_notifications: 'Email Notifications',
    multi_device_sync: 'Multi-Device Sync',
    priority_support: 'Priority Support',
    global_search: 'Global Search',
  };
  return names[feature] || feature;
}

// ─── Device enforcement ─────────────────────────────────────────

/**
 * Register or validate a device for the current user.
 * Returns true if the request was blocked (403 sent), false if allowed.
 */
async function enforceDeviceLimit(
  req: Request,
  res: Response,
  userId: string,
  deviceId: string,
  subscription: SubscriptionInfo
): Promise<boolean> {
  const plan = subscription.plan;
  const limit = DEVICE_LIMITS[plan] || 1;
  const ua = req.headers['user-agent'] || '';

  // 1. Upsert: register device or update last_active_at
  const { data: upsertedDevice, error: upsertError } = await supabase
    .from('user_devices')
    .upsert(
      {
        user_id: userId,
        device_id: deviceId,
        device_name: parseDeviceName(ua),
        platform: parsePlatform(ua),
        user_agent: ua.slice(0, 500),
        last_active_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,device_id' }
    )
    .select('is_blocked')
    .single();

  if (upsertError) {
    // Non-fatal — log and allow the request through
    console.error('Device upsert error:', upsertError.message);
    return false;
  }

  // 2. Check if this device is soft-blocked (e.g. from a downgrade)
  if (upsertedDevice?.is_blocked) {
    res.status(403).json({
      error: 'Device blocked',
      code: 'DEVICE_BLOCKED',
      plan,
      limit,
      upgrade_required: true,
      message: 'This device has been deactivated due to a plan change. Remove unused devices or upgrade to continue using this device.',
    });
    return true;
  }

  // 3. Count active (non-blocked) devices — Redis-cached
  const countCacheKey = `device_count:${userId}`;
  let activeCount: number;

  const cachedCount = await cacheGet<number>(countCacheKey);
  if (cachedCount !== null) {
    activeCount = cachedCount;
  } else {
    const { count, error: countError } = await supabase
      .from('user_devices')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_blocked', false);

    if (countError) {
      console.error('Device count error:', countError.message);
      return false;
    }
    activeCount = count || 0;
    await cacheSet(countCacheKey, activeCount, DEVICE_CACHE_TTL);
  }

  // 4. If over limit, check if THIS device is among the most recent N
  if (activeCount > limit) {
    const { data: allowedDevices } = await supabase
      .from('user_devices')
      .select('device_id')
      .eq('user_id', userId)
      .eq('is_blocked', false)
      .order('last_active_at', { ascending: false })
      .limit(limit);

    const allowedIds = (allowedDevices || []).map(d => d.device_id);

    if (!allowedIds.includes(deviceId)) {
      // Soft-block this device
      await supabase
        .from('user_devices')
        .update({ is_blocked: true })
        .eq('user_id', userId)
        .eq('device_id', deviceId);

      await cacheDel(countCacheKey);

      res.status(403).json({
        error: 'Device limit exceeded',
        code: 'DEVICE_LIMIT_EXCEEDED',
        limit,
        current: activeCount,
        plan,
        upgrade_required: true,
        message: `Your ${plan} plan allows ${limit} device${limit > 1 ? 's' : ''}. Remove a device or upgrade to add more.`,
      });
      return true;
    }
  }

  return false;
}

// ─── User-Agent parsing helpers ─────────────────────────────────

function parsePlatform(ua: string): string {
  const lower = ua.toLowerCase();
  if (lower.includes('expo') || lower.includes('react-native')) {
    if (lower.includes('android')) return 'android';
    if (lower.includes('iphone') || lower.includes('ipad')) return 'ios';
    return 'mobile';
  }
  if (lower.includes('android')) return 'android';
  if (lower.includes('iphone') || lower.includes('ipad')) return 'ios';
  if (lower.includes('macintosh') || lower.includes('mac os')) return 'web-mac';
  if (lower.includes('windows')) return 'web-windows';
  if (lower.includes('linux')) return 'web-linux';
  return 'web';
}

function parseDeviceName(ua: string): string {
  let browser = 'Browser';
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

  let os = '';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Linux') && !ua.includes('Android')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone')) os = 'iPhone';
  else if (ua.includes('iPad')) os = 'iPad';

  return os ? `${browser} on ${os}` : browser;
}

/**
 * Log feature usage for analytics
 */
async function logFeatureUsage(
  userId: string,
  feature: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await supabase.from('usage_logs').insert({
      user_id: userId,
      feature,
      metadata,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error logging feature usage:', error);
    // Don't throw - logging should not break the app
  }
}

/**
 * Log limit violation for monitoring
 */
async function logLimitViolation(
  userId: string,
  limitType: 'document' | 'ai_question' | 'monthly_upload' | 'device',
  currentValue: number,
  limitValue: number
): Promise<void> {
  try {
    await supabase.from('limit_violations').insert({
      user_id: userId,
      limit_type: limitType,
      current_value: currentValue,
      limit_value: limitValue,
      timestamp: new Date().toISOString(),
    });

    console.warn(
      `🚫 Limit violation: User ${userId} hit ${limitType} limit (${currentValue}/${limitValue})`
    );
  } catch (error) {
    console.error('Error logging limit violation:', error);
    // Don't throw - logging should not break the app
  }
}

/**
 * Export feature usage logger for use in other modules
 */
export { logFeatureUsage };

// ─── Cache invalidation helpers ──────────────────────────────────

/**
 * Invalidate the cached subscription for a user.
 * Call after plan changes, upgrades, downgrades, cancellations.
 */
export async function invalidateSubscriptionCache(userId: string): Promise<void> {
  await cacheDel(`sub:${userId}`);
}

/**
 * Invalidate the cached document count for a user.
 * Call after uploads or deletions.
 */
export async function invalidateDocCountCache(userId: string): Promise<void> {
  await cacheDel(`doc_count:${userId}`);
}

/**
 * Invalidate the cached device count for a user.
 * Call after device removal or plan changes.
 */
export async function invalidateDeviceCountCache(userId: string): Promise<void> {
  await cacheDel(`device_count:${userId}`);
}

/** Device limits by plan — exported for use in routes */
export { DEVICE_LIMITS };
