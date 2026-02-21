import React, { useState, useEffect } from 'react';
import {
  TrendingDown,
  Calculator,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Clock,
  Percent,
  Target,
} from 'lucide-react';
import { getLoanAnalysis, LoanAnalysis } from '../lib/financialApi';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface LoanAnalysisPanelProps {
  detectedLoanId: string;
  displayName: string;
  loanType: string;
}

export function LoanAnalysisPanel({ detectedLoanId, displayName, loanType }: LoanAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<LoanAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalysis();
  }, [detectedLoanId]);

  const loadAnalysis = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getLoanAnalysis(detectedLoanId);
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analysis');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-4 animate-pulse">
        <div className="h-5 bg-slate-200 rounded w-48 mb-4" />
        <div className="space-y-3">
          <div className="h-4 bg-slate-200 rounded w-full" />
          <div className="h-4 bg-slate-200 rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (error || !analysis) return null;

  const { extracted_data, payoff_timeline, refinancing_analysis, analysis_text } = analysis;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 sm:p-5"
      >
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-semibold text-slate-900">{displayName} Analysis</h3>
        </div>
        {expanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-5">
          {/* Extracted Details KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {extracted_data.remaining_balance !== null && (
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-[10px] font-medium text-slate-500 uppercase">Balance</span>
                </div>
                <p className="text-lg font-bold text-slate-900">{formatCurrency(extracted_data.remaining_balance)}</p>
              </div>
            )}
            {extracted_data.interest_rate !== null && (
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Percent className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-[10px] font-medium text-slate-500 uppercase">Rate</span>
                </div>
                <p className="text-lg font-bold text-slate-900">{(extracted_data.interest_rate * 100).toFixed(2)}%</p>
              </div>
            )}
            {payoff_timeline && (
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-[10px] font-medium text-slate-500 uppercase">Remaining</span>
                </div>
                <p className="text-lg font-bold text-slate-900">
                  {Math.floor(payoff_timeline.current_months_remaining / 12)}y {payoff_timeline.current_months_remaining % 12}m
                </p>
              </div>
            )}
            {payoff_timeline && (
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingDown className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-[10px] font-medium text-slate-500 uppercase">Interest Left</span>
                </div>
                <p className="text-lg font-bold text-red-600">{formatCurrency(payoff_timeline.current_total_interest)}</p>
              </div>
            )}
          </div>

          {/* Extra Payment Scenarios */}
          {payoff_timeline && payoff_timeline.scenarios.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2">
                <Target className="h-4 w-4 text-emerald-600" />
                Extra Payment Impact
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-200">
                      <th className="pb-2 pr-4">Extra/Month</th>
                      <th className="pb-2 pr-4">Time Saved</th>
                      <th className="pb-2 pr-4">Interest Saved</th>
                      <th className="pb-2">New Payoff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payoff_timeline.scenarios.map(scenario => (
                      <tr key={scenario.extra_monthly} className="border-b border-slate-100">
                        <td className="py-2.5 pr-4 font-semibold text-emerald-700">+{formatCurrency(scenario.extra_monthly)}</td>
                        <td className="py-2.5 pr-4">
                          <span className="text-emerald-600 font-medium">{scenario.months_saved} months</span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="text-emerald-600 font-medium">{formatCurrency(scenario.interest_saved)}</span>
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {Math.floor(scenario.months_remaining / 12)}y {scenario.months_remaining % 12}m
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AI Analysis Text */}
          {analysis_text && (
            <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800 mb-2">
                <Calculator className="h-4 w-4" />
                AI Analysis
              </h4>
              <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">{analysis_text}</p>
            </div>
          )}

          {/* Refinancing */}
          {refinancing_analysis && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-blue-800 mb-2">
                <RefreshCw className="h-4 w-4" />
                Refinancing Assessment
              </h4>
              <p className="text-slate-700 text-sm leading-relaxed">{refinancing_analysis.recommendation}</p>
              {refinancing_analysis.potential_savings && (
                <p className="mt-2 text-sm font-semibold text-blue-700">
                  Potential savings: {formatCurrency(refinancing_analysis.potential_savings)}
                  {refinancing_analysis.break_even_months && (
                    <span className="font-normal text-slate-600"> (break-even: ~{refinancing_analysis.break_even_months} months)</span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
