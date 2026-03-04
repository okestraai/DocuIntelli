/**
 * Financial Insights Routes
 * Plaid-based financial analysis endpoints
 */

import { Router, Request, Response } from 'express';
import { loadSubscription, checkBankAccountLimit } from '../middleware/subscriptionGuard';
import {
  createLinkToken,
  exchangePublicToken,
  getFinancialSummary,
  getConnectedAccounts,
  disconnectAccount,
  syncTransactions,
  removeAccountsAndCleanup,
  getTransactionsByCategory,
} from '../services/plaidService';
import { generateAIInsights, invalidateInsightsCache } from '../services/financialAnalyzer';
import { detectLoanPayments } from '../services/loanDetector';
import { analyzeLoanDocument } from '../services/loanAnalyzer';
import { cacheGet, cacheSet, cacheDel } from '../services/redisClient';
import { sendNotificationEmail } from '../services/emailService';
import { query } from '../services/db';

const SUMMARY_CACHE_TTL = 1800;  // 30 minutes
const ACCOUNTS_CACHE_TTL = 600;  // 10 minutes

const router = Router();

/** Invalidate all financial Redis caches + Supabase AI insights cache for a user */
async function invalidateAllFinancialCaches(userId: string): Promise<void> {
  await Promise.all([
    cacheDel(`fin_summary:${userId}`, `fin_accounts:${userId}`, `fin_goals:${userId}`),
    invalidateInsightsCache(userId),
  ]);
}

// All routes require authentication
router.use(loadSubscription);

/**
 * POST /api/financial/link-token
 * Create a Plaid Link token for the client
 */
