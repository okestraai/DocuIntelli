/**
 * Plaid Service
 * Handles Plaid Link token creation, public token exchange,
 * transaction fetching, and financial analysis.
 */

import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from 'plaid';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Plaid client
function getPlaidClient(): PlaidApi {
  const config = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  });
  return new PlaidApi(config);
}

const plaidClient = getPlaidClient();

// ── Link Token ──────────────────────────────────────────────────

// Persisted mapping of link_token → user_id for Hosted Link webhook flow.
// When using Hosted Link, the public_token arrives via webhook (not redirect URL),
// so we need to know which user the link_token belongs to.
// Stored in DB (plaid_link_tokens table) so it survives server restarts.

export async function getUserIdForLinkToken(linkToken: string): Promise<string | undefined> {
  const { data } = await supabase
    .from('plaid_link_tokens')
    .select('user_id')
    .eq('link_token', linkToken)
    .is('used_at', null)
    .single();
  return data?.user_id;
}

async function storeLinkTokenMapping(linkToken: string, userId: string): Promise<void> {
  console.log(`[Plaid] Storing link_token mapping: token=${linkToken.substring(0, 20)}..., userId=${userId}`);
  const { data, error } = await supabase
    .from('plaid_link_tokens')
    .upsert({ link_token: linkToken, user_id: userId }, { onConflict: 'link_token' })
    .select();
  if (error) {
    console.error('[Plaid] Failed to store link_token mapping:', error);
  } else {
    console.log('[Plaid] link_token mapping stored successfully:', data);
  }
}

