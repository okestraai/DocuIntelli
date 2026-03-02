/**
 * Database Connection Pool
 *
 * Direct PostgreSQL connection via node-postgres (pg).
 * Replaces @supabase/supabase-js client for all database operations.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL environment variable');
  throw new Error('Missing DATABASE_URL environment variable');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=') ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database pool error:', err);
});

pool.on('connect', () => {
  console.log('✓ Database pool connection established');
});

/**
 * Execute a parameterized SQL query.
 * Uses pool.query() which automatically acquires and releases a client.
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

/**
 * Get a client from the pool for transaction use.
 * MUST call client.release() when done.
 *
 * Usage:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     // ... queries ...
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *     throw e;
 *   } finally {
 *     client.release();
 *   }
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/**
 * Gracefully shut down the pool (for clean process exit).
 */
export async function closePool(): Promise<void> {
  await pool.end();
}

export { pool };
export default { query, getClient, closePool, pool };
