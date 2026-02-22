/**
 * Financial Insights Routes
 * Plaid-based financial analysis endpoints
 */

import { Router, Request, Response } from 'express';
import { loadSubscription } from '../middleware/subscriptionGuard';
import {
  createLinkToken,
  exchangePublicToken,
  getFinancialSummary,
  getConnectedAccounts,
  disconnectAccount,
  syncTransactions,
} from '../services/plaidService';
import { generateAIInsights, invalidateInsightsCache } from '../services/financialAnalyzer';
import { detectLoanPayments } from '../services/loanDetector';
import { analyzeLoanDocument } from '../services/loanAnalyzer';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const router = Router();

// All routes require authentication
router.use(loadSubscription);

/**
 * POST /api/financial/link-token
 * Create a Plaid Link token for the client
 */
router.post('/link-token', async (req: Request, res: Response) => {
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

    // Invalidate cached AI insights so next summary reflects the new account
    await invalidateInsightsCache(userId);

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
    const summary = await getFinancialSummary(userId);

    // Enhance with AI-powered analysis (uses vLLM, falls back to rule-based)
    try {
      const aiResult = await generateAIInsights(userId, summary);
      if (aiResult.insights.length > 0) {
        summary.insights = aiResult.insights;
      }
      if (aiResult.action_plan.length > 0) {
        summary.action_plan = aiResult.action_plan;
      }
      // Attach AI recommendation text and account-level analysis
      (summary as any).ai_recommendations = aiResult.ai_recommendations;
      (summary as any).account_analysis = aiResult.account_analysis;
    } catch (aiErr) {
      console.error('AI analysis failed (using rule-based):', aiErr);
    }

    res.json({ success: true, ...summary });
  } catch (error) {
    console.error('Error generating financial summary:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('No connected accounts') ? 404 : 500;
    res.status(status).json({ error: message });
  }
});

/**
 * GET /api/financial/accounts
 * Get connected bank accounts
 */
router.get('/accounts', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const accounts = await getConnectedAccounts(userId);
    res.json({ success: true, accounts });
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

    await disconnectAccount(userId, itemId);
    // Clear cached AI insights so the next summary call regenerates
    // without the disconnected account's data
    await invalidateInsightsCache(userId);
    res.json({ success: true, message: 'Account disconnected' });
  } catch (error) {
    console.error('Error disconnecting account:', error);
    res.status(500).json({
      error: 'Failed to disconnect account',
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
    const { data: existing } = await supabase
      .from('detected_loans')
      .select('*')
      .eq('user_id', userId)
      .eq('dismissed', false)
      .is('document_id', null)
      .order('estimated_monthly_payment', { ascending: false })
      .limit(3);

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
    const { data: transactions } = await supabase
      .from('plaid_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('pending', false)
      .gt('amount', 0)
      .order('date', { ascending: false });

    if (!transactions || transactions.length === 0) {
      res.json({ success: true, detected_loans: [] });
      return;
    }

    const detected = detectLoanPayments(transactions);

    // Upsert detected loans
    for (const loan of detected) {
      await supabase
        .from('detected_loans')
        .upsert({
          user_id: userId,
          loan_type: loan.loan_type,
          merchant_name: loan.merchant_name,
          display_name: loan.display_name,
          estimated_monthly_payment: loan.estimated_monthly_payment,
          frequency: loan.frequency,
          confidence: loan.confidence,
          first_seen_date: loan.first_seen_date,
          last_payment_date: loan.last_payment_date,
          payment_count: loan.payment_count,
          category: loan.category,
          category_detailed: loan.category_detailed,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,merchant_name,loan_type' });
    }

    // Return active (non-dismissed, no doc linked) prompts
    const { data: active } = await supabase
      .from('detected_loans')
      .select('*')
      .eq('user_id', userId)
      .eq('dismissed', false)
      .is('document_id', null)
      .order('estimated_monthly_payment', { ascending: false })
      .limit(3);

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

    const { error } = await supabase
      .from('detected_loans')
      .update({ dismissed: true, dismissed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
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
    const { data: doc } = await supabase
      .from('documents')
      .select('id, tags')
      .eq('id', document_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Get the detected loan
    const { data: loan } = await supabase
      .from('detected_loans')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!loan) {
      res.status(404).json({ error: 'Detected loan not found' });
      return;
    }

    // Link document to detected loan
    await supabase
      .from('detected_loans')
      .update({ document_id, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);

    // Append loan-type tag to document (cap at 5 tags)
    const existingTags: string[] = doc.tags || [];
    const loanTag = loan.loan_type.replace('_', '-');
    const newTags = [...new Set([...existingTags, loanTag])].slice(0, 5);
    await supabase
      .from('documents')
      .update({ tags: newTags })
      .eq('id', document_id);

    // Trigger analysis async (non-blocking)
    analyzeLoanDocument(userId, id, document_id, loan.loan_type, loan.estimated_monthly_payment)
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

    const { data: loans } = await supabase
      .from('detected_loans')
      .select('id, loan_type, display_name, merchant_name, estimated_monthly_payment, frequency, confidence, document_id')
      .eq('user_id', userId)
      .eq('dismissed', false)
      .not('document_id', 'is', null)
      .order('estimated_monthly_payment', { ascending: false })
      .limit(10);

    res.json({ success: true, analyzed_loans: loans || [] });
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
    const { data: cached } = await supabase
      .from('loan_analyses')
      .select('*')
      .eq('detected_loan_id', detectedLoanId)
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      res.json({ success: true, analysis: cached });
      return;
    }

    // Check if a document is linked
    const { data: loan } = await supabase
      .from('detected_loans')
      .select('*')
      .eq('id', detectedLoanId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!loan || !loan.document_id) {
      res.status(404).json({ error: 'No document linked to this loan yet' });
      return;
    }

    // Generate analysis on-demand
    const result = await analyzeLoanDocument(
      userId, detectedLoanId, loan.document_id, loan.loan_type, loan.estimated_monthly_payment
    );

    res.json({ success: true, analysis: result });
  } catch (error) {
    console.error('Error fetching loan analysis:', error);
    res.status(500).json({ error: 'Failed to generate loan analysis' });
  }
});

export default router;