export async function markLinkTokenUsed(linkToken: string): Promise<void> {
  await supabase
    .from('plaid_link_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('link_token', linkToken);
}

export async function createLinkToken(
  userId: string,
  platform?: 'web' | 'mobile',
): Promise<{ link_token: string; hosted_link_url?: string }> {
  const webhookUrl = process.env.APP_URL
    ? `${process.env.APP_URL}/api/plaid-webhook`
    : undefined;

  const isMobile = platform === 'mobile';

  const linkRequest: any = {
    user: { client_user_id: userId },
    client_name: 'DocuIntelli AI',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
    ...(webhookUrl && { webhook: webhookUrl }),
  };

  if (isMobile) {
    // redirect_uri MUST exactly match what's registered in the Plaid Dashboard (HTTPS).
    const appUrl = (process.env.APP_URL || 'https://app.docuintelli.com').replace(/\/+$/, '');
    const redirectUri = `${appUrl}/plaid-callback`;
    linkRequest.redirect_uri = redirectUri;

    // Hosted Link config for mobile:
    // - completion_redirect_uri: same HTTPS URL — the InAppBrowser detects completion
    //   via page content ("Bank Connected" text) rather than URL scheme interception,
    //   since Expo doesn't register a custom URL scheme.
    // - is_mobile_app: required for Hosted Link on native apps
    linkRequest.hosted_link = {
      completion_redirect_uri: redirectUri,
      is_mobile_app: true,
    };
  }

  console.log('[Plaid] linkTokenCreate request:', JSON.stringify(linkRequest, null, 2));

  try {
    const response = await plaidClient.linkTokenCreate(linkRequest);
    const data = response.data as any;

    console.log('[Plaid] linkTokenCreate response keys:', Object.keys(data));
    console.log('[Plaid] hosted_link_url:', data.hosted_link_url);

    // Persist link_token → user_id mapping ONLY for Hosted Link (mobile) flows.
    // On web, the client exchanges the token via postMessage — no webhook needed.
    console.log(`[Plaid] isMobile=${isMobile}, platform=${platform} — ${isMobile ? 'WILL' : 'SKIP'} store link_token mapping`);
    if (isMobile) {
      await storeLinkTokenMapping(data.link_token, userId);
    }

    return {
      link_token: data.link_token,
      hosted_link_url: data.hosted_link_url || undefined,
    };
  } catch (err: any) {
    console.error('[Plaid] linkTokenCreate FAILED:', {
      status: err.response?.status,
      data: err.response?.data,
      message: err.message,
    });
    throw err;
  }
}

// ── Token Exchange & Account Storage ────────────────────────────

export async function exchangePublicToken(
  userId: string,
  publicToken: string,
  institutionName: string
): Promise<{ itemId: string; accounts: any[] }> {
  // Exchange public token for access token
  const exchangeResponse = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });

  const accessToken = exchangeResponse.data.access_token;
  const itemId = exchangeResponse.data.item_id;

  // Resolve institution name — webhook doesn't include it, so fetch from Plaid API
  let resolvedName = institutionName;
  if (!resolvedName || resolvedName === 'Connected Bank') {
    try {
      const itemResponse = await plaidClient.itemGet({ access_token: accessToken });
      const institutionId = itemResponse.data.item.institution_id;
      if (institutionId) {
        const instResponse = await plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
        });
        resolvedName = instResponse.data.institution.name || resolvedName;
        console.log(`[Plaid] Resolved institution name: ${resolvedName} (id=${institutionId})`);
      }
    } catch (nameErr) {
      console.warn('[Plaid] Could not resolve institution name:', nameErr);
    }
  }

  // Fetch account balances from Plaid BEFORE storing anything in our DB.
  // This ensures the item + accounts appear atomically to polling clients.
  const balanceResponse = await plaidClient.accountsBalanceGet({
    access_token: accessToken,
  });

  const accounts = balanceResponse.data.accounts.map(acct => ({
    account_id: acct.account_id,
    name: acct.name,
    official_name: acct.official_name,
    type: acct.type,
    subtype: acct.subtype,
    mask: acct.mask,
    current_balance: acct.balances.current,
    available_balance: acct.balances.available,
    currency: acct.balances.iso_currency_code || 'USD',
  }));

  // Store accounts FIRST (before the item) so that when getConnectedAccounts()
  // sees the new plaid_items row, the plaid_accounts rows already exist.
  // This prevents the UI from briefly showing the institution with no accounts.
  for (const account of accounts) {
    await supabase.from('plaid_accounts').upsert({
      user_id: userId,
      item_id: itemId,
      account_id: account.account_id,
      name: account.name,
      official_name: account.official_name,
      type: account.type,
      subtype: account.subtype,
      mask: account.mask,
      initial_balance: account.current_balance,
      currency: account.currency,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'user_id,account_id' });
  }

  // Now store the item — polling detects new items via plaid_items,
  // so accounts are guaranteed to exist by the time the item appears.
  const { error: upsertError } = await supabase
    .from('plaid_items')
    .upsert({
      user_id: userId,
      item_id: itemId,
      access_token: accessToken,
      institution_name: resolvedName,
      connected_at: new Date().toISOString(),
    }, { onConflict: 'user_id,item_id' });

  if (upsertError) {
    console.error('Error storing Plaid item:', upsertError);
    throw new Error('Failed to store bank connection');
  }

  // Trigger initial transaction sync (non-blocking for the UI)
  syncTransactions(userId, itemId, accessToken).catch(err =>
    console.error('[Plaid] Background transaction sync failed:', err)
  );

  return { itemId, accounts };
}

// ── Transaction Sync ────────────────────────────────────────────

export async function syncTransactions(
  userId: string,
  itemId: string,
  accessToken?: string
): Promise<{ added: number; modified: number; removed: number }> {
  // Get access token if not provided
  if (!accessToken) {
    const { data } = await supabase
      .from('plaid_items')
      .select('access_token')
      .eq('user_id', userId)
      .eq('item_id', itemId)
      .single();

    if (!data) throw new Error('Plaid item not found');
    accessToken = data.access_token;
  }

  // Fetch last 6 months of transactions
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const startDate = sixMonthsAgo.toISOString().split('T')[0];
  const endDate = new Date().toISOString().split('T')[0];

  let allTransactions: any[] = [];
  let hasMore = true;
  let offset = 0;

  while (hasMore) {
    const response = await plaidClient.transactionsGet({
      access_token: accessToken!,
      start_date: startDate,
      end_date: endDate,
      options: { count: 500, offset },
    });

    allTransactions = allTransactions.concat(response.data.transactions);
    hasMore = allTransactions.length < response.data.total_transactions;
    offset = allTransactions.length;
  }

  // Store transactions
  let added = 0, modified = 0, removed = 0;

  for (const txn of allTransactions) {
    const { error } = await supabase.from('plaid_transactions').upsert({
      user_id: userId,
      item_id: itemId,
      transaction_id: txn.transaction_id,
      account_id: txn.account_id,
      amount: txn.amount,
      date: txn.date,
      name: txn.name,
      merchant_name: txn.merchant_name,
      category: txn.personal_finance_category?.primary || txn.category?.[0] || 'OTHER',
      category_detailed: txn.personal_finance_category?.detailed || txn.category?.join(' > ') || null,
      pending: txn.pending,
      payment_channel: txn.payment_channel,
      currency: txn.iso_currency_code || 'USD',
    }, { onConflict: 'user_id,transaction_id' });

    if (!error) added++;
  }

  // Update sync timestamp
  await supabase
    .from('plaid_items')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('item_id', itemId);

  return { added, modified, removed };
}

