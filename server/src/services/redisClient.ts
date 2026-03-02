/**
 * Redis Client Singleton
 *
 * Provides a shared Redis connection for caching, rate limiting, and
 * distributed coordination. Gracefully degrades — callers fall back
 * to DB/memory when Redis is unavailable.
 */

import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let isConnected = false;
let connectPromise: Promise<void> | null = null;

/**
 * Get the shared Redis client. Returns null if REDIS_URL is not
 * configured or if the connection has failed.
 */
export function getRedisClient(): RedisClientType | null {
  return isConnected ? client : null;
}

/**
 * Initialise the Redis connection (call once at server startup).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initRedis(): Promise<boolean> {
  if (connectPromise) return connectPromise.then(() => isConnected);

  const url = process.env.REDIS_URL;
  if (!url) {
    console.log('📦 Redis not configured (set REDIS_URL to enable caching)');
    return false;
  }

  connectPromise = (async () => {
    try {
      client = createClient({
        url,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              console.warn('📦 Redis: max reconnect attempts reached, giving up');
              return false as unknown as number;
            }
            return Math.min(retries * 500, 2000);
          },
        },
      }) as RedisClientType;

      client.on('error', (err) => {
        console.error('📦 Redis error:', err.message);
        isConnected = false;
      });

      client.on('reconnecting', () => {
        console.log('📦 Redis reconnecting…');
      });

      client.on('ready', () => {
        isConnected = true;
      });

      // Race connect against a timeout so the server can start without Redis
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('connection timeout')), 8000)
      );
      await Promise.race([client.connect(), timeout]);
      isConnected = true;
      console.log('📦 Redis connected');
    } catch (err: any) {
      console.warn('📦 Redis connection failed — falling back to in-memory:', err.message);
      // Disconnect lingering client to stop infinite reconnects
      try { await client?.disconnect(); } catch {}
      client = null;
      isConnected = false;
    }
  })();

  await connectPromise;
  return isConnected;
}

// ─── Cache helpers (safe no-ops when Redis is down) ──────────────

/**
 * Cache a JSON-serialisable value with a TTL (in seconds).
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const c = getRedisClient();
  if (!c) return;
  try {
    await c.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch {
    // Non-fatal — caller proceeds without cache
  }
}

/**
 * Retrieve a cached value, or null on miss / error.
 */
export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  const c = getRedisClient();
  if (!c) return null;
  try {
    const raw = await c.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Delete one or more cache keys (e.g. on invalidation).
 */
export async function cacheDel(...keys: string[]): Promise<void> {
  const c = getRedisClient();
  if (!c || keys.length === 0) return;
  try {
    await c.del(keys);
  } catch {
    // Non-fatal
  }
}

/**
 * Increment a numeric counter and return the new value.
 * Creates the key with value 1 if it doesn't exist.
 */
export async function cacheIncr(key: string): Promise<number | null> {
  const c = getRedisClient();
  if (!c) return null;
  try {
    return await c.incr(key);
  } catch {
    return null;
  }
}

/**
 * Decrement a numeric counter and return the new value.
 */
export async function cacheDecr(key: string): Promise<number | null> {
  const c = getRedisClient();
  if (!c) return null;
  try {
    return await c.decr(key);
  } catch {
    return null;
  }
}
