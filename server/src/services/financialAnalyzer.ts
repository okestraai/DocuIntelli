/**
 * AI Financial Analyzer
 * Uses vLLM chat to generate personalized financial insights and recommendations.
 * Falls back to rule-based analysis if vLLM is unavailable.
 */

import { query } from '../services/db';
import type { FinancialSummary } from './plaidService';
import { getTagSummaryForUser, type TagSummary } from './transactionTagService';

const INSIGHT_CACHE_TTL_HOURS = 24;

/**
 * Invalidate cached insights for a user (e.g. when a new account is connected).
 */
export async function invalidateInsightsCache(userId: string): Promise<void> {
  try {
    await query('DELETE FROM financial_insights WHERE user_id = $1', [userId]);
    console.log('🗑️ Cleared financial insights cache for user:', userId);
  } catch (err) {
    console.error('Failed to invalidate insights cache:', err);
  }
}

/**
 * Generate AI-powered financial recommendations using vLLM.
 * Results are cached in the financial_insights table for 24 hours.
 */
export interface AIInsightsResult {
  insights: string[];
  account_analysis: Record<string, string[]>;
  action_plan: FinancialSummary['action_plan'];
  ai_recommendations: string;
}

export async function generateAIInsights(
  userId: string,
  summary: FinancialSummary
): Promise<AIInsightsResult> {
  // Check cache first
  const cached = await getCachedInsights(userId);
  if (cached) {
    return cached;
  }

  const vllmChatUrl = process.env.VLLM_CHAT_URL;
  const cfAccessClientId = process.env.CF_ACCESS_CLIENT_ID;
  const cfAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  // If vLLM is not configured, return the rule-based analysis as-is
  if (!vllmChatUrl || !cfAccessClientId || !cfAccessClientSecret) {
    console.log('📊 vLLM not configured — using rule-based financial analysis');
    return {
      insights: summary.insights,
      account_analysis: {},
      action_plan: summary.action_plan,
      ai_recommendations: '',
    };
  }

  try {
    // Fetch user tag data for enriched prompts
    let tagSummary: TagSummary | null = null;
    try {
      tagSummary = await getTagSummaryForUser(userId);
    } catch { /* tag tables may not exist yet */ }

    const prompt = buildAnalysisPrompt(summary, tagSummary);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const chatResponse = await fetch(`${vllmChatUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': cfAccessClientId,
        'CF-Access-Client-Secret': cfAccessClientSecret,
      },
      body: JSON.stringify({
        model: 'hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4',
        messages: [
          { role: 'system', content: FINANCIAL_ADVISOR_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1200,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!chatResponse.ok) {
      console.error('vLLM chat error:', chatResponse.status, await chatResponse.text());
      return { insights: summary.insights, account_analysis: {}, action_plan: summary.action_plan, ai_recommendations: '' };
    }

    const result = await chatResponse.json() as any;
    const aiText = result.choices?.[0]?.message?.content || '';

    if (!aiText) {
      return { insights: summary.insights, account_analysis: {}, action_plan: summary.action_plan, ai_recommendations: '' };
    }

    // Parse AI response into structured insights
    const parsed = parseAIResponse(aiText, summary);

    // Cache the result
    await cacheInsights(userId, parsed, summary);

    return parsed;
  } catch (error) {
    console.error('AI financial analysis error:', error);
    // Fall back to rule-based
    return {
      insights: summary.insights,
      account_analysis: {},
      action_plan: summary.action_plan,
      ai_recommendations: '',
    };
  }
}

// ── System Prompt ───────────────────────────────────────────────

const FINANCIAL_ADVISOR_SYSTEM_PROMPT = `You are DocuIntelli's AI Financial Advisor. You analyze financial data to provide actionable, personalized guidance.

Rules:
- Address the user directly using "you" and "your" — never refer to them in third person as "the user"
- Be concise, specific, and encouraging
- Use exact dollar amounts from the data provided
- Provide 4-6 key aggregate insights as bullet points
- For each connected account, provide 1-2 account-specific observations
- Generate a 30-day action plan with 3-5 prioritized steps
- End with a brief personalized AI recommendation paragraph
- Never recommend specific stocks, crypto, or investment products
- Focus on budgeting, saving, debt reduction, and spending optimization
- Format sections with these headers: INSIGHTS:, ACCOUNT_ANALYSIS:, ACTION_PLAN:, RECOMMENDATION:
- Under ACCOUNT_ANALYSIS, use "## Account Name (type)" as sub-headers for each account`;

// ── Tag Section Builder ─────────────────────────────────────────

function buildTagSection(tagSummary?: TagSummary | null): string {
  if (!tagSummary) return '';
  const parts: string[] = [];

  if (tagSummary.income_labels.length > 0) {
    const lines = tagSummary.income_labels
      .map(l => `  - "${l.merchant_stem}" → ${l.tag}`)
      .join('\n');
    parts.push(`\nUSER-LABELED INCOME:\n${lines}`);
  }

  if (tagSummary.transaction_tag_summary.length > 0) {
    const lines = tagSummary.transaction_tag_summary
      .map(t => `  - ${t.tag}: ${t.count} transactions ($${t.total.toLocaleString()})`)
      .join('\n');
    parts.push(`\nUSER-TAGGED TRANSACTIONS:\n${lines}`);
  }

  return parts.length > 0 ? '\n' + parts.join('\n') : '';
}

// ── Prompt Builder ──────────────────────────────────────────────

function buildAnalysisPrompt(summary: FinancialSummary, tagSummary?: TagSummary | null): string {
  const topCategories = summary.spending_by_category
    .slice(0, 8)
    .map(c => `  - ${c.category}: $${c.monthly_average}/mo (${c.percentage}% of spending, ${c.transaction_count} txns)`)
    .join('\n');

  const recurringBillsSummary = summary.recurring_bills
    .slice(0, 10)
    .map(b => `  - ${b.name}: $${b.amount} (${b.frequency})`)
    .join('\n');

  const incomesSummary = summary.income_streams
    .map(s => `  - ${s.source}: $${s.average_amount} (${s.frequency}${s.is_salary ? ', salary' : ''})`)
    .join('\n');

  const monthlyTrends = summary.monthly_averages
    .map(m => `  - ${m.month}: Income $${m.income}, Expenses $${m.expenses}, Net ${m.net >= 0 ? '+' : ''}$${m.net}`)
    .join('\n');

  // Per-account breakdown
  const accountDetails = summary.accounts
    .map(a => `  - ${a.name} (${a.type}/${a.subtype}${a.mask ? ', ****' + a.mask : ''}): Balance $${a.current_balance.toLocaleString()} [${a.currency}]`)
    .join('\n');

  return `Analyze the following financial data and provide both aggregate insights and account-level analysis.

FINANCIAL SNAPSHOT:
- Total Balance: $${summary.total_balance.toLocaleString()}
- Monthly Income: $${summary.monthly_income.toLocaleString()}
- Monthly Expenses: $${summary.monthly_expenses.toLocaleString()}
- Net Monthly Cash Flow: $${summary.net_cash_flow.toLocaleString()}
- Number of Accounts: ${summary.accounts.length}

CONNECTED ACCOUNTS:
${accountDetails || '  (no accounts)'}

TOP SPENDING CATEGORIES:
${topCategories || '  (no data)'}

RECURRING BILLS (${summary.recurring_bills.length} detected):
${recurringBillsSummary || '  (none detected)'}

INCOME STREAMS:
${incomesSummary || '  (no recurring income detected)'}

MONTHLY TRENDS (last 6 months):
${monthlyTrends || '  (insufficient data)'}
${buildTagSection(tagSummary)}
Provide your analysis with INSIGHTS:, ACCOUNT_ANALYSIS:, ACTION_PLAN:, and RECOMMENDATION: sections.
Under ACCOUNT_ANALYSIS, provide 1-2 specific observations per account using "## Account Name (type)" sub-headers.`;
}

// ── Response Parser ─────────────────────────────────────────────

function parseAIResponse(
  aiText: string,
  fallback: FinancialSummary
): AIInsightsResult {
  // Extract sections by headers
  const insightsMatch = aiText.match(/INSIGHTS:\s*([\s\S]*?)(?=ACCOUNT_ANALYSIS:|ACTION_PLAN:|RECOMMENDATION:|$)/i);
  const accountMatch = aiText.match(/ACCOUNT_ANALYSIS:\s*([\s\S]*?)(?=ACTION_PLAN:|RECOMMENDATION:|$)/i);
  const actionMatch = aiText.match(/ACTION_PLAN:\s*([\s\S]*?)(?=RECOMMENDATION:|$)/i);
  const recoMatch = aiText.match(/RECOMMENDATION:\s*([\s\S]*?)$/i);

  // Parse insights (bullet points)
  let insights = fallback.insights;
  if (insightsMatch) {
    const parsed = insightsMatch[1]
      .split('\n')
      .map(line => line.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(line => line.length > 10);
    if (parsed.length >= 2) {
      insights = parsed;
    }
  }

  // Parse account-level analysis
  const accountAnalysis: Record<string, string[]> = {};
  if (accountMatch) {
    const accountText = accountMatch[1];
    // Split by ## headers for each account
    const accountSections = accountText.split(/##\s+/);
    for (const section of accountSections) {
      const trimmed = section.trim();
      if (trimmed.length === 0) continue;
      // First line is account name, rest are observations
      const lines = trimmed.split('\n');
      const accountName = lines[0].replace(/[*#]+/g, '').trim();
      if (accountName.length === 0) continue;
      const observations = lines.slice(1)
        .map(line => line.replace(/^[-*•\d.)\s]+/, '').trim())
        .filter(line => line.length > 10);
      if (observations.length > 0) {
        accountAnalysis[accountName] = observations;
      }
    }
  }

  // Parse action plan
  let actionPlan = fallback.action_plan;
  if (actionMatch) {
    const parsed = actionMatch[1]
      .split('\n')
      .map(line => line.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(line => line.length > 10);

    if (parsed.length >= 2) {
      actionPlan = parsed.map((text, i) => {
        // Try to extract priority from text
        let priority: 'high' | 'medium' | 'low' = i < 2 ? 'high' : i < 4 ? 'medium' : 'low';
        const lowerText = text.toLowerCase();
        if (lowerText.includes('[high]') || lowerText.includes('(high)')) priority = 'high';
        else if (lowerText.includes('[medium]') || lowerText.includes('(medium)')) priority = 'medium';
        else if (lowerText.includes('[low]') || lowerText.includes('(low)')) priority = 'low';

        // Clean priority tags from text
        const cleaned = text.replace(/\[(high|medium|low)\]|\((high|medium|low)\)/gi, '').trim();

        // Split on colon or dash to get title vs description
        const colonIdx = cleaned.indexOf(':');
        const title = colonIdx > 0 ? cleaned.slice(0, colonIdx).trim() : cleaned.slice(0, 60);
        const description = colonIdx > 0 ? cleaned.slice(colonIdx + 1).trim() : cleaned;

        return { priority, title, description };
      });
    }
  }

  // Parse recommendation paragraph
  const aiRecommendations = recoMatch
    ? recoMatch[1].trim()
    : '';

  return { insights, account_analysis: accountAnalysis, action_plan: actionPlan, ai_recommendations: aiRecommendations };
}

// ── Cache ───────────────────────────────────────────────────────

async function getCachedInsights(userId: string): Promise<AIInsightsResult | null> {
  try {
    const result = await query(
      `SELECT report_data, ai_recommendations, expires_at FROM financial_insights
       WHERE user_id = $1 AND expires_at > $2
       ORDER BY generated_at DESC LIMIT 1`,
      [userId, new Date().toISOString()]
    );

    const data = result.rows[0];
    if (!data) return null;

    const report = data.report_data as any;
    return {
      insights: report?.insights || [],
      account_analysis: report?.account_analysis || {},
      action_plan: report?.action_plan || [],
      ai_recommendations: data.ai_recommendations || '',
    };
  } catch (err) {
    console.error('Failed to fetch cached insights:', err);
    return null;
  }
}

async function cacheInsights(
  userId: string,
  parsed: AIInsightsResult,
  summary: FinancialSummary
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + INSIGHT_CACHE_TTL_HOURS);

  try {
    // Delete old insights for this user
    await query('DELETE FROM financial_insights WHERE user_id = $1', [userId]);

    // Insert fresh
    await query(
      `INSERT INTO financial_insights (user_id, report_data, ai_recommendations, generated_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        JSON.stringify({
          insights: parsed.insights,
          account_analysis: parsed.account_analysis,
          action_plan: parsed.action_plan,
          total_balance: summary.total_balance,
          monthly_income: summary.monthly_income,
          monthly_expenses: summary.monthly_expenses,
          net_cash_flow: summary.net_cash_flow,
        }),
        parsed.ai_recommendations,
        new Date().toISOString(),
        expiresAt.toISOString(),
      ]
    );
  } catch (err) {
    console.error('Failed to cache financial insights:', err);
    // Non-blocking — analysis still works without cache
  }
}