router.post('/link-token', checkBankAccountLimit, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const platform = req.body?.platform || 'web';
    console.log(`[link-token] userId=${userId}, platform=${platform}, body=`, req.body);
    const result = await createLinkToken(userId, platform);
    res.json({
      success: true,
      link_token: result.link_token,
      ...(result.hosted_link_url && { hosted_link_url: result.hosted_link_url }),
    });
  } catch (error) {
    console.error('Error creating link token:', error);
    res.status(500).json({
      error: 'Failed to create link token',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/financial/exchange-token
 * Exchange a Plaid public token for access token and fetch initial data
 */
router.post('/exchange-token', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { public_token, institution_name } = req.body;

    if (!public_token) {
      res.status(400).json({ error: 'public_token is required' });
      return;
    }

    const result = await exchangePublicToken(
      userId,
      public_token,
      institution_name || 'Unknown Bank'
    );

    await invalidateAllFinancialCaches(userId);

    // Send bank connected email (fire-and-forget)
    const instName = institution_name || 'Unknown Bank';
    const accountNames = (result.accounts || []).map((a: any) => a.name || a.account_id);
    const profileResult = await query(
      'SELECT display_name FROM user_profiles WHERE id = $1',
      [userId]
    );
    const profile = profileResult.rows[0];
    sendNotificationEmail(userId, 'bank_account_connected', {
      userName: profile?.display_name || '',
      institutionName: instName,
      accountCount: result.accounts?.length || 0,
      accountNames,
    }).catch(() => {});

    res.json({
      success: true,
      item_id: result.itemId,
      accounts: result.accounts,
    });
  } catch (error) {
    console.error('Error exchanging token:', error);
    res.status(500).json({
      error: 'Failed to connect bank account',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/financial/summary
 * Get full financial analysis summary
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const cacheKey = `fin_summary:${userId}`;

    // Try Redis cache first — instant response
    const cached = await cacheGet<any>(cacheKey);
    if (cached) {
      // Migrate stale cache: savings_rate → net_cash_flow
      if (cached.net_cash_flow === undefined && cached.monthly_income !== undefined) {
        cached.net_cash_flow = Math.round((cached.monthly_income - cached.monthly_expenses) * 100) / 100;
        delete cached.savings_rate;
      }
      res.json(cached);
      return;
    }

    // Cache miss — build summary from DB
    const summary = await getFinancialSummary(userId);

    // Try AI enrichment (has its own 24h Supabase cache, so usually fast)
    try {
      const aiResult = await generateAIInsights(userId, summary);
      if (aiResult.insights.length > 0) {
        summary.insights = aiResult.insights;
      }
      if (aiResult.action_plan.length > 0) {
        summary.action_plan = aiResult.action_plan;
      }
      (summary as any).ai_recommendations = aiResult.ai_recommendations;
      (summary as any).account_analysis = aiResult.account_analysis;
    } catch (aiErr) {
      console.error('AI analysis failed (using rule-based):', aiErr);
    }

    const response = { success: true, ...summary };

    // Cache the full response in Redis
    await cacheSet(cacheKey, response, SUMMARY_CACHE_TTL);

    res.json(response);
  } catch (error) {
    console.error('Error generating financial summary:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('No connected accounts') ? 404 : 500;
    res.status(status).json({ error: message });
  }
});

/**
 * GET /api/financial/transactions-by-category
 * Get individual transactions for a spending category (for drill-down)
 */
router.get('/transactions-by-category', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const category = req.query.category as string;
    if (!category) {
      res.status(400).json({ error: 'category query parameter is required' });
      return;
    }
    const transactions = await getTransactionsByCategory(userId, category);
    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching transactions by category:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * GET /api/financial/accounts
 * Get connected bank accounts
 */
router.get('/accounts', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const bankLimit = req.subscription?.bank_account_limit ?? 0;
    const cacheKey = `fin_accounts:${userId}`;

    // Try Redis cache first (skip when fresh=1 to support webhook-polling for new items;
    // the webhook may clear a different Redis instance than the one this server uses)
    const skipCache = req.query.fresh === '1';
    const cached = !skipCache ? await cacheGet<any>(cacheKey) : null;
    if (cached) {
      // Migrate stale cache: add account_count if missing
      if (cached.account_count === undefined && cached.accounts) {
        cached.account_count = cached.accounts.reduce(
          (sum: number, item: any) => sum + (item.accounts?.length || 0), 0
        );
        cached.bank_count = cached.accounts.length;
      }
      // bank_limit comes from subscription (already cached), so merge it fresh
      res.json({ ...cached, bank_limit: bankLimit });
      return;
    }

    // Fetch accounts grouped by institution
    const accounts = await getConnectedAccounts(userId);

    // Count individual accounts (not institutions)
    const accountCount = accounts.reduce(
      (sum: number, item: any) => sum + (item.accounts?.length || 0), 0
    );

    const response = { success: true, accounts, bank_limit: bankLimit, bank_count: accounts.length, account_count: accountCount };
    await cacheSet(cacheKey, response, ACCOUNTS_CACHE_TTL);

    res.json(response);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({
      error: 'Failed to fetch accounts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/financial/sync
 * Trigger a manual transaction sync
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { item_id } = req.body;

    if (!item_id) {
      res.status(400).json({ error: 'item_id is required' });
      return;
    }

    const result = await syncTransactions(userId, item_id);
    // New transactions change the summary — invalidate caches
    await invalidateAllFinancialCaches(userId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error syncing transactions:', error);
    res.status(500).json({
      error: 'Failed to sync transactions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/financial/disconnect/:itemId
 * Disconnect a bank account
 */
router.delete('/disconnect/:itemId', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { itemId } = req.params;

    // Fetch institution info before disconnecting (data gets deleted)
    const itemInfoResult = await query(
      'SELECT institution_name FROM plaid_items WHERE item_id = $1 AND user_id = $2',
      [itemId, userId]
    );
    const itemInfo = itemInfoResult.rows[0];

    const acctCountResult = await query(
      'SELECT COUNT(*) AS count FROM plaid_accounts WHERE item_id = $1 AND user_id = $2',
      [itemId, userId]
    );
    const acctCount = parseInt(acctCountResult.rows[0]?.count || '0');

    await disconnectAccount(userId, itemId);
    // Clear cached AI insights so the next summary call regenerates
    // without the disconnected account's data
    await invalidateAllFinancialCaches(userId);

    // Send bank disconnected email (fire-and-forget)
    const profileResult = await query(
      'SELECT display_name FROM user_profiles WHERE id = $1',
      [userId]
    );
    const profile = profileResult.rows[0];
    sendNotificationEmail(userId, 'bank_account_disconnected', {
      userName: profile?.display_name || '',
      institutionName: itemInfo?.institution_name || 'Unknown Bank',
      accountCount: acctCount,
    }).catch(() => {});

    res.json({ success: true, message: 'Account disconnected' });
  } catch (error) {
    console.error('Error disconnecting account:', error);
    res.status(500).json({
      error: 'Failed to disconnect account',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ── Account Selection (post-Plaid-Link modal) ──────────────────

/**
 * POST /api/financial/commit-account-selection
 * Finalize which accounts to keep after Plaid Link + modal selection.
 * Deletes unchecked accounts and orphaned items.
 */
router.post('/commit-account-selection', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const subscription = req.subscription!;
    const { selected_account_ids } = req.body;

    if (!Array.isArray(selected_account_ids)) {
      res.status(400).json({ error: 'selected_account_ids must be an array' });
      return;
    }

    const bankLimit = subscription.bank_account_limit ?? 0;

    // Backend validation: total selected cannot exceed plan limit
    if (selected_account_ids.length > bankLimit) {
      res.status(400).json({
        error: 'Selected accounts exceed your plan limit',
        code: 'EXCEEDS_ACCOUNT_LIMIT',
        limit: bankLimit,
        selected: selected_account_ids.length,
      });
      return;
    }

    // Fetch all current accounts for this user
    const allAccountsResult = await query(
      'SELECT account_id FROM plaid_accounts WHERE user_id = $1',
      [userId]
    );
    const allAccounts = allAccountsResult.rows;

    if (!allAccounts) {
      res.status(500).json({ error: 'Failed to fetch accounts' });
      return;
    }

    console.log(`[commit-account-selection] user=${userId} total_in_db=${allAccounts.length} selected=${selected_account_ids.length} limit=${bankLimit}`);

    const selectedSet = new Set(selected_account_ids);
    const accountIdsToRemove = allAccounts
      .filter(a => !selectedSet.has(a.account_id))
      .map(a => a.account_id);

    console.log(`[commit-account-selection] removing ${accountIdsToRemove.length} accounts:`, accountIdsToRemove);

    const result = await removeAccountsAndCleanup(userId, accountIdsToRemove);
    await invalidateAllFinancialCaches(userId);

    // Verify final count matches expectations
    const finalCountResult = await query(
      'SELECT COUNT(*) AS count FROM plaid_accounts WHERE user_id = $1',
      [userId]
    );
    const finalCount = parseInt(finalCountResult.rows[0]?.count || '0');

    console.log(`[commit-account-selection] done: kept=${selected_account_ids.length} removed=${result.removed} verified_remaining=${finalCount}`);

    if (finalCount > bankLimit) {
      console.warn(`[commit-account-selection] WARNING: user ${userId} still has ${finalCount} accounts (limit=${bankLimit}) after commit`);
    }

    res.json({
      success: true,
      kept: selected_account_ids.length,
      removed: result.removed,
      remaining: finalCount,
    });
  } catch (error) {
    console.error('Error committing account selection:', error);
    res.status(500).json({
      error: 'Failed to commit account selection',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/financial/cancel-connection
 * Cancel a newly created Plaid connection (remove item + accounts).
 * Safety: only allows cancellation of items created within the last hour.
 */
router.post('/cancel-connection', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { item_id } = req.body;

    if (!item_id) {
      res.status(400).json({ error: 'item_id is required' });
      return;
    }

    // Safety: only allow cancellation of recently created items
    const itemResult = await query(
      'SELECT item_id, connected_at FROM plaid_items WHERE user_id = $1 AND item_id = $2',
      [userId, item_id]
    );
    const item = itemResult.rows[0];

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const connectedAt = new Date(item.connected_at);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (connectedAt < oneHourAgo) {
      res.status(400).json({
        error: 'Cannot cancel a connection older than 1 hour. Use disconnect instead.',
      });
      return;
    }

    await disconnectAccount(userId, item_id);
    await invalidateAllFinancialCaches(userId);

    res.json({ success: true, message: 'Connection cancelled' });
  } catch (error) {
    console.error('Error cancelling connection:', error);
    res.status(500).json({
      error: 'Failed to cancel connection',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ── Smart Document Prompts ──────────────────────────────────────

const PROMPT_TEXTS: Record<string, string> = {
  mortgage: 'Upload your mortgage statement for payoff analysis & refinancing opportunities',
  auto_loan: 'Upload your auto loan docs for payoff timeline & interest savings calculator',
  student_loan: 'Upload your student loan statement for repayment strategy optimization',
  personal_loan: 'Upload your loan agreement for debt consolidation analysis',
  other: 'Upload your loan statement for enhanced debt analysis',
};

/**
 * GET /api/financial/detected-loans
 * Detect loan payments from transactions and return active prompts
 */
router.get('/detected-loans', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    // Check for existing non-stale detected loans
    const existingResult = await query(
      'SELECT * FROM detected_loans WHERE user_id = $1 AND dismissed = false AND document_id IS NULL ORDER BY estimated_monthly_payment DESC LIMIT 3',
      [userId]
    );
    const existing = existingResult.rows;

    // If we have recent results (updated in last 24h), return them
    const now = new Date();
    const isStale = !existing || existing.length === 0 ||
      existing.some((l: any) => {
        const updated = new Date(l.updated_at);
        return (now.getTime() - updated.getTime()) > 24 * 60 * 60 * 1000;
      });

    if (!isStale && existing && existing.length > 0) {
      const prompts = existing.map((l: any) => ({
        ...l,
        prompt_text: PROMPT_TEXTS[l.loan_type] || PROMPT_TEXTS.other,
      }));
      res.json({ success: true, detected_loans: prompts });
      return;
    }

    // Run fresh detection from transactions
    const transactionsResult = await query(
      'SELECT * FROM plaid_transactions WHERE user_id = $1 AND pending = false AND amount > 0 ORDER BY date DESC',
      [userId]
    );
    // pg returns numeric columns as strings — normalize amounts and dates
    const transactions = transactionsResult.rows.map((t: any) => ({
      ...t,
      amount: Number(t.amount) || 0,
      date: t.date instanceof Date ? t.date.toISOString().substring(0, 10) : String(t.date),
    }));

    if (!transactions || transactions.length === 0) {
      res.json({ success: true, detected_loans: [] });
      return;
    }

    const detected = detectLoanPayments(transactions);

    // Upsert detected loans
    for (const loan of detected) {
      await query(
        `INSERT INTO detected_loans (user_id, loan_type, merchant_name, display_name, estimated_monthly_payment, frequency, confidence, first_seen_date, last_payment_date, payment_count, category, category_detailed, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (user_id, merchant_name, loan_type) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           estimated_monthly_payment = EXCLUDED.estimated_monthly_payment,
           frequency = EXCLUDED.frequency,
           confidence = EXCLUDED.confidence,
           first_seen_date = EXCLUDED.first_seen_date,
           last_payment_date = EXCLUDED.last_payment_date,
           payment_count = EXCLUDED.payment_count,
           category = EXCLUDED.category,
           category_detailed = EXCLUDED.category_detailed,
           updated_at = EXCLUDED.updated_at`,
        [
          userId, loan.loan_type, loan.merchant_name, loan.display_name,
          loan.estimated_monthly_payment, loan.frequency, loan.confidence,
          loan.first_seen_date, loan.last_payment_date, loan.payment_count,
          loan.category, loan.category_detailed, new Date().toISOString(),
        ]
      );
    }

    // Return active (non-dismissed, no doc linked) prompts
    const activeResult = await query(
      'SELECT * FROM detected_loans WHERE user_id = $1 AND dismissed = false AND document_id IS NULL ORDER BY estimated_monthly_payment DESC LIMIT 3',
      [userId]
    );
    const active = activeResult.rows;

    const prompts = (active || []).map((l: any) => ({
      ...l,
      prompt_text: PROMPT_TEXTS[l.loan_type] || PROMPT_TEXTS.other,
    }));

    res.json({ success: true, detected_loans: prompts });
  } catch (error) {
    console.error('Error detecting loans:', error);
    res.status(500).json({
      error: 'Failed to detect loan payments',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/financial/detected-loans/:id/dismiss
 * Dismiss a detected loan prompt
 */
router.post('/detected-loans/:id/dismiss', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    await query(
      'UPDATE detected_loans SET dismissed = true, dismissed_at = $1 WHERE id = $2 AND user_id = $3',
      [new Date().toISOString(), id, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error dismissing loan:', error);
    res.status(500).json({ error: 'Failed to dismiss' });
  }
});

/**
 * POST /api/financial/detected-loans/:id/link-document
 * Link an uploaded document to a detected loan and trigger analysis
 */
router.post('/detected-loans/:id/link-document', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { document_id } = req.body;

    if (!document_id) {
      res.status(400).json({ error: 'document_id is required' });
      return;
    }

    // Verify document belongs to user
    const docResult = await query(
      'SELECT id, tags FROM documents WHERE id = $1 AND user_id = $2',
      [document_id, userId]
    );
    const doc = docResult.rows[0];

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Get the detected loan
    const loanResult = await query(
      'SELECT * FROM detected_loans WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    const loan = loanResult.rows[0];

    if (!loan) {
      res.status(404).json({ error: 'Detected loan not found' });
      return;
    }

    // Link document to detected loan
    await query(
      'UPDATE detected_loans SET document_id = $1, updated_at = $2 WHERE id = $3 AND user_id = $4',
      [document_id, new Date().toISOString(), id, userId]
    );

    // Append loan-type tag to document (cap at 5 tags)
    const existingTags: string[] = doc.tags || [];
    const loanTag = loan.loan_type.replace('_', '-');
    const newTags = [...new Set([...existingTags, loanTag])].slice(0, 5);
    await query(
      'UPDATE documents SET tags = $1 WHERE id = $2',
      [newTags, document_id]
    );

    // Trigger analysis async (non-blocking)
    analyzeLoanDocument(userId, id, document_id, loan.loan_type, Number(loan.estimated_monthly_payment) || 0)
      .catch((err: any) => console.error('Async loan analysis failed:', err));

    res.json({ success: true, message: 'Document linked, analysis started' });
  } catch (error) {
    console.error('Error linking document:', error);
    res.status(500).json({ error: 'Failed to link document' });
  }
});

/**
 * GET /api/financial/analyzed-loans
 * Get loans that have linked documents (for showing analysis results)
 */
router.get('/analyzed-loans', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const loansResult = await query(
      'SELECT id, loan_type, display_name, merchant_name, estimated_monthly_payment, frequency, confidence, document_id FROM detected_loans WHERE user_id = $1 AND dismissed = false AND document_id IS NOT NULL ORDER BY estimated_monthly_payment DESC LIMIT 10',
      [userId]
    );

    // Normalize numeric fields from pg strings
    const analyzed = (loansResult.rows || []).map((l: any) => ({
      ...l,
      estimated_monthly_payment: Number(l.estimated_monthly_payment) || 0,
      confidence: Number(l.confidence) || 0,
    }));
    res.json({ success: true, analyzed_loans: analyzed });
  } catch (error) {
    console.error('Error fetching analyzed loans:', error);
    res.status(500).json({ error: 'Failed to fetch analyzed loans' });
  }
});

/**
 * GET /api/financial/loan-analysis/:detectedLoanId
 * Get the AI-generated analysis for a detected loan
 */
router.get('/loan-analysis/:detectedLoanId', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { detectedLoanId } = req.params;

    // Check for cached non-expired analysis
    const cachedResult = await query(
      'SELECT * FROM loan_analyses WHERE detected_loan_id = $1 AND user_id = $2 AND expires_at > $3 ORDER BY generated_at DESC LIMIT 1',
      [detectedLoanId, userId, new Date().toISOString()]
    );
    const cached = cachedResult.rows[0];

    if (cached) {
      res.json({ success: true, analysis: cached });
      return;
    }

    // Check if a document is linked
    const loanResult = await query(
      'SELECT * FROM detected_loans WHERE id = $1 AND user_id = $2',
      [detectedLoanId, userId]
    );
    const loan = loanResult.rows[0];

    if (!loan || !loan.document_id) {
      res.status(404).json({ error: 'No document linked to this loan yet' });
      return;
    }

    // Generate analysis on-demand
    const result = await analyzeLoanDocument(
      userId, detectedLoanId, loan.document_id, loan.loan_type, Number(loan.estimated_monthly_payment) || 0
    );

    res.json({ success: true, analysis: result });
  } catch (error) {
    console.error('Error fetching loan analysis:', error);
    res.status(500).json({ error: 'Failed to generate loan analysis' });
  }
});

export default router;
