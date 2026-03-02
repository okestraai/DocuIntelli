/**
 * Loan Detector
 * Analyzes transaction patterns to detect loan/mortgage payments.
 * Mirrors the recurring bill detection pattern in plaidService.ts.
 */

export type LoanType = 'mortgage' | 'auto_loan' | 'student_loan' | 'personal_loan' | 'other';

export interface DetectedLoan {
  loan_type: LoanType;
  merchant_name: string;
  display_name: string;
  estimated_monthly_payment: number;
  frequency: string;
  confidence: number;
  first_seen_date: string;
  last_payment_date: string;
  payment_count: number;
  category: string | null;
  category_detailed: string | null;
}

// ── Keyword Dictionaries ─────────────────────────────────────────

const MORTGAGE_KEYWORDS = [
  'mortgage', 'home loan', 'quicken', 'rocket mortgage', 'fannie mae',
  'freddie mac', 'homepoint', 'loancare', 'mr cooper', 'nationstar',
  'wells fargo home', 'chase home', 'us bank home', 'pnc mortgage',
  'freedom mortgage', 'caliber home', 'pennymac', 'newrez',
];

const AUTO_KEYWORDS = [
  'auto loan', 'auto finance', 'auto pay', 'capital one auto',
  'ally auto', 'ally financial', 'car payment', 'vehicle', 'auto credit',
  'toyota financial', 'honda financial', 'ford credit', 'gm financial',
  'chrysler capital', 'westlake financial', 'santander consumer',
  'world omni', 'chase auto', 'usaa auto',
];

const STUDENT_KEYWORDS = [
  'student loan', 'navient', 'nelnet', 'mohela', 'great lakes',
  'fedloan', 'aidvantage', 'sallie mae', 'earnest', 'commonbond',
  'education loan', 'dept of ed', 'dept education', 'ed fin',
  'college ave', 'discover student',
];

const PERSONAL_KEYWORDS = [
  'lending club', 'lendingclub', 'sofi personal', 'sofi loan',
  'prosper', 'upstart', 'personal loan', 'marcus', 'avant',
  'best egg', 'lightstream', 'payoff', 'upgrade loan', 'happy money',
];

// Plaid categories that indicate loans
const LOAN_CATEGORIES = [
  'loan_payments', 'loan', 'mortgage', 'debt',
];

// Payment-related keywords that suggest loan/bill auto-payments
// (often categorized as TRANSFER_OUT by Plaid instead of LOAN_PAYMENTS)
const PAYMENT_INDICATORS = [
  'automatic payment', 'auto pay', 'autopay', 'payment - thank',
  'loan payment', 'pmt', 'installment',
];

// ── Main Detection ───────────────────────────────────────────────

