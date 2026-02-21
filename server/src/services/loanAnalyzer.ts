/**
 * Loan Analyzer
 * AI-powered loan document analysis: extracts loan details,
 * calculates payoff scenarios, and generates refinancing recommendations.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ANALYSIS_CACHE_TTL_DAYS = 7;

// ── Types ────────────────────────────────────────────────────────

export interface LoanExtractedData {
  loan_amount: number | null;
  interest_rate: number | null;
  term_months: number | null;
  remaining_balance: number | null;
  monthly_payment: number | null;
  origination_date: string | null;
  maturity_date: string | null;
  lender_name: string | null;
}

export interface PayoffScenario {
  extra_monthly: number;
  months_remaining: number;
  total_interest: number;
  months_saved: number;
  interest_saved: number;
}

export interface PayoffTimeline {
  current_months_remaining: number;
  current_total_interest: number;
  scenarios: PayoffScenario[];
}

export interface RefinancingAnalysis {
  potential_savings: number | null;
  break_even_months: number | null;
  recommendation: string;
}

export interface LoanAnalysisResult {
  id?: string;
  extracted_data: LoanExtractedData;
  analysis_text: string;
  payoff_timeline: PayoffTimeline | null;
  refinancing_analysis: RefinancingAnalysis | null;
}

// ── Main Analyzer ────────────────────────────────────────────────

export async function analyzeLoanDocument(
  userId: string,
  detectedLoanId: string,
  documentId: string,
  loanType: string,
  estimatedPayment: number
): Promise<LoanAnalysisResult> {
  // Fetch document text from chunks
  const { data: chunks } = await supabase
    .from('document_chunks')
    .select('chunk_text, chunk_index')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true })
    .limit(20);

  const documentText = (chunks || [])
    .map((c: any) => c.chunk_text)
    .join('\n\n')
    .slice(0, 8000); // Cap to avoid exceeding token limits

  // Try AI extraction
  let extracted = await extractLoanDetailsWithAI(documentText, loanType, estimatedPayment);

  // Fill in from transaction data if AI missed fields
  if (!extracted.monthly_payment) {
    extracted.monthly_payment = estimatedPayment;
  }

  // Calculate payoff scenarios if we have enough data
  let payoffTimeline: PayoffTimeline | null = null;
  if (extracted.remaining_balance && extracted.interest_rate && extracted.monthly_payment) {
    payoffTimeline = calculatePayoffTimeline(
      extracted.remaining_balance,
      extracted.interest_rate,
      extracted.monthly_payment
    );
  }

  // Generate AI analysis text
  const analysisText = await generateAnalysisText(extracted, loanType, estimatedPayment, payoffTimeline);

  // Simple refinancing recommendation
  const refinancingAnalysis = generateRefinancingAnalysis(extracted, loanType);

  const result: LoanAnalysisResult = {
    extracted_data: extracted,
    analysis_text: analysisText,
    payoff_timeline: payoffTimeline,
    refinancing_analysis: refinancingAnalysis,
  };

  // Cache the result
  await cacheAnalysis(userId, detectedLoanId, documentId, result);

  return result;
}

// ── AI Extraction ────────────────────────────────────────────────

async function extractLoanDetailsWithAI(
  documentText: string,
  loanType: string,
  estimatedPayment: number
): Promise<LoanExtractedData> {
  const defaults: LoanExtractedData = {
    loan_amount: null,
    interest_rate: null,
    term_months: null,
    remaining_balance: null,
    monthly_payment: estimatedPayment,
    origination_date: null,
    maturity_date: null,
    lender_name: null,
  };

  if (!documentText || documentText.trim().length < 50) {
    return defaults;
  }

  const vllmChatUrl = process.env.VLLM_CHAT_URL;
  const cfAccessClientId = process.env.CF_ACCESS_CLIENT_ID;
  const cfAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  if (!vllmChatUrl || !cfAccessClientId || !cfAccessClientSecret) {
    console.log('📊 vLLM not configured — skipping AI loan extraction');
    return defaults;
  }

  try {
    const systemPrompt = `You are a financial document analyzer. Extract loan details from the provided document text. Return ONLY a valid JSON object with no other text.`;

    const userPrompt = `Extract loan details from this ${loanType.replace('_', ' ')} document.
The detected monthly payment from transactions is approximately $${estimatedPayment}.

DOCUMENT TEXT:
${documentText}

Return a JSON object with these fields (use null if not found):
{
  "loan_amount": <original principal as number>,
  "interest_rate": <APR as decimal e.g. 0.0625 for 6.25%>,
  "term_months": <loan term in months>,
  "remaining_balance": <current outstanding balance>,
  "monthly_payment": <monthly payment from document>,
  "origination_date": <YYYY-MM-DD or null>,
  "maturity_date": <YYYY-MM-DD or null>,
  "lender_name": <lender/servicer name>
}`;

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 500,
        stream: false,
      }),
    });

    if (!response.ok) {
      console.error('vLLM extraction error:', response.status);
      return defaults;
    }

    const result = await response.json() as any;
    const aiText = result.choices?.[0]?.message?.content || '';

    // Extract JSON from response
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return defaults;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      loan_amount: typeof parsed.loan_amount === 'number' ? parsed.loan_amount : null,
      interest_rate: typeof parsed.interest_rate === 'number' ? parsed.interest_rate : null,
      term_months: typeof parsed.term_months === 'number' ? parsed.term_months : null,
      remaining_balance: typeof parsed.remaining_balance === 'number' ? parsed.remaining_balance : null,
      monthly_payment: typeof parsed.monthly_payment === 'number' ? parsed.monthly_payment : estimatedPayment,
      origination_date: parsed.origination_date || null,
      maturity_date: parsed.maturity_date || null,
      lender_name: parsed.lender_name || null,
    };
  } catch (err) {
    console.error('AI loan extraction failed:', err);
    return defaults;
  }
}

// ── Payoff Calculations ──────────────────────────────────────────

function calculatePayoffTimeline(
  balance: number,
  annualRate: number,
  monthlyPayment: number
): PayoffTimeline {
  const monthlyRate = annualRate / 12;

  // Current trajectory
  const current = calculateMonthsToPayoff(balance, monthlyRate, monthlyPayment);

  // Extra payment scenarios
  const extras = [100, 200, 500];
  const scenarios: PayoffScenario[] = extras.map(extra => {
    const scenario = calculateMonthsToPayoff(balance, monthlyRate, monthlyPayment + extra);
    return {
      extra_monthly: extra,
      months_remaining: scenario.months,
      total_interest: Math.round(scenario.totalInterest * 100) / 100,
      months_saved: current.months - scenario.months,
      interest_saved: Math.round((current.totalInterest - scenario.totalInterest) * 100) / 100,
    };
  });

  return {
    current_months_remaining: current.months,
    current_total_interest: Math.round(current.totalInterest * 100) / 100,
    scenarios,
  };
}

function calculateMonthsToPayoff(
  balance: number,
  monthlyRate: number,
  payment: number
): { months: number; totalInterest: number } {
  if (monthlyRate === 0) {
    const months = Math.ceil(balance / payment);
    return { months, totalInterest: 0 };
  }

  let remaining = balance;
  let totalInterest = 0;
  let months = 0;
  const maxMonths = 600; // 50-year cap

  while (remaining > 0 && months < maxMonths) {
    const interest = remaining * monthlyRate;
    totalInterest += interest;
    const principal = payment - interest;

    if (principal <= 0) {
      // Payment doesn't cover interest
      return { months: maxMonths, totalInterest: balance * monthlyRate * maxMonths };
    }

    remaining -= principal;
    months++;
  }

  return { months, totalInterest };
}

// ── Analysis Text Generation ─────────────────────────────────────

async function generateAnalysisText(
  extracted: LoanExtractedData,
  loanType: string,
  estimatedPayment: number,
  payoff: PayoffTimeline | null
): Promise<string> {
  const vllmChatUrl = process.env.VLLM_CHAT_URL;
  const cfAccessClientId = process.env.CF_ACCESS_CLIENT_ID;
  const cfAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  if (!vllmChatUrl || !cfAccessClientId || !cfAccessClientSecret) {
    return buildFallbackAnalysis(extracted, loanType, estimatedPayment, payoff);
  }

  try {
    const dataSnapshot = [
      `Loan Type: ${loanType.replace('_', ' ')}`,
      extracted.lender_name ? `Lender: ${extracted.lender_name}` : null,
      extracted.loan_amount ? `Original Amount: $${extracted.loan_amount.toLocaleString()}` : null,
      extracted.remaining_balance ? `Remaining Balance: $${extracted.remaining_balance.toLocaleString()}` : null,
      extracted.interest_rate ? `Interest Rate: ${(extracted.interest_rate * 100).toFixed(2)}%` : null,
      extracted.term_months ? `Term: ${extracted.term_months} months` : null,
      `Monthly Payment: $${(extracted.monthly_payment || estimatedPayment).toLocaleString()}`,
      payoff ? `Months Remaining: ${payoff.current_months_remaining}` : null,
      payoff ? `Total Interest Remaining: $${payoff.current_total_interest.toLocaleString()}` : null,
    ].filter(Boolean).join('\n');

    const scenarioText = payoff ? payoff.scenarios.map(s =>
      `+$${s.extra_monthly}/mo: ${s.months_saved} months saved, $${s.interest_saved.toLocaleString()} interest saved`
    ).join('\n') : '(insufficient data for scenarios)';

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
          {
            role: 'system',
            content: 'You are a financial advisor providing concise, actionable loan analysis. Address the user directly with "you/your". Be encouraging but realistic. Keep the response under 200 words.',
          },
          {
            role: 'user',
            content: `Analyze this loan and provide a brief recommendation:\n\n${dataSnapshot}\n\nExtra Payment Scenarios:\n${scenarioText}\n\nProvide a 2-3 paragraph analysis covering: current status, best extra payment strategy, and one actionable tip.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 400,
        stream: false,
      }),
    });

    if (!response.ok) {
      return buildFallbackAnalysis(extracted, loanType, estimatedPayment, payoff);
    }

    const result = await response.json() as any;
    return result.choices?.[0]?.message?.content || buildFallbackAnalysis(extracted, loanType, estimatedPayment, payoff);
  } catch {
    return buildFallbackAnalysis(extracted, loanType, estimatedPayment, payoff);
  }
}

function buildFallbackAnalysis(
  extracted: LoanExtractedData,
  loanType: string,
  estimatedPayment: number,
  payoff: PayoffTimeline | null
): string {
  const payment = extracted.monthly_payment || estimatedPayment;
  const typeName = loanType.replace('_', ' ');
  let text = `Your ${typeName} has a monthly payment of $${payment.toLocaleString()}.`;

  if (extracted.remaining_balance) {
    text += ` The remaining balance is $${extracted.remaining_balance.toLocaleString()}.`;
  }
  if (extracted.interest_rate) {
    text += ` Your interest rate is ${(extracted.interest_rate * 100).toFixed(2)}%.`;
  }
  if (payoff) {
    text += ` At your current payment, you have approximately ${payoff.current_months_remaining} months remaining with $${payoff.current_total_interest.toLocaleString()} in total interest.`;
    if (payoff.scenarios.length > 0) {
      const best = payoff.scenarios[payoff.scenarios.length - 1];
      text += ` By adding $${best.extra_monthly}/month, you could save ${best.months_saved} months and $${best.interest_saved.toLocaleString()} in interest.`;
    }
  }

  return text;
}

// ── Refinancing ──────────────────────────────────────────────────

function generateRefinancingAnalysis(
  extracted: LoanExtractedData,
  loanType: string
): RefinancingAnalysis | null {
  if (!extracted.interest_rate || !extracted.remaining_balance) {
    return null;
  }

  // Rough current average rates by loan type (as of 2026)
  const benchmarkRates: Record<string, number> = {
    mortgage: 0.065,
    auto_loan: 0.068,
    student_loan: 0.055,
    personal_loan: 0.10,
    other: 0.08,
  };

  const benchmark = benchmarkRates[loanType] || 0.08;
  const currentRate = extracted.interest_rate;

  if (currentRate <= benchmark) {
    return {
      potential_savings: null,
      break_even_months: null,
      recommendation: `Your current rate of ${(currentRate * 100).toFixed(2)}% is at or below the typical ${(benchmark * 100).toFixed(1)}% benchmark. Refinancing is unlikely to save you money.`,
    };
  }

  // Estimate savings
  const balance = extracted.remaining_balance;
  const monthlyPayment = extracted.monthly_payment || 0;
  const monthsLeft = monthlyPayment > 0 ? Math.ceil(balance / monthlyPayment) : 0;
  const currentTotalInterest = balance * currentRate * (monthsLeft / 12);
  const newTotalInterest = balance * benchmark * (monthsLeft / 12);
  const savings = Math.round(currentTotalInterest - newTotalInterest);
  const closingCosts = Math.round(balance * 0.02); // ~2% estimate
  const breakEven = monthlyPayment > 0 ? Math.ceil(closingCosts / ((currentRate - benchmark) / 12 * balance)) : null;

  return {
    potential_savings: savings > 0 ? savings : null,
    break_even_months: breakEven,
    recommendation: `Your rate of ${(currentRate * 100).toFixed(2)}% is above the typical ${(benchmark * 100).toFixed(1)}%. Refinancing could save approximately $${savings.toLocaleString()} over the life of the loan${breakEven ? `, breaking even in about ${breakEven} months after closing costs` : ''}.`,
  };
}

// ── Cache ────────────────────────────────────────────────────────

async function cacheAnalysis(
  userId: string,
  detectedLoanId: string,
  documentId: string,
  result: LoanAnalysisResult
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ANALYSIS_CACHE_TTL_DAYS);

  try {
    // Delete old analyses for this loan
    await supabase
      .from('loan_analyses')
      .delete()
      .eq('detected_loan_id', detectedLoanId);

    await supabase.from('loan_analyses').insert({
      user_id: userId,
      detected_loan_id: detectedLoanId,
      document_id: documentId,
      extracted_data: result.extracted_data,
      analysis_text: result.analysis_text,
      payoff_timeline: result.payoff_timeline,
      refinancing_analysis: result.refinancing_analysis,
      generated_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('Failed to cache loan analysis:', err);
  }
}
