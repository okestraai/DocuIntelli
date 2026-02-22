/**
 * Goal Suggestion Engine
 * Uses vLLM to analyze financial data and suggest relevant goals.
 * Falls back to rule-based suggestions if vLLM is unavailable.
 */

import type { FinancialSummary } from './plaidService';

export interface GoalSuggestion {
  goal_type: 'savings' | 'spending_limit' | 'debt_paydown' | 'income_target' | 'ad_hoc';
  name: string;
  suggested_target: number;
  suggested_date: string;
  reasoning: string;
  linked_account_ids: string[];
}

const GOAL_SUGGESTION_SYSTEM_PROMPT = `You are DocuIntelli's AI Financial Goal Advisor. You analyze a user's financial data and suggest 3-5 personalized financial goals.

Rules:
- Suggest goals that are realistic and based on the user's actual financial data
- Each goal must be one of these types: savings, spending_limit, debt_paydown, income_target, ad_hoc
- Provide specific dollar amounts for targets based on the data
- Set suggested dates 1-12 months in the future depending on goal ambition
- Give a brief 1-sentence reasoning for each suggestion
- Include the account_id(s) relevant to each goal
- Return ONLY a JSON array, no other text

Output format (JSON array):
[
  {
    "goal_type": "savings",
    "name": "Emergency Fund",
    "suggested_target": 5000,
    "suggested_date": "2026-08-01",
    "reasoning": "Build a 3-month emergency fund based on your $1,650/mo expenses.",
    "linked_account_ids": ["account_id_1"]
  }
]`;

function buildSuggestionPrompt(summary: FinancialSummary): string {
  const accountDetails = summary.accounts
    .map(a => `  - ${a.name} (${a.type}/${a.subtype}, id: ${a.account_id}): Balance $${a.current_balance.toLocaleString()}`)
    .join('\n');

  const topCategories = summary.spending_by_category
    .slice(0, 6)
    .map(c => `  - ${c.category}: $${c.monthly_average}/mo (${c.percentage}%)`)
    .join('\n');

  const incomes = summary.income_streams
    .map(s => `  - ${s.source}: $${s.average_amount} (${s.frequency}${s.is_salary ? ', salary' : ''})`)
    .join('\n');

  return `Based on this financial data, suggest 3-5 personalized financial goals.

FINANCIAL SNAPSHOT:
- Total Balance: $${summary.total_balance.toLocaleString()}
- Monthly Income: $${summary.monthly_income.toLocaleString()}
- Monthly Expenses: $${summary.monthly_expenses.toLocaleString()}
- Savings Rate: ${summary.savings_rate}%

ACCOUNTS:
${accountDetails || '  (none)'}

TOP SPENDING CATEGORIES:
${topCategories || '  (none)'}

INCOME STREAMS:
${incomes || '  (none)'}

RECURRING BILLS: ${summary.recurring_bills.length} detected, total ~$${summary.recurring_bills.reduce((s, b) => s + b.monthly_amount, 0).toFixed(0)}/mo

Today's date: ${new Date().toISOString().split('T')[0]}

Return ONLY a JSON array of goal suggestions.`;
}

/**
 * Generate AI-powered goal suggestions using vLLM.
 */
