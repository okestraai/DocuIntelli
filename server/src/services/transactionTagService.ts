/**
 * Transaction Tag Service
 * Handles user-applied tags on transactions and income streams,
 * plus learning rules for auto-tagging future transactions.
 */

import { query } from './db';
import { extractMerchantStem } from './plaidService';

// ── Predefined Tag Taxonomy ─────────────────────────────────────

const TRANSACTION_TAGS = [
  'Business Expense',
  'Tax Deductible',
  'Personal',
  'Reimbursable',
  'Subscription',
  'Essential',
  'Non-essential',
];

const INCOME_TAGS = [
  'Salary',
  'Freelance',
  'Rental Income',
  'Investment',
  'Government Benefits',
  'Side Gig',
  'Bonus',
  'Other',
];

export function getTagOptions() {
  return { transaction_tags: TRANSACTION_TAGS, income_tags: INCOME_TAGS };
}

// ── Transaction Tags ────────────────────────────────────────────

/** Batch-fetch tags for a list of transaction IDs */
export async function getTagsForTransactions(
  userId: string,
  transactionIds: string[]
): Promise<Record<string, string[]>> {
  if (transactionIds.length === 0) return {};

  const result = await query(
    `SELECT transaction_id, tag FROM transaction_tags
     WHERE user_id = $1 AND transaction_id = ANY($2)`,
    [userId, transactionIds]
  );

  const tagMap: Record<string, string[]> = {};
  for (const row of result.rows) {
    if (!tagMap[row.transaction_id]) tagMap[row.transaction_id] = [];
    tagMap[row.transaction_id].push(row.tag);
  }
  return tagMap;
}

/** Add a tag to a transaction and record a learning rule */
export async function addTransactionTag(
  userId: string,
  transactionId: string,
  tag: string
): Promise<void> {
  // Insert the tag
  await query(
    `INSERT INTO transaction_tags (user_id, transaction_id, tag)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, transaction_id, tag) DO NOTHING`,
    [userId, transactionId, tag]
  );

  // Look up the transaction to get merchant_stem for learning
  const txnResult = await query(
    `SELECT name, merchant_name FROM plaid_transactions
     WHERE user_id = $1 AND transaction_id = $2`,
    [userId, transactionId]
  );

  if (txnResult.rows.length > 0) {
    const stem = extractMerchantStem(txnResult.rows[0]);
    if (stem && stem !== 'internal transfer') {
      await recordLearningRule(userId, stem, tag);
    }
  }
}

/** Remove a tag from a transaction (does NOT remove the learning rule) */
export async function removeTransactionTag(
  userId: string,
  transactionId: string,
  tag: string
): Promise<void> {
  await query(
    `DELETE FROM transaction_tags
     WHERE user_id = $1 AND transaction_id = $2 AND tag = $3`,
    [userId, transactionId, tag]
  );
}

// ── Income Stream Tags ──────────────────────────────────────────

export interface IncomeStreamTagInfo {
  tags: string[];
  is_auto_salary_override: boolean | null;
}

/** Get all income stream tags for a user, keyed by merchant_stem */
export async function getIncomeStreamTags(
  userId: string
): Promise<Record<string, IncomeStreamTagInfo>> {
  const result = await query(
    `SELECT merchant_stem, tag, is_auto_salary_override
     FROM income_stream_tags WHERE user_id = $1`,
    [userId]
  );

  const map: Record<string, IncomeStreamTagInfo> = {};
  for (const row of result.rows) {
    if (!map[row.merchant_stem]) {
      map[row.merchant_stem] = { tags: [], is_auto_salary_override: null };
    }
    map[row.merchant_stem].tags.push(row.tag);
    // Use the most recent override (any row with non-null wins)
    if (row.is_auto_salary_override !== null) {
      map[row.merchant_stem].is_auto_salary_override = row.is_auto_salary_override;
    }
  }
  return map;
}

/** Add/update an income stream tag */
export async function setIncomeStreamTag(
  userId: string,
  merchantStem: string,
  tag: string,
  isSalaryOverride?: boolean
): Promise<void> {
  await query(
    `INSERT INTO income_stream_tags (user_id, merchant_stem, tag, is_auto_salary_override)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, merchant_stem, tag)
     DO UPDATE SET is_auto_salary_override = COALESCE($4, income_stream_tags.is_auto_salary_override)`,
    [userId, merchantStem, tag, isSalaryOverride ?? null]
  );

  // Also record as a learning rule for auto-tagging
  if (merchantStem && merchantStem !== 'internal transfer') {
    await recordLearningRule(userId, merchantStem, tag);
  }
}

