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
import { query, getClient } from '../services/db';

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
  const result = await query(
    'SELECT user_id FROM plaid_link_tokens WHERE link_token = $1 AND used_at IS NULL',
    [linkToken]
  );
  return result.rows[0]?.user_id;
}

async function storeLinkTokenMapping(linkToken: string, userId: string): Promise<void> {
  console.log(`[Plaid] Storing link_token mapping: token=${linkToken.substring(0, 20)}..., userId=${userId}`);
  try {
    const result = await query(
      `INSERT INTO plaid_link_tokens (link_token, user_id)
       VALUES ($1, $2)
       ON CONFLICT (link_token) DO UPDATE SET user_id = $2
       RETURNING *`,
      [linkToken, userId]
    );
    console.log('[Plaid] link_token mapping stored successfully:', result.rows);
  } catch (error) {
    console.error('[Plaid] Failed to store link_token mapping:', error);
  }
}

export async function markLinkTokenUsed(linkToken: string): Promise<void> {
  await query(
    'UPDATE plaid_link_tokens SET used_at = $1 WHERE link_token = $2',
    [new Date().toISOString(), linkToken]
  );
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
    const appUrl = (process.env.APP_URL || 'https://docuintelli.com').replace(/\/+$/, '');
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
    await query(
      `INSERT INTO plaid_accounts (user_id, item_id, account_id, name, official_name, type, subtype, mask, initial_balance, current_balance, available_balance, currency, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (user_id, account_id) DO UPDATE SET
         item_id = $2, name = $4, official_name = $5, type = $6, subtype = $7,
         mask = $8, initial_balance = $9, current_balance = $10, available_balance = $11, currency = $12, synced_at = $13`,
      [userId, itemId, account.account_id, account.name, account.official_name,
       account.type, account.subtype, account.mask, account.current_balance,
       account.current_balance, account.available_balance,
       account.currency, new Date().toISOString()]
    );
  }

  // Now store the item — polling detects new items via plaid_items,
  // so accounts are guaranteed to exist by the time the item appears.
  try {
    await query(
      `INSERT INTO plaid_items (user_id, item_id, access_token, institution_name, connected_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, item_id) DO UPDATE SET
         access_token = $3, institution_name = $4, connected_at = $5`,
      [userId, itemId, accessToken, resolvedName, new Date().toISOString()]
    );
  } catch (upsertError) {
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
    const result = await query(
      'SELECT access_token FROM plaid_items WHERE user_id = $1 AND item_id = $2',
      [userId, itemId]
    );

    if (!result.rows[0]) throw new Error('Plaid item not found');
    accessToken = result.rows[0].access_token;
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
    try {
      await query(
        `INSERT INTO plaid_transactions (user_id, item_id, transaction_id, account_id, amount, date, name, merchant_name, category, category_detailed, pending, payment_channel, currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (user_id, transaction_id) DO UPDATE SET
           account_id = $4, amount = $5, date = $6, name = $7, merchant_name = $8,
           category = $9, category_detailed = $10, pending = $11, payment_channel = $12, currency = $13`,
        [userId, itemId, txn.transaction_id, txn.account_id, txn.amount, txn.date,
         txn.name, txn.merchant_name,
         txn.personal_finance_category?.primary || txn.category?.[0] || 'OTHER',
         txn.personal_finance_category?.detailed || txn.category?.join(' > ') || null,
         txn.pending, txn.payment_channel, txn.iso_currency_code || 'USD']
      );
      added++;
    } catch (error) {
      // Skip individual transaction errors
      console.error(`[Plaid] Failed to upsert transaction ${txn.transaction_id}:`, error);
    }
  }

  // Update sync timestamp
  await query(
    'UPDATE plaid_items SET last_synced_at = $1 WHERE user_id = $2 AND item_id = $3',
    [new Date().toISOString(), userId, itemId]
  );

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
  net_cash_flow: number;
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
  category_key: string;
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
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
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
  const [accountsResult, transactionsResult] = await Promise.all([
    query('SELECT * FROM plaid_accounts WHERE user_id = $1', [userId]),
    query(
      'SELECT * FROM plaid_transactions WHERE user_id = $1 AND pending = false AND date >= $2 ORDER BY date DESC',
      [userId, cutoffDate]
    ),
  ]);

  // pg returns numeric columns as strings — normalize to numbers
  const accounts = accountsResult.rows.map((a: any) => ({
    ...a,
    initial_balance: Number(a.initial_balance) || 0,
    current_balance: Number(a.current_balance) || 0,
    available_balance: Number(a.available_balance) || 0,
  }));
  const transactions = transactionsResult.rows.map((t: any) => ({
    ...t,
    amount: Number(t.amount) || 0,
  }));

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
      category_key: category,
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
  const netCashFlow = Math.round((monthlyIncome - monthlyExpenses) * 100) / 100;

  // Generate insights
  const insights = generateInsights({
    totalBalance,
    monthlyIncome,
    monthlyExpenses,
    netCashFlow,
    spendingByCategory,
    recurringBills,
    incomeStreams,
  });

  // Generate 30-day action plan
  const actionPlan = generate30DayPlan({
    totalBalance,
    monthlyIncome,
    monthlyExpenses,
    netCashFlow,
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
    net_cash_flow: netCashFlow,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function dateToString(d: any): string {
  if (d instanceof Date) return d.toISOString().substring(0, 10);
  return String(d);
}

function getMonthSpan(transactions: any[]): string[] {
  const monthSet = new Set<string>();
  for (const t of transactions) {
    monthSet.add(dateToString(t.date).substring(0, 7)); // YYYY-MM
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

/**
 * Extract merchant "stem" from a transaction name — strips dates, reference
 * numbers, personal names, and other noise so the same payee groups together
 * across months. Uses merchant_name when available (card transactions); falls
 * back to parsing the raw name field (ACH/direct deposit).
 */
function extractMerchantStem(txn: any): string {
  // If Plaid resolved a merchant_name, it's the most reliable source
  if (txn.merchant_name) {
    return txn.merchant_name.toLowerCase().trim()
      .replace(/[*#\-_'"`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const name = (txn.name || '').trim();
  let stem = name.toLowerCase();

  // Handle Zelle — group by direction + person
  const zelleMatch = stem.match(/^zelle\s+(from|to)\s+(.+?)\s+on\s/);
  if (zelleMatch) return `zelle ${zelleMatch[1]} ${zelleMatch[2].trim()}`;

  // Handle internal transfers — don't group with real merchants
  if (/^(recurring|online)\s+transfer\s+(from|to)\s/i.test(stem)) {
    return 'internal transfer';
  }

  // Strip noise from ACH / direct-deposit names
  stem = stem
    .replace(/\b\w*\d{6,}\w*\b/g, '')               // Words with 6+ digits (refs, dates)
    .replace(/\b\d{4,5}\b/g, '')                     // 4-5 digit numbers
    .replace(/\bon\s+\d{2}\/\d{2}(\/\d{2,4})?\b/g, '') // "ON MM/DD"
    .replace(/\bref\s*#?\s*\S+/gi, '')               // REF #xxx
    .replace(/\bcard\s+\d+/gi, '')                   // CARD xxxx
    .replace(/\bxxxxxx\d+/gi, '')                    // Masked account numbers
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}\b/gi, '') // Month day
    .replace(/[*#\-_'"`]/g, ' ')                     // Special characters
    .replace(/\s+/g, ' ')
    .trim();

  // Take first 3 meaningful words (>2 chars, not pure numbers)
  const words = stem.split(' ').filter((w: string) => w.length > 2 && !/^\d+$/.test(w));
  return words.slice(0, 3).join(' ') || stem.split(' ').slice(0, 2).join(' ');
}

/** Plaid categories that indicate inherently recurring expenses */
const RECURRING_CATEGORIES = new Set([
  'LOAN_PAYMENTS',
  'RENT_AND_UTILITIES',
  'BANK_FEES',
  'ENTERTAINMENT',   // streaming services
  'INSURANCE',
]);

/** Name keywords indicating an ACH bill/payment (not a purchase) */
const BILL_KEYWORDS = /\b(ach|pmt|pymnt|payment|cash\b.*\d|draft|web\s*pmts?|service\s*fee|mortgage|insurance|energy|electric|gas\s+co|water|sewer|internet)\b/i;
const PURCHASE_KEYWORDS = /\b(purchase\s+authorized|paypal|pos\s|debit\s+card)\b/i;

/** Compute unique-date gaps — deduplicates same-day deposits across accounts */
function computeUniqueDateGaps(txns: any[]): number[] {
  const uniqueDates = [...new Set(txns.map(t => dateToString(t.date)))].sort();
  const gaps: number[] = [];
  for (let i = 1; i < uniqueDates.length; i++) {
    const diff = (new Date(uniqueDates[i]).getTime() - new Date(uniqueDates[i - 1]).getTime()) / (1000 * 60 * 60 * 24);
    gaps.push(diff);
  }
  return gaps;
}

/** Median-based frequency detection — resistant to outlier gaps */
function detectFrequency(gaps: number[]): 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' {
  if (gaps.length === 0) return 'monthly'; // single occurrence default
  const sorted = [...gaps].sort((a, b) => a - b);
  const medianGap = sorted[Math.floor(sorted.length / 2)];

  if (medianGap <= 9)  return 'weekly';     // ~7 days ± 2
  if (medianGap <= 18) return 'biweekly';   // ~14 days ± 4
  if (medianGap <= 45) return 'monthly';    // ~30 days ± 15
  if (medianGap <= 100) return 'quarterly'; // ~90 days ± 10
  return 'yearly';
}

/** Calculate next expected date based on frequency */
function calcNextExpected(lastDate: Date, frequency: string): Date {
  const next = new Date(lastDate);
  switch (frequency) {
    case 'weekly': next.setDate(next.getDate() + 7); break;
    case 'biweekly': next.setDate(next.getDate() + 14); break;
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    case 'quarterly': next.setMonth(next.getMonth() + 3); break;
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
  }
  return next;
}

/** Monthly multiplier for normalizing frequency to monthly amount */
function monthlyMultiplier(frequency: string): number {
  switch (frequency) {
    case 'weekly': return 4.33;
    case 'biweekly': return 2.17;
    case 'quarterly': return 1 / 3;
    case 'yearly': return 1 / 12;
    default: return 1; // monthly
  }
}

function detectRecurringBills(expenses: any[]): RecurringBill[] {
  // Exclude internal transfers and Zelle (person-to-person, not bills)
  const billCandidates = expenses.filter(txn => {
    const cat = txn.category || '';
    if (cat === 'TRANSFER_OUT') return false;
    const stem = extractMerchantStem(txn);
    if (stem === 'internal transfer') return false;
    if (stem.startsWith('zelle to')) return false;
    return true;
  });

  // Group by merchant stem
  const merchantGroups = new Map<string, any[]>();
  for (const txn of billCandidates) {
    const key = extractMerchantStem(txn);
    if (!key) continue;
    const group = merchantGroups.get(key) || [];
    group.push(txn);
    merchantGroups.set(key, group);
  }

  const bills: RecurringBill[] = [];

  for (const [key, txns] of merchantGroups) {
    txns.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const amounts = txns.map((t: any) => t.amount);
    const avgAmount = amounts.reduce((a: number, b: number) => a + b, 0) / amounts.length;

    // Use unique dates to avoid same-day multi-account duplication
    const gaps = computeUniqueDateGaps(txns);
    const uniqueDateCount = new Set(txns.map((t: any) => dateToString(t.date))).size;

    // --- Multi-occurrence: 2+ unique dates with consistent amounts ---
    if (uniqueDateCount >= 2) {
      // Check amount consistency (within 25% variation)
      const isConsistent = amounts.every((a: number) => Math.abs(a - avgAmount) / avgAmount < 0.25);
      if (!isConsistent) continue;

      const frequency = detectFrequency(gaps);
      const lastTxn = txns[txns.length - 1];
      const nextExpected = calcNextExpected(new Date(lastTxn.date), frequency);
      const mult = monthlyMultiplier(frequency);

      bills.push({
        name: txns[0].merchant_name || txns[0].name || key,
        merchant: txns[0].merchant_name || null,
        amount: Math.round(avgAmount * 100) / 100,
        monthly_amount: Math.round(avgAmount * mult * 100) / 100,
        frequency,
        category: formatCategoryName(txns[0].category || 'OTHER'),
        last_date: dateToString(lastTxn.date),
        next_expected: nextExpected.toISOString().split('T')[0],
      });
      continue;
    }

    // --- Single occurrence: use category + keyword heuristics for likely recurring bills ---
    const category = txns[0].category || '';
    const txnName = txns[0].name || '';

    // A single-occurrence expense is likely recurring if:
    // 1. Plaid categorized it as a bill type (LOAN_PAYMENTS, RENT_AND_UTILITIES, etc.), OR
    // 2. The name contains ACH/payment keywords and doesn't look like a purchase, with amount >= $50
    const isCategoryBill = RECURRING_CATEGORIES.has(category);
    const isKeywordBill = !PURCHASE_KEYWORDS.test(txnName) && BILL_KEYWORDS.test(txnName) && avgAmount >= 50;

    if (uniqueDateCount === 1 && (isCategoryBill || isKeywordBill) && avgAmount >= 10) {
      const frequency = 'monthly';
      const lastTxn = txns[txns.length - 1];
      const nextExpected = calcNextExpected(new Date(lastTxn.date), frequency);

      bills.push({
        name: txns[0].merchant_name || txns[0].name || key,
        merchant: txns[0].merchant_name || null,
        amount: Math.round(avgAmount * 100) / 100,
        monthly_amount: Math.round(avgAmount * 100) / 100,
        frequency,
        category: formatCategoryName(category || 'OTHER'),
        last_date: dateToString(lastTxn.date),
        next_expected: nextExpected.toISOString().split('T')[0],
      });
    }
  }

  return bills.sort((a, b) => b.monthly_amount - a.monthly_amount);
}

function detectIncomeStreams(incomeTransactions: any[]): IncomeStream[] {
  // Exclude internal transfers (savings ↔ checking) and tiny amounts
  const incomeCandidates = incomeTransactions.filter(txn => {
    const cat = txn.category || '';
    if (cat === 'TRANSFER_IN') return false;
    if (Math.abs(txn.amount) < 1) return false; // skip interest pennies
    const stem = extractMerchantStem(txn);
    if (stem === 'internal transfer') return false;
    return true;
  });

  // Group by merchant stem
  const sourceGroups = new Map<string, any[]>();
  for (const txn of incomeCandidates) {
    const key = extractMerchantStem(txn);
    if (!key) continue;
    const group = sourceGroups.get(key) || [];
    group.push(txn);
    sourceGroups.set(key, group);
  }

  const streams: IncomeStream[] = [];

  for (const [key, txns] of sourceGroups) {
    txns.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // ── Monthly aggregation ──
    // Sum all payments from the same source within each calendar month.
    // This handles split payments (e.g. 3× $867 in one month = $2,600 total).
    const monthTotals = new Map<string, number>();
    for (const txn of txns) {
      const month = dateToString(txn.date).substring(0, 7); // YYYY-MM
      monthTotals.set(month, (monthTotals.get(month) || 0) + Math.abs(txn.amount));
    }
    const monthlyAmounts = [...monthTotals.values()];
    const avgMonthlyTotal = monthlyAmounts.reduce((a, b) => a + b, 0) / monthlyAmounts.length;
    const monthCount = monthTotals.size;

    // ── Also compute per-date amounts for sub-monthly frequency detection ──
    const dateAmounts = new Map<string, number>();
    for (const txn of txns) {
      const d = dateToString(txn.date);
      dateAmounts.set(d, (dateAmounts.get(d) || 0) + Math.abs(txn.amount));
    }
    const uniqueDateCount = dateAmounts.size;
    const perDateAmounts = [...dateAmounts.values()];
    const avgPerDate = perDateAmounts.reduce((a, b) => a + b, 0) / perDateAmounts.length;

    // ── Determine frequency ──
    let frequency: IncomeStream['frequency'];
    let reportedAmount: number;

    if (uniqueDateCount >= 2) {
      // Multiple unique dates: use gap-based detection (weekly, biweekly, monthly)
      const gaps = computeUniqueDateGaps(txns);
      frequency = detectFrequency(gaps);

      // For biweekly/weekly: use per-date average (each date is one pay event)
      // For monthly: use monthly aggregate (multiple dates may sum to the monthly total)
      if (frequency === 'monthly') {
        reportedAmount = avgMonthlyTotal;
      } else {
        reportedAmount = avgPerDate;
      }
    } else if (monthCount === 1) {
      // Single month of data — check if the source looks like recurring income
      // (business entity, not a one-off Zelle from an individual)
      const isZelle = key.startsWith('zelle from');
      const isSignificant = avgMonthlyTotal >= 500;

      if (!isZelle && isSignificant) {
        // Likely monthly income (rent, side gig, etc.) — include with monthly frequency
        frequency = 'monthly';
        reportedAmount = avgMonthlyTotal;
      } else {
        continue; // Skip one-off small amounts and Zelle until we see them again
      }
    } else {
      continue;
    }

    const mult = monthlyMultiplier(frequency);
    const monthlyAmount = reportedAmount * mult;

    // Salary detection: large regular payments with 2+ data points
    const isSalary = uniqueDateCount >= 2 && reportedAmount > 1000 &&
      (frequency === 'biweekly' || frequency === 'monthly');

    const displayName = txns[0].merchant_name || txns[0].name || 'Unknown';

    streams.push({
      source: displayName,
      average_amount: Math.round(reportedAmount * 100) / 100,
      monthly_amount: Math.round(monthlyAmount * 100) / 100,
      frequency,
      is_salary: isSalary,
      last_date: dateToString(txns[txns.length - 1].date),
    });
  }

  return streams.sort((a, b) => b.monthly_amount - a.monthly_amount);
}

function calculateMonthlyAverages(transactions: any[]): MonthlyAverage[] {
  const monthMap = new Map<string, { income: number; expenses: number }>();

  for (const txn of transactions) {
    const month = dateToString(txn.date).substring(0, 7);
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
  netCashFlow: number;
  spendingByCategory: CategoryBreakdown[];
  recurringBills: RecurringBill[];
  incomeStreams: IncomeStream[];
}): string[] {
  const insights: string[] = [];

  // Cash flow insight
  const cfAbs = Math.abs(data.netCashFlow);
  if (data.netCashFlow >= data.monthlyIncome * 0.2) {
    insights.push(`Strong cash flow: +$${cfAbs.toLocaleString()} more coming in than going out — over 20% of your income.`);
  } else if (data.netCashFlow >= data.monthlyIncome * 0.1) {
    const pct = data.monthlyIncome > 0 ? Math.round((data.netCashFlow / data.monthlyIncome) * 100) : 0;
    insights.push(`Cash flow is +$${cfAbs.toLocaleString()} (~${pct}% of income). Aim to widen the gap to 20%+ for a stronger cushion.`);
  } else if (data.netCashFlow > 0) {
    insights.push(`Cash flow is barely positive at +$${cfAbs.toLocaleString()}. Look for ways to increase the margin between income and spending.`);
  } else {
    insights.push(`You spent $${cfAbs.toLocaleString()} more than you earned this month. This needs immediate attention.`);
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
  netCashFlow: number;
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

  // Cash flow improvement
  if (data.netCashFlow <= 0) {
    plan.push({
      priority: 'high',
      title: 'Eliminate negative cash flow',
      description: `You're spending $${Math.abs(data.netCashFlow).toLocaleString()} more than you earn each month. Identify non-essential expenses to cut and bring spending below income.`,
    });
  } else if (data.netCashFlow < data.monthlyIncome * 0.2) {
    const target = Math.round(data.monthlyIncome * 0.2);
    const gap = Math.round(target - data.netCashFlow);
    plan.push({
      priority: 'medium',
      title: 'Improve monthly cash flow',
      description: `Current surplus: +$${data.netCashFlow.toLocaleString()}/month. Aim for +$${target.toLocaleString()} (20% of income) — that's $${gap.toLocaleString()} more to free up.`,
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
  const [itemsResult, accountsResult] = await Promise.all([
    query(
      'SELECT item_id, institution_name, connected_at, last_synced_at FROM plaid_items WHERE user_id = $1',
      [userId]
    ),
    query('SELECT * FROM plaid_accounts WHERE user_id = $1', [userId]),
  ]);

  const items = itemsResult.rows;
  // pg returns numeric columns as strings — normalize to numbers
  const accounts = accountsResult.rows.map((a: any) => ({
    ...a,
    initial_balance: Number(a.initial_balance) || 0,
    current_balance: Number(a.current_balance) || 0,
    available_balance: Number(a.available_balance) || 0,
  }));

  if (!items || items.length === 0) return [];

  return items.map(item => ({
    ...item,
    accounts: (accounts || []).filter(a => a.item_id === item.item_id),
  }));
}

export async function disconnectAccount(userId: string, itemId: string): Promise<void> {
  // Get access token
  const result = await query(
    'SELECT access_token FROM plaid_items WHERE user_id = $1 AND item_id = $2',
    [userId, itemId]
  );
  const item = result.rows[0];

  if (item?.access_token) {
    try {
      await plaidClient.itemRemove({ access_token: item.access_token });
    } catch (err) {
      console.error('Error removing Plaid item (continuing with local cleanup):', err);
    }
  }

  // Remove from database
  await query('DELETE FROM plaid_transactions WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
  await query('DELETE FROM plaid_accounts WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
  await query('DELETE FROM plaid_items WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
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

  console.log(`[Plaid] removeAccountsAndCleanup: removing ${accountIdsToRemove.length} accounts for user ${userId}:`, accountIdsToRemove);

  // Batch-delete transactions for removed accounts
  try {
    await query(
      'DELETE FROM plaid_transactions WHERE user_id = $1 AND account_id = ANY($2)',
      [userId, accountIdsToRemove]
    );
  } catch (txnErr) {
    console.error('[Plaid] Failed to delete transactions for removed accounts:', txnErr);
  }

  // Batch-delete financial_goal_accounts referencing removed accounts
  try {
    await query(
      'DELETE FROM financial_goal_accounts WHERE user_id = $1 AND account_id = ANY($2)',
      [userId, accountIdsToRemove]
    );
  } catch (goalAcctErr) {
    console.error('[Plaid] Failed to delete goal account links:', goalAcctErr);
  }

  // Batch-delete the accounts themselves
  try {
    await query(
      'DELETE FROM plaid_accounts WHERE user_id = $1 AND account_id = ANY($2)',
      [userId, accountIdsToRemove]
    );
  } catch (acctErr: any) {
    console.error('[Plaid] CRITICAL — failed to delete plaid_accounts:', acctErr);
    throw new Error(`Failed to delete accounts: ${acctErr.message}`);
  }

  // Verify the accounts were actually removed
  const verifyResult = await query(
    'SELECT COUNT(*) AS cnt FROM plaid_accounts WHERE user_id = $1 AND account_id = ANY($2)',
    [userId, accountIdsToRemove]
  );
  const remainingRemoved = parseInt(verifyResult.rows[0]?.cnt || '0', 10);

  if (remainingRemoved > 0) {
    console.error(`[Plaid] CRITICAL — ${remainingRemoved} accounts still exist after deletion!`);
    throw new Error(`Account deletion verification failed: ${remainingRemoved} accounts not removed`);
  }

  // Find and clean up orphaned plaid_items (items with 0 remaining accounts)
  const itemsResult = await query(
    'SELECT item_id, access_token FROM plaid_items WHERE user_id = $1',
    [userId]
  );

  for (const item of (itemsResult.rows || [])) {
    const countResult = await query(
      'SELECT COUNT(*) AS cnt FROM plaid_accounts WHERE user_id = $1 AND item_id = $2',
      [userId, item.item_id]
    );
    const count = parseInt(countResult.rows[0]?.cnt || '0', 10);

    if (count === 0) {
      console.log(`[Plaid] Cleaning up orphaned item: ${item.item_id}`);
      // Revoke Plaid access for orphaned item
      if (item.access_token) {
        try {
          await plaidClient.itemRemove({ access_token: item.access_token });
        } catch (e) {
          console.error('[Plaid] itemRemove for orphan failed:', e);
        }
      }
      await query(
        'DELETE FROM plaid_transactions WHERE user_id = $1 AND item_id = $2',
        [userId, item.item_id]
      );
      await query(
        'DELETE FROM plaid_items WHERE user_id = $1 AND item_id = $2',
        [userId, item.item_id]
      );
    }
  }

  console.log(`[Plaid] removeAccountsAndCleanup complete: removed ${accountIdsToRemove.length} accounts`);
  return { removed: accountIdsToRemove.length };
}

/** Get individual transactions for a given spending category (last 12 months) */
export async function getTransactionsByCategory(
  userId: string,
  category: string
): Promise<{ name: string; merchant_name: string | null; amount: number; date: string; category_detailed: string | null }[]> {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const cutoffDate = twelveMonthsAgo.toISOString().split('T')[0];

  const result = await query(
    `SELECT name, merchant_name, amount, date, category_detailed
     FROM plaid_transactions
     WHERE user_id = $1 AND category = $2 AND pending = false AND amount > 0 AND date >= $3
     ORDER BY date DESC`,
    [userId, category, cutoffDate]
  );

  return result.rows.map((r: any) => ({
    name: r.name,
    merchant_name: r.merchant_name || null,
    amount: Number(r.amount) || 0,
    date: dateToString(r.date),
    category_detailed: r.category_detailed || null,
  }));
}
