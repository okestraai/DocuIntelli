/**
 * Financial Insights API helpers — ported from web (src/lib/financialApi.ts)
 * Reuses all existing backend endpoints at /api/financial/*
 */
import { supabase } from './supabase';
import { API_BASE } from './config';
import { getDeviceId } from './deviceId';

// ── Helpers ─────────────────────────────────────────────────────

async function backendHeaders(accessToken: string): Promise<Record<string, string>> {
  const deviceId = await getDeviceId();
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
  };
}

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return session;
}

// ── Types ───────────────────────────────────────────────────────

export interface AccountSummary {
  account_id: string;
  name: string;
  type: string;
  subtype: string;
  mask: string;
  current_balance: number;
  currency: string;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  percentage: number;
  transaction_count: number;
  monthly_average: number;
}

export interface RecurringBill {
  name: string;
  merchant: string | null;
  amount: number;
  frequency: string;
  category: string;
  last_date: string;
  next_expected: string;
}

export interface IncomeStream {
  source: string;
  average_amount: number;
  frequency: string;
  is_salary: boolean;
  last_date: string;
}

export interface MonthlyAverage {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

export interface ActionItem {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  potential_savings?: number;
}

export interface FinancialSummary {
  accounts: AccountSummary[];
  spending_by_category: CategoryBreakdown[];
  recurring_bills: RecurringBill[];
  income_streams: IncomeStream[];
  monthly_averages: MonthlyAverage[];
  insights: string[];
  account_analysis?: Record<string, string[]>;
  action_plan: ActionItem[];
  ai_recommendations?: string;
  total_balance: number;
  monthly_income: number;
  monthly_expenses: number;
  savings_rate: number;
}

export interface DetectedLoanPrompt {
  id: string;
  loan_type: string;
  display_name: string;
  merchant_name: string;
  estimated_monthly_payment: number;
  confidence: number;
  last_payment_date: string;
  frequency: string;
  prompt_text: string;
}

export interface PayoffScenario {
  extra_monthly: number;
  months_remaining: number;
  total_interest: number;
  months_saved: number;
  interest_saved: number;
}

export interface LoanAnalysis {
  extracted_data: {
    loan_amount: number | null;
    interest_rate: number | null;
    term_months: number | null;
    remaining_balance: number | null;
    monthly_payment: number | null;
    origination_date: string | null;
    maturity_date: string | null;
    lender_name: string | null;
  };
  analysis_text: string;
  payoff_timeline: {
    current_months_remaining: number;
    current_total_interest: number;
    scenarios: PayoffScenario[];
  } | null;
  refinancing_analysis: {
    potential_savings: number | null;
    break_even_months: number | null;
    recommendation: string;
  } | null;
}

// ── API Functions ───────────────────────────────────────────────

/** Create a Plaid Link token */
export async function createLinkToken(): Promise<string> {
  const session = await getSession();
  const headers = await backendHeaders(session.access_token);
  const res = await fetch(`${API_BASE}/api/financial/link-token`, {
    method: 'POST',
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create link token' }));
    throw new Error(err.error || err.message);
  }

  const data = await res.json();
  return data.link_token;
}

/** Exchange Plaid public token */
export async function exchangePublicToken(
  publicToken: string,
  institutionName: string,
): Promise<{ item_id: string; accounts: any[] }> {
  const session = await getSession();
  const headers = await backendHeaders(session.access_token);
  const res = await fetch(`${API_BASE}/api/financial/exchange-token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ public_token: publicToken, institution_name: institutionName }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to connect bank' }));
    throw new Error(err.error || err.message);
  }

  return res.json();
}

/** Get financial summary */
export async function getFinancialSummary(): Promise<FinancialSummary> {
  const session = await getSession();
  const headers = await backendHeaders(session.access_token);
  const res = await fetch(`${API_BASE}/api/financial/summary`, { headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to load summary' }));
    throw new Error(err.error || err.message);
  }

  return res.json();
}

/** Get connected accounts */
export async function getConnectedAccounts(): Promise<any[]> {
  const session = await getSession();
  const headers = await backendHeaders(session.access_token);
  const res = await fetch(`${API_BASE}/api/financial/accounts`, { headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to load accounts' }));
    throw new Error(err.error || err.message);
  }

  const data = await res.json();
  return data.accounts || [];
}

/** Sync transactions manually */
export async function syncTransactions(itemId: string): Promise<{ added: number }> {
  const session = await getSession();
  const headers = await backendHeaders(session.access_token);
  const res = await fetch(`${API_BASE}/api/financial/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ item_id: itemId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Sync failed' }));
    throw new Error(err.error || err.message);
  }

  return res.json();
}

/** Disconnect a bank account */
export async function disconnectBankAccount(itemId: string): Promise<void> {
  const session = await getSession();
  const headers = await backendHeaders(session.access_token);
  const res = await fetch(`${API_BASE}/api/financial/disconnect/${itemId}`, {
    method: 'DELETE',
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to disconnect' }));
    throw new Error(err.error || err.message);
  }
}

/** Get detected loan prompts */
export async function getDetectedLoans(): Promise<DetectedLoanPrompt[]> {
  const session = await getSession();
  const headers = await backendHeaders(session.access_token);
  const res = await fetch(`${API_BASE}/api/financial/detected-loans`, { headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to detect loans' }));
    throw new Error(err.error || err.message);
  }

  const data = await res.json();
  return data.detected_loans || [];
}

/** Dismiss a detected loan prompt */
export async function dismissDetectedLoan(loanId: string): Promise<void> {
  const session = await getSession();
  const headers = await backendHeaders(session.access_token);
  const res = await fetch(`${API_BASE}/api/financial/detected-loans/${loanId}/dismiss`, {
    method: 'POST',
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to dismiss' }));
    throw new Error(err.error || err.message);
  }
}

/** Link an uploaded document to a detected loan */
export async function linkDocumentToLoan(loanId: string, documentId: string): Promise<void> {
  const session = await getSession();
  const headers = await backendHeaders(session.access_token);
  const res = await fetch(`${API_BASE}/api/financial/detected-loans/${loanId}/link-document`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ document_id: documentId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to link document' }));
    throw new Error(err.error || err.message);
  }
}

/** Get analyzed loans (ones with linked documents) */
export interface AnalyzedLoan {
  id: string;
  loan_type: string;
  display_name: string;
  merchant_name: string;
  estimated_monthly_payment: number;
  frequency: string;
  confidence: number;
  document_id: string;
}

export async function getAnalyzedLoans(): Promise<AnalyzedLoan[]> {
  const session = await getSession();
  const headers = await backendHeaders(session.access_token);
  const res = await fetch(`${API_BASE}/api/financial/analyzed-loans`, { headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch analyzed loans' }));
    throw new Error(err.error || err.message);
  }

  const data = await res.json();
  return data.analyzed_loans || [];
}

/** Get loan analysis for a detected loan */
export async function getLoanAnalysis(detectedLoanId: string): Promise<LoanAnalysis | null> {
  const session = await getSession();
  const headers = await backendHeaders(session.access_token);
  const res = await fetch(`${API_BASE}/api/financial/loan-analysis/${detectedLoanId}`, { headers });

  if (res.status === 404) return null;

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to load analysis' }));
    throw new Error(err.error || err.message);
  }

  const data = await res.json();
  return data.analysis || null;
}