export async function generateGoalSuggestions(
  summary: FinancialSummary
): Promise<GoalSuggestion[]> {
  const vllmChatUrl = process.env.VLLM_CHAT_URL;
  const cfAccessClientId = process.env.CF_ACCESS_CLIENT_ID;
  const cfAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  if (!vllmChatUrl || !cfAccessClientId || !cfAccessClientSecret) {
    console.log('📊 vLLM not configured — using rule-based goal suggestions');
    return generateRuleBasedSuggestions(summary);
  }

  try {
    const prompt = buildSuggestionPrompt(summary);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${vllmChatUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': cfAccessClientId,
        'CF-Access-Client-Secret': cfAccessClientSecret,
      },
      body: JSON.stringify({
        model: 'hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4',
        messages: [
          { role: 'system', content: GOAL_SUGGESTION_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 800,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error('vLLM goal suggestion error:', response.status);
      return generateRuleBasedSuggestions(summary);
    }

    const result = await response.json() as any;
    const aiText = result.choices?.[0]?.message?.content || '';

    if (!aiText) {
      return generateRuleBasedSuggestions(summary);
    }

    // Extract JSON array from AI response
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('Failed to parse goal suggestions JSON from AI response');
      return generateRuleBasedSuggestions(summary);
    }

    const parsed = JSON.parse(jsonMatch[0]) as GoalSuggestion[];

    // Validate and sanitize each suggestion
    const validTypes = new Set(['savings', 'spending_limit', 'debt_paydown', 'income_target', 'ad_hoc']);
    const validAccountIds = new Set(summary.accounts.map(a => a.account_id));

    return parsed
      .filter(s => validTypes.has(s.goal_type) && s.suggested_target > 0 && s.name)
      .map(s => ({
        ...s,
        suggested_target: Math.round(s.suggested_target * 100) / 100,
        linked_account_ids: (s.linked_account_ids || []).filter(id => validAccountIds.has(id)),
      }))
      .slice(0, 5);
  } catch (error) {
    console.error('AI goal suggestion error:', error);
    return generateRuleBasedSuggestions(summary);
  }
}

/**
 * Rule-based fallback when vLLM is unavailable.
 */
function generateRuleBasedSuggestions(summary: FinancialSummary): GoalSuggestion[] {
  const suggestions: GoalSuggestion[] = [];
  const now = new Date();
  const savingsAccounts = summary.accounts.filter(a => a.type === 'depository');
  const creditAccounts = summary.accounts.filter(a => a.type === 'credit' || a.type === 'loan');

  // Emergency fund goal if savings < 3 months of expenses
  const threeMonthExpenses = summary.monthly_expenses * 3;
  const depositoryBalance = savingsAccounts.reduce((s, a) => s + Math.max(0, a.current_balance), 0);
  if (depositoryBalance < threeMonthExpenses && threeMonthExpenses > 0) {
    const target = Math.round((threeMonthExpenses - depositoryBalance) * 100) / 100;
    const targetDate = new Date(now);
    targetDate.setMonth(targetDate.getMonth() + 6);
    suggestions.push({
      goal_type: 'savings',
      name: 'Emergency Fund',
      suggested_target: target,
      suggested_date: targetDate.toISOString().split('T')[0],
      reasoning: `Build a 3-month emergency fund of $${threeMonthExpenses.toLocaleString()} based on your current expenses.`,
      linked_account_ids: savingsAccounts.map(a => a.account_id),
    });
  }

  // Savings rate improvement goal
  if (summary.savings_rate < 20 && summary.monthly_income > 0) {
    const monthlySavingsTarget = Math.round(summary.monthly_income * 0.2);
    const targetDate = new Date(now);
    targetDate.setMonth(targetDate.getMonth() + 3);
    suggestions.push({
      goal_type: 'spending_limit',
      name: 'Monthly Budget',
      suggested_target: Math.round(summary.monthly_income * 0.8),
      suggested_date: targetDate.toISOString().split('T')[0],
      reasoning: `Limit monthly spending to $${Math.round(summary.monthly_income * 0.8).toLocaleString()} to reach a 20% savings rate.`,
      linked_account_ids: savingsAccounts.map(a => a.account_id),
    });
  }

  // Debt paydown goal if credit balance exists
  const totalDebt = creditAccounts.reduce((s, a) => s + Math.abs(a.current_balance), 0);
  if (totalDebt > 100) {
    const target = Math.min(totalDebt, Math.round(totalDebt * 0.5));
    const targetDate = new Date(now);
    targetDate.setMonth(targetDate.getMonth() + 12);
    suggestions.push({
      goal_type: 'debt_paydown',
      name: 'Pay Down Debt',
      suggested_target: target,
      suggested_date: targetDate.toISOString().split('T')[0],
      reasoning: `Pay off $${target.toLocaleString()} of your $${Math.round(totalDebt).toLocaleString()} total debt.`,
      linked_account_ids: creditAccounts.map(a => a.account_id),
    });
  }

  // Income target if income streams exist
  if (summary.monthly_income > 0) {
    const target = Math.round(summary.monthly_income * 12 * 1.1);
    const targetDate = new Date(now);
    targetDate.setFullYear(targetDate.getFullYear() + 1);
    suggestions.push({
      goal_type: 'income_target',
      name: 'Annual Income Goal',
      suggested_target: target,
      suggested_date: targetDate.toISOString().split('T')[0],
      reasoning: `Aim for 10% income growth over the next year.`,
      linked_account_ids: savingsAccounts.map(a => a.account_id),
    });
  }

  return suggestions.slice(0, 5);
}