// ── Financial Analysis ──────────────────────────────────────────

export interface FinancialSummary {
  accounts: AccountSummary[];
  spending_by_category: CategoryBreakdown[];
  recurring_bills: RecurringBill[];
  income_streams: IncomeStream[];
  monthly_averages: MonthlyAverage[];
  insights: string[];
  action_plan: ActionItem[];
  total_balance: number;
  monthly_income: number;
  monthly_expenses: number;
  savings_rate: number;
}

interface AccountSummary {
  account_id: string;
  name: string;
  type: string;
  subtype: string;
  mask: string;
  current_balance: number;
  currency: string;
}

interface CategoryBreakdown {
  category: string;
  total: number;
  percentage: number;
  transaction_count: number;
  monthly_average: number;
}

interface RecurringBill {
  name: string;
  merchant: string | null;
  amount: number;
  monthly_amount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  category: string;
  last_date: string;
  next_expected: string;
}

interface IncomeStream {
  source: string;
  average_amount: number;
  monthly_amount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  is_salary: boolean;
  last_date: string;
}

interface MonthlyAverage {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

interface ActionItem {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  potential_savings?: number;
}

export async function getFinancialSummary(userId: string): Promise<FinancialSummary> {
  // Only fetch transactions from the last 12 months for summary calculations
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const cutoffDate = twelveMonthsAgo.toISOString().split('T')[0];

  // Fetch accounts and transactions in parallel
  const [{ data: accounts }, { data: transactions }] = await Promise.all([
    supabase
      .from('plaid_accounts')
      .select('*')
      .eq('user_id', userId),
    supabase
      .from('plaid_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('pending', false)
      .gte('date', cutoffDate)
      .order('date', { ascending: false }),
  ]);

  if (!accounts || accounts.length === 0) {
    throw new Error('No connected accounts found. Please connect a bank account first.');
  }

  if (!transactions) {
    throw new Error('Failed to load transactions');
  }

  // Account types where the balance represents money OWED (liabilities)
  const liabilityTypes = new Set(['credit', 'loan']);

  // Build account summaries — calculate current balance from initial + transactions
  const accountSummaries: AccountSummary[] = accounts.map(acct => {
    const acctTxns = transactions.filter(t => t.account_id === acct.account_id);
    // Plaid amounts: positive = money out, negative = money in
    const txnSum = acctTxns.reduce((sum, t) => sum + t.amount, 0);
    const rawBalance = (acct.initial_balance || 0) - txnSum;

    // For credit/loan accounts, Plaid reports balance as amount owed (positive).
    // Negate it so it contributes correctly to net worth.
    const isLiability = liabilityTypes.has(acct.type);
    const currentBalance = isLiability ? -Math.abs(rawBalance) : rawBalance;

    return {
      account_id: acct.account_id,
      name: acct.name,
      type: acct.type,
      subtype: acct.subtype || '',
      mask: acct.mask || '',
      current_balance: Math.round(currentBalance * 100) / 100,
      currency: acct.currency || 'USD',
    };
  });

  // Total balance = net worth (assets minus liabilities)
  const totalBalance = accountSummaries.reduce((sum, a) => sum + a.current_balance, 0);

  // Separate income vs expenses (Plaid: positive = debit/expense, negative = credit/income)
  const expenses = transactions.filter(t => t.amount > 0);
  const incomeTransactions = transactions.filter(t => t.amount < 0);

  // Spending by category
  const categoryMap = new Map<string, { total: number; count: number }>();
  for (const txn of expenses) {
    const cat = txn.category || 'OTHER';
    const existing = categoryMap.get(cat) || { total: 0, count: 0 };
    existing.total += txn.amount;
    existing.count++;
    categoryMap.set(cat, existing);
  }

  const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
  const months = getMonthSpan(transactions);
  const monthCount = Math.max(months.length, 1);

  const spendingByCategory: CategoryBreakdown[] = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category: formatCategoryName(category),
      total: Math.round(data.total * 100) / 100,
      percentage: totalExpenses > 0 ? Math.round((data.total / totalExpenses) * 100) : 0,
      transaction_count: data.count,
      monthly_average: Math.round((data.total / monthCount) * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total);

  // Detect recurring bills
  const recurringBills = detectRecurringBills(expenses);

  // Detect income streams
  const incomeStreams = detectIncomeStreams(incomeTransactions);

  // Monthly averages
  const monthlyAverages = calculateMonthlyAverages(transactions);

  // Calculate summary stats
  const totalIncome = incomeTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const monthlyIncome = Math.round((totalIncome / monthCount) * 100) / 100;
  const monthlyExpenses = Math.round((totalExpenses / monthCount) * 100) / 100;
  const savingsRate = monthlyIncome > 0
    ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100)
    : 0;

  // Generate insights
  const insights = generateInsights({
    totalBalance,
    monthlyIncome,
    monthlyExpenses,
    savingsRate,
    spendingByCategory,
    recurringBills,
    incomeStreams,
  });

  // Generate 30-day action plan
  const actionPlan = generate30DayPlan({
    totalBalance,
    monthlyIncome,
    monthlyExpenses,
    savingsRate,
    spendingByCategory,
    recurringBills,
  });

  return {
    accounts: accountSummaries,
    spending_by_category: spendingByCategory,
    recurring_bills: recurringBills,
    income_streams: incomeStreams,
    monthly_averages: monthlyAverages,
    insights,
    action_plan: actionPlan,
    total_balance: Math.round(totalBalance * 100) / 100,
    monthly_income: monthlyIncome,
    monthly_expenses: monthlyExpenses,
    savings_rate: savingsRate,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function getMonthSpan(transactions: any[]): string[] {
  const monthSet = new Set<string>();
  for (const t of transactions) {
    monthSet.add(t.date.substring(0, 7)); // YYYY-MM
  }
  return Array.from(monthSet).sort();
}

function formatCategoryName(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function detectRecurringBills(expenses: any[]): RecurringBill[] {
  // Group by merchant/name
  const merchantGroups = new Map<string, any[]>();

  for (const txn of expenses) {
    const key = (txn.merchant_name || txn.name || '').toLowerCase().trim();
    if (!key) continue;
    const group = merchantGroups.get(key) || [];
    group.push(txn);
    merchantGroups.set(key, group);
  }

  const bills: RecurringBill[] = [];

  for (const [key, txns] of merchantGroups) {
    if (txns.length < 2) continue;

    // Sort by date
    txns.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Check if amounts are consistent (within 10% variation)
    const amounts = txns.map((t: any) => t.amount);
    const avgAmount = amounts.reduce((a: number, b: number) => a + b, 0) / amounts.length;
    const isConsistent = amounts.every((a: number) => Math.abs(a - avgAmount) / avgAmount < 0.15);

    if (!isConsistent) continue;

    // Determine frequency from date gaps
    const gaps: number[] = [];
    for (let i = 1; i < txns.length; i++) {
      const diff = (new Date(txns[i].date).getTime() - new Date(txns[i - 1].date).getTime()) / (1000 * 60 * 60 * 24);
      gaps.push(diff);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    let frequency: RecurringBill['frequency'];
    if (avgGap <= 10) frequency = 'weekly';
    else if (avgGap <= 20) frequency = 'biweekly';
    else if (avgGap <= 45) frequency = 'monthly';
    else if (avgGap <= 100) frequency = 'quarterly';
    else frequency = 'yearly';

    const lastTxn = txns[txns.length - 1];
    const lastDate = new Date(lastTxn.date);
    const nextExpected = new Date(lastDate);

    switch (frequency) {
      case 'weekly': nextExpected.setDate(nextExpected.getDate() + 7); break;
      case 'biweekly': nextExpected.setDate(nextExpected.getDate() + 14); break;
      case 'monthly': nextExpected.setMonth(nextExpected.getMonth() + 1); break;
      case 'quarterly': nextExpected.setMonth(nextExpected.getMonth() + 3); break;
      case 'yearly': nextExpected.setFullYear(nextExpected.getFullYear() + 1); break;
    }

    // Normalize to monthly amount based on frequency
    const billMultiplier =
      frequency === 'weekly' ? 4.33 :
      frequency === 'biweekly' ? 2.17 :
      frequency === 'monthly' ? 1 :
      frequency === 'quarterly' ? 1 / 3 :
      1 / 12; // yearly

    bills.push({
      name: txns[0].name || key,
      merchant: txns[0].merchant_name || null,
      amount: Math.round(avgAmount * 100) / 100,
      monthly_amount: Math.round(avgAmount * billMultiplier * 100) / 100,
      frequency,
      category: formatCategoryName(txns[0].category || 'OTHER'),
      last_date: lastTxn.date,
      next_expected: nextExpected.toISOString().split('T')[0],
    });
  }

  return bills.sort((a, b) => b.monthly_amount - a.monthly_amount);
}

function detectIncomeStreams(incomeTransactions: any[]): IncomeStream[] {
  // Group by source
  const sourceGroups = new Map<string, any[]>();

  for (const txn of incomeTransactions) {
    const key = (txn.merchant_name || txn.name || '').toLowerCase().trim();
    if (!key) continue;
    const group = sourceGroups.get(key) || [];
    group.push(txn);
    sourceGroups.set(key, group);
  }

  const streams: IncomeStream[] = [];

  for (const [, txns] of sourceGroups) {
    if (txns.length < 2) continue;

    txns.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const amounts = txns.map((t: any) => Math.abs(t.amount));
    const avgAmount = amounts.reduce((a: number, b: number) => a + b, 0) / amounts.length;

    // Determine frequency
    const gaps: number[] = [];
    for (let i = 1; i < txns.length; i++) {
      const diff = (new Date(txns[i].date).getTime() - new Date(txns[i - 1].date).getTime()) / (1000 * 60 * 60 * 24);
      gaps.push(diff);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    let frequency: IncomeStream['frequency'];
    if (avgGap <= 10) frequency = 'weekly';
    else if (avgGap <= 20) frequency = 'biweekly';
    else frequency = 'monthly';

    // Normalize to monthly amount based on frequency
    const frequencyMultiplier = frequency === 'weekly' ? 4.33 : frequency === 'biweekly' ? 2.17 : 1;
    const monthlyAmount = avgAmount * frequencyMultiplier;

    // Salary detection: regular, large, biweekly/monthly payments
    const isSalary = avgAmount > 1000 && (frequency === 'biweekly' || frequency === 'monthly');

    streams.push({
      source: txns[0].name || txns[0].merchant_name || 'Unknown',
      average_amount: Math.round(avgAmount * 100) / 100,
      monthly_amount: Math.round(monthlyAmount * 100) / 100,
      frequency,
      is_salary: isSalary,
      last_date: txns[txns.length - 1].date,
    });
  }

  return streams.sort((a, b) => b.monthly_amount - a.monthly_amount);
}

function calculateMonthlyAverages(transactions: any[]): MonthlyAverage[] {
  const monthMap = new Map<string, { income: number; expenses: number }>();

  for (const txn of transactions) {
    const month = txn.date.substring(0, 7);
    const existing = monthMap.get(month) || { income: 0, expenses: 0 };

    if (txn.amount < 0) {
      existing.income += Math.abs(txn.amount);
    } else {
      existing.expenses += txn.amount;
    }

    monthMap.set(month, existing);
  }

  return Array.from(monthMap.entries())
    .map(([month, data]) => ({
      month,
      income: Math.round(data.income * 100) / 100,
      expenses: Math.round(data.expenses * 100) / 100,
      net: Math.round((data.income - data.expenses) * 100) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function generateInsights(data: {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsRate: number;
  spendingByCategory: CategoryBreakdown[];
  recurringBills: RecurringBill[];
  incomeStreams: IncomeStream[];
}): string[] {
  const insights: string[] = [];

  // Savings rate insight
  if (data.savingsRate >= 20) {
    insights.push(`Great job! You're saving ${data.savingsRate}% of your income, which is above the recommended 20% target.`);
  } else if (data.savingsRate >= 10) {
    insights.push(`You're saving ${data.savingsRate}% of your income. Consider aiming for 20% to build a stronger emergency fund.`);
  } else if (data.savingsRate > 0) {
    insights.push(`Your savings rate is ${data.savingsRate}%. Financial experts recommend saving at least 20% of income. Consider identifying areas to cut back.`);
  } else {
    insights.push(`You're currently spending more than you earn. This is unsustainable and needs immediate attention.`);
  }

  // Top spending category
  if (data.spendingByCategory.length > 0) {
    const top = data.spendingByCategory[0];
    insights.push(`Your largest spending category is "${top.category}" at $${top.monthly_average.toLocaleString()}/month (${top.percentage}% of total spending).`);
  }

  // Recurring bill total
  if (data.recurringBills.length > 0) {
    const monthlyBills = data.recurringBills
      .filter(b => b.frequency === 'monthly')
      .reduce((sum, b) => sum + b.amount, 0);
    insights.push(`You have ${data.recurringBills.length} recurring bills totaling approximately $${monthlyBills.toLocaleString()}/month.`);
  }

  // Income streams
  if (data.incomeStreams.length > 0) {
    const salaryStreams = data.incomeStreams.filter(s => s.is_salary);
    if (salaryStreams.length > 0) {
      insights.push(`Primary salary income detected: $${salaryStreams[0].average_amount.toLocaleString()} (${salaryStreams[0].frequency}).`);
    }
    if (data.incomeStreams.length > 1) {
      insights.push(`You have ${data.incomeStreams.length} income streams — good diversification!`);
    }
  }

  // Emergency fund check
  const emergencyMonths = data.monthlyExpenses > 0
    ? Math.round(data.totalBalance / data.monthlyExpenses * 10) / 10
    : 0;
  if (emergencyMonths >= 6) {
    insights.push(`Your current balance covers ${emergencyMonths} months of expenses — a solid emergency fund.`);
  } else if (emergencyMonths >= 3) {
    insights.push(`Your balance covers about ${emergencyMonths} months of expenses. Aim for 6 months for a full emergency fund.`);
  } else if (emergencyMonths > 0) {
    insights.push(`Your balance only covers ${emergencyMonths} months of expenses. Building an emergency fund of 3-6 months should be a priority.`);
  }

  return insights;
}

function generate30DayPlan(data: {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsRate: number;
  spendingByCategory: CategoryBreakdown[];
  recurringBills: RecurringBill[];
}): ActionItem[] {
  const plan: ActionItem[] = [];

  // Emergency fund action
  const emergencyMonths = data.monthlyExpenses > 0 ? data.totalBalance / data.monthlyExpenses : 0;
  if (emergencyMonths < 3) {
    plan.push({
      priority: 'high',
      title: 'Start building an emergency fund',
      description: `Set up an automatic transfer of $${Math.round(data.monthlyIncome * 0.1)} per month into a high-yield savings account. Goal: 3-6 months of expenses ($${Math.round(data.monthlyExpenses * 3).toLocaleString()}).`,
      potential_savings: Math.round(data.monthlyIncome * 0.1),
    });
  }

  // Review subscriptions
  const subscriptionBills = data.recurringBills.filter(b =>
    b.category.toLowerCase().includes('subscription') ||
    b.category.toLowerCase().includes('entertainment') ||
    b.category.toLowerCase().includes('streaming')
  );
  if (subscriptionBills.length > 0) {
    const total = subscriptionBills.reduce((sum, b) => sum + b.amount, 0);
    plan.push({
      priority: 'medium',
      title: 'Audit your subscriptions',
      description: `You have ${subscriptionBills.length} subscription-type charges totaling $${total.toFixed(2)}/month. Review each one and cancel any you don't actively use.`,
      potential_savings: Math.round(total * 0.3),
    });
  }

  // High spending category reduction
  if (data.spendingByCategory.length > 0) {
    const topDiscretionary = data.spendingByCategory.find(c =>
      !['rent', 'mortgage', 'utilities', 'insurance', 'loan'].some(
        k => c.category.toLowerCase().includes(k)
      )
    );
    if (topDiscretionary && topDiscretionary.percentage > 15) {
      plan.push({
        priority: 'medium',
        title: `Reduce "${topDiscretionary.category}" spending by 15%`,
        description: `This category accounts for ${topDiscretionary.percentage}% of your expenses ($${topDiscretionary.monthly_average.toFixed(2)}/month). Cutting 15% would save $${(topDiscretionary.monthly_average * 0.15).toFixed(2)}/month.`,
        potential_savings: Math.round(topDiscretionary.monthly_average * 0.15),
      });
    }
  }

  // Savings rate improvement
  if (data.savingsRate < 20) {
    plan.push({
      priority: 'high',
      title: 'Increase savings rate to 20%',
      description: `Current savings rate: ${data.savingsRate}%. Target: 20%. This means saving an additional $${Math.round(data.monthlyIncome * 0.2 - (data.monthlyIncome - data.monthlyExpenses))}/month.`,
    });
  }

  // Income tracking
  plan.push({
    priority: 'low',
    title: 'Track all income sources',
    description: 'Ensure all income streams (salary, freelance, investments) are connected. This gives you a complete financial picture for better planning.',
  });

  return plan;
}

// ── Connection Management ───────────────────────────────────────

export async function getConnectedAccounts(userId: string) {
  // Fetch items and accounts in parallel
  const [{ data: items }, { data: accounts }] = await Promise.all([
    supabase
      .from('plaid_items')
      .select('item_id, institution_name, connected_at, last_synced_at')
      .eq('user_id', userId),
    supabase
      .from('plaid_accounts')
      .select('*')
      .eq('user_id', userId),
  ]);

  if (!items || items.length === 0) return [];

  return items.map(item => ({
    ...item,
    accounts: (accounts || []).filter(a => a.item_id === item.item_id),
  }));
}

export async function disconnectAccount(userId: string, itemId: string): Promise<void> {
  // Get access token
  const { data: item } = await supabase
    .from('plaid_items')
    .select('access_token')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .single();

  if (item?.access_token) {
    try {
      await plaidClient.itemRemove({ access_token: item.access_token });
    } catch (err) {
      console.error('Error removing Plaid item (continuing with local cleanup):', err);
    }
  }

  // Remove from database
  await supabase.from('plaid_transactions').delete().eq('user_id', userId).eq('item_id', itemId);
  await supabase.from('plaid_accounts').delete().eq('user_id', userId).eq('item_id', itemId);
  await supabase.from('plaid_items').delete().eq('user_id', userId).eq('item_id', itemId);
}

/**
 * Remove specific accounts by account_id, then clean up any orphaned plaid_items
 * (items that have zero remaining accounts after removal).
 */
export async function removeAccountsAndCleanup(
  userId: string,
  accountIdsToRemove: string[]
): Promise<{ removed: number }> {
  if (accountIdsToRemove.length === 0) return { removed: 0 };

  // Delete transactions and accounts for each removed account
  for (const accountId of accountIdsToRemove) {
    await supabase.from('plaid_transactions').delete()
      .eq('user_id', userId).eq('account_id', accountId);
    await supabase.from('plaid_accounts').delete()
      .eq('user_id', userId).eq('account_id', accountId);
  }

  // Find and clean up orphaned plaid_items (items with 0 remaining accounts)
  const { data: items } = await supabase
    .from('plaid_items')
    .select('item_id, access_token')
    .eq('user_id', userId);

  for (const item of (items || [])) {
    const { count } = await supabase
      .from('plaid_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('item_id', item.item_id);

    if (count === 0) {
      // Revoke Plaid access for orphaned item
      if (item.access_token) {
        try {
          await plaidClient.itemRemove({ access_token: item.access_token });
        } catch (e) {
          console.error('[Plaid] itemRemove for orphan failed:', e);
        }
      }
      await supabase.from('plaid_transactions').delete()
        .eq('user_id', userId).eq('item_id', item.item_id);
      await supabase.from('plaid_items').delete()
        .eq('user_id', userId).eq('item_id', item.item_id);
    }
  }

  return { removed: accountIdsToRemove.length };
}