export function detectLoanPayments(transactions: any[]): DetectedLoan[] {
  // Only consider expenses >= $300
  const candidates = transactions.filter(t => t.amount >= 300);
  if (candidates.length === 0) return [];

  // Group by merchant/name
  const merchantGroups = new Map<string, any[]>();
  for (const txn of candidates) {
    const key = (txn.merchant_name || txn.name || '').toLowerCase().trim();
    if (!key) continue;
    const group = merchantGroups.get(key) || [];
    group.push(txn);
    merchantGroups.set(key, group);
  }

  const detected: DetectedLoan[] = [];

  for (const [key, txns] of merchantGroups) {
    // Require 2+ occurrences
    if (txns.length < 2) continue;

    // Sort by date ascending
    txns.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Amount consistency check: within ±15% of average
    const amounts = txns.map((t: any) => t.amount);
    const avgAmount = amounts.reduce((a: number, b: number) => a + b, 0) / amounts.length;
    const isConsistent = amounts.every((a: number) =>
      Math.abs(a - avgAmount) / avgAmount < 0.15
    );
    if (!isConsistent) continue;

    // Calculate frequency from date gaps
    const gaps: number[] = [];
    for (let i = 1; i < txns.length; i++) {
      const diff = (new Date(txns[i].date).getTime() - new Date(txns[i - 1].date).getTime())
        / (1000 * 60 * 60 * 24);
      gaps.push(diff);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    // Must be at least bi-weekly frequency (not weekly subscriptions)
    let frequency: string;
    if (avgGap <= 20) frequency = 'biweekly';
    else if (avgGap <= 45) frequency = 'monthly';
    else if (avgGap <= 100) frequency = 'quarterly';
    else continue; // yearly or irregular — skip

    // Classify the loan type
    const sampleTxn = txns[0];
    const nameStr = key;
    const category = (sampleTxn.category || '').toLowerCase();
    const categoryDetailed = (sampleTxn.category_detailed || '').toLowerCase();

    const classification = classifyLoanType(nameStr, category, categoryDetailed, avgAmount);
    if (!classification) continue; // Not a loan

    // Build display name
    const merchantDisplay = txns[0].merchant_name || txns[0].name || key;
    const displayName = buildDisplayName(merchantDisplay, classification.loanType);

    detected.push({
      loan_type: classification.loanType,
      merchant_name: key,
      display_name: displayName,
      estimated_monthly_payment: Math.round(avgAmount * 100) / 100,
      frequency,
      confidence: Math.min(classification.confidence, 1.0),
      first_seen_date: txns[0].date,
      last_payment_date: txns[txns.length - 1].date,
      payment_count: txns.length,
      category: sampleTxn.category || null,
      category_detailed: sampleTxn.category_detailed || null,
    });
  }

  // Sort by monthly payment descending, limit to top 5
  return detected
    .sort((a, b) => b.estimated_monthly_payment - a.estimated_monthly_payment)
    .slice(0, 5);
}

// ── Classification ───────────────────────────────────────────────

function classifyLoanType(
  name: string,
  category: string,
  categoryDetailed: string,
  amount: number
): { loanType: LoanType; confidence: number } | null {
  let confidence = 0.5;
  let loanType: LoanType = 'other';
  let hasKeywordMatch = false;
  let hasCategoryMatch = false;

  // Check if any loan category matches at all
  const isLoanCategory = LOAN_CATEGORIES.some(lc => category.includes(lc) || categoryDetailed.includes(lc));

  // Keyword matching (highest signal)
  if (matchesAny(name, MORTGAGE_KEYWORDS)) {
    loanType = 'mortgage';
    hasKeywordMatch = true;
  } else if (matchesAny(name, AUTO_KEYWORDS)) {
    loanType = 'auto_loan';
    hasKeywordMatch = true;
  } else if (matchesAny(name, STUDENT_KEYWORDS)) {
    loanType = 'student_loan';
    hasKeywordMatch = true;
  } else if (matchesAny(name, PERSONAL_KEYWORDS)) {
    loanType = 'personal_loan';
    hasKeywordMatch = true;
  }

  // Plaid category matching
  if (category.includes('mortgage') || categoryDetailed.includes('mortgage')) {
    if (!hasKeywordMatch) loanType = 'mortgage';
    hasCategoryMatch = true;
  } else if (categoryDetailed.includes('auto') && isLoanCategory) {
    if (!hasKeywordMatch) loanType = 'auto_loan';
    hasCategoryMatch = true;
  } else if (isLoanCategory) {
    hasCategoryMatch = true;
  }

  // Fallback: large recurring transfers with payment-related names
  // (Plaid often categorizes mortgage/loan auto-payments as TRANSFER_OUT)
  const isPaymentTransfer = !hasKeywordMatch && !hasCategoryMatch &&
    (category.includes('transfer') || category.includes('payment')) &&
    PAYMENT_INDICATORS.some(kw => name.includes(kw));

  // If neither keyword, category, nor payment-transfer heuristic matched, skip
  if (!hasKeywordMatch && !hasCategoryMatch && !isPaymentTransfer) return null;

  // Amount heuristic for unclassified loans
  if (loanType === 'other') {
    if (amount >= 800) loanType = 'mortgage';
    else if (amount >= 400) loanType = 'auto_loan';
    else loanType = 'personal_loan';
  }

  // Build confidence score
  if (hasKeywordMatch) confidence += 0.2;
  if (hasCategoryMatch) confidence += 0.15;
  if (isPaymentTransfer) confidence += 0.1; // Lower confidence for heuristic match

  return { loanType, confidence };
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some(kw => text.includes(kw));
}

function buildDisplayName(merchant: string, loanType: LoanType): string {
  const typeLabels: Record<LoanType, string> = {
    mortgage: 'Mortgage',
    auto_loan: 'Auto Loan',
    student_loan: 'Student Loan',
    personal_loan: 'Personal Loan',
    other: 'Loan Payment',
  };

  // Capitalize merchant name
  const name = merchant.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  // Avoid duplication if merchant already contains the loan type word
  const lowerName = name.toLowerCase();
  const lowerLabel = typeLabels[loanType].toLowerCase();
  if (lowerName.includes(lowerLabel.split(' ')[0])) {
    return name;
  }

  return `${name} ${typeLabels[loanType]}`;
}