/** Remove an income stream tag */
export async function removeIncomeStreamTag(
  userId: string,
  merchantStem: string,
  tag: string
): Promise<void> {
  await query(
    `DELETE FROM income_stream_tags
     WHERE user_id = $1 AND merchant_stem = $2 AND tag = $3`,
    [userId, merchantStem, tag]
  );
}

// ── Learning Engine ─────────────────────────────────────────────

/** Record or strengthen a merchant→tag learning rule */
async function recordLearningRule(
  userId: string,
  merchantStem: string,
  tag: string
): Promise<void> {
  await query(
    `INSERT INTO tag_learning_rules (user_id, merchant_stem, tag, confidence, updated_at)
     VALUES ($1, $2, $3, 1, now())
     ON CONFLICT (user_id, merchant_stem, tag)
     DO UPDATE SET confidence = tag_learning_rules.confidence + 1, updated_at = now()`,
    [userId, merchantStem, tag]
  );
}

/**
 * Auto-tag newly synced transactions using learned rules.
 * Called after syncTransactions upserts new transactions.
 */
export async function autoTagNewTransactions(
  userId: string,
  transactions: Array<{ transaction_id: string; name: string; merchant_name?: string | null }>
): Promise<number> {
  if (transactions.length === 0) return 0;

  // Build a map of merchant_stem → transaction_ids
  const stemToTxns = new Map<string, string[]>();
  for (const txn of transactions) {
    const stem = extractMerchantStem(txn);
    if (!stem || stem === 'internal transfer') continue;
    const existing = stemToTxns.get(stem) || [];
    existing.push(txn.transaction_id);
    stemToTxns.set(stem, existing);
  }

  if (stemToTxns.size === 0) return 0;

  // Fetch all matching rules
  const stems = Array.from(stemToTxns.keys());
  const rulesResult = await query(
    `SELECT merchant_stem, tag FROM tag_learning_rules
     WHERE user_id = $1 AND merchant_stem = ANY($2)`,
    [userId, stems]
  );

  if (rulesResult.rows.length === 0) return 0;

  // Apply tags
  let tagged = 0;
  for (const rule of rulesResult.rows) {
    const txnIds = stemToTxns.get(rule.merchant_stem) || [];
    for (const txnId of txnIds) {
      const insertResult = await query(
        `INSERT INTO transaction_tags (user_id, transaction_id, tag)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, transaction_id, tag) DO NOTHING`,
        [userId, txnId, rule.tag]
      );
      if ((insertResult as any).rowCount > 0) tagged++;
    }
  }

  return tagged;
}

// ── Tag Summary for LLM Context ─────────────────────────────────

export interface TagSummary {
  transaction_tag_summary: Array<{ tag: string; count: number; total: number }>;
  income_labels: Array<{ merchant_stem: string; tag: string }>;
}

/** Get a summary of user tags for LLM prompt enrichment */
export async function getTagSummaryForUser(userId: string): Promise<TagSummary> {
  // Transaction tag summary: tag → count + total amount
  const txnSummary = await query(
    `SELECT tt.tag, COUNT(*) as count, COALESCE(SUM(pt.amount), 0) as total
     FROM transaction_tags tt
     JOIN plaid_transactions pt ON pt.user_id = tt.user_id AND pt.transaction_id = tt.transaction_id
     WHERE tt.user_id = $1
     GROUP BY tt.tag
     ORDER BY count DESC`,
    [userId]
  );

  // Income labels
  const incomeSummary = await query(
    `SELECT merchant_stem, tag FROM income_stream_tags WHERE user_id = $1`,
    [userId]
  );

  return {
    transaction_tag_summary: txnSummary.rows.map(r => ({
      tag: r.tag,
      count: Number(r.count),
      total: Math.round(Number(r.total) * 100) / 100,
    })),
    income_labels: incomeSummary.rows.map(r => ({
      merchant_stem: r.merchant_stem,
      tag: r.tag,
    })),
  };
}
