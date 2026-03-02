import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Calculator, DollarSign,
  Percent, Clock, TrendingDown, RefreshCw,
} from 'lucide-react-native';
import { getLoanAnalysis, type LoanAnalysis } from '../../lib/financialApi';
import Card from '../ui/Card';
import CollapsibleSection from './CollapsibleSection';
import LoadingSpinner from '../ui/LoadingSpinner';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface LoanAnalysisPanelProps {
  detectedLoanId: string;
  displayName: string;
  loanType?: string;
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

function formatMonths(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}mo`;
  if (m === 0) return `${y}y`;
  return `${y}y ${m}m`;
}

export default function LoanAnalysisPanel({ detectedLoanId, displayName }: LoanAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<LoanAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalysis();
  }, [detectedLoanId]);

  const loadAnalysis = async () => {
    setLoading(true);
    try {
      const data = await getLoanAnalysis(detectedLoanId);
      setAnalysis(data);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <View style={styles.loadingWrap}>
          <LoadingSpinner size="small" />
          <Text style={styles.loadingText}>Loading loan analysis...</Text>
        </View>
      </Card>
    );
  }

  if (!analysis) return null;

  const { extracted_data, analysis_text, payoff_timeline, refinancing_analysis } = analysis;

  return (
    <CollapsibleSection
      icon={<Calculator size={18} color={colors.primary[600]} strokeWidth={2} />}
      title={displayName}
    >
      {/* KPI Grid */}
      <View style={styles.kpiGrid}>
        {extracted_data.remaining_balance != null && (
          <KPICard
            icon={<DollarSign size={14} color={colors.primary[600]} strokeWidth={2} />}
            label="Balance"
            value={formatCurrency(extracted_data.remaining_balance)}
          />
        )}
        {extracted_data.interest_rate != null && (
          <KPICard
            icon={<Percent size={14} color={colors.warning[600]} strokeWidth={2} />}
            label="Interest Rate"
            value={`${(extracted_data.interest_rate * 100).toFixed(2)}%`}
          />
        )}
        {payoff_timeline && (
          <KPICard
            icon={<Clock size={14} color={colors.info[600]} strokeWidth={2} />}
            label="Remaining"
            value={formatMonths(payoff_timeline.current_months_remaining)}
          />
        )}
        {payoff_timeline && (
          <KPICard
            icon={<TrendingDown size={14} color={colors.error[600]} strokeWidth={2} />}
            label="Interest Left"
            value={formatCurrency(payoff_timeline.current_total_interest)}
          />
        )}
      </View>

      {/* Extra Payment Scenarios */}
      {payoff_timeline && payoff_timeline.scenarios.length > 0 && (
        <View style={styles.scenariosSection}>
          <Text style={styles.subTitle}>Extra Payment Impact</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.scenarioTable}>
              {/* Header row */}
              <View style={styles.scenarioHeaderRow}>
                <Text style={[styles.scenarioCell, styles.scenarioHeaderText]}>Extra/mo</Text>
                <Text style={[styles.scenarioCell, styles.scenarioHeaderText]}>Time Saved</Text>
                <Text style={[styles.scenarioCell, styles.scenarioHeaderText]}>Interest Saved</Text>
              </View>
              {payoff_timeline.scenarios.map((s) => (
                <View key={s.extra_monthly} style={styles.scenarioRow}>
                  <Text style={[styles.scenarioCell, styles.scenarioExtraAmount]}>
                    +{formatCurrency(s.extra_monthly)}
                  </Text>
                  <Text style={[styles.scenarioCell, styles.scenarioHighlight]}>
                    {formatMonths(s.months_saved)}
                  </Text>
                  <Text style={[styles.scenarioCell, styles.scenarioHighlight]}>
                    {formatCurrency(s.interest_saved)}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* AI Analysis Text */}
      {analysis_text && (
        <LinearGradient
          colors={[...colors.gradient.primaryLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.analysisBox}
        >
          <Text style={styles.analysisText}>{analysis_text}</Text>
        </LinearGradient>
      )}

      {/* Refinancing */}
      {refinancing_analysis && (
        <View style={styles.refiBox}>
          <View style={styles.refiHeader}>
            <RefreshCw size={14} color={colors.info[600]} strokeWidth={2} />
            <Text style={styles.refiTitle}>Refinancing Assessment</Text>
          </View>
          <Text style={styles.refiText}>{refinancing_analysis.recommendation}</Text>
          {refinancing_analysis.potential_savings != null && refinancing_analysis.potential_savings > 0 && (
            <View style={styles.refiStats}>
              <Text style={styles.refiStat}>
                Potential savings: {formatCurrency(refinancing_analysis.potential_savings)}
              </Text>
              {refinancing_analysis.break_even_months != null && (
                <Text style={styles.refiStat}>
                  Break-even: {refinancing_analysis.break_even_months} months
                </Text>
              )}
            </View>
          )}
        </View>
      )}
    </CollapsibleSection>
  );
}

function KPICard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.kpiCard}>
      {icon}
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
  },

  // KPI Grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kpiCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.slate[50],
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  kpiValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  kpiLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
  },

  // Scenarios
  scenariosSection: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  subTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
  },
  scenarioTable: {
    gap: spacing.xs,
  },
  scenarioHeaderRow: {
    flexDirection: 'row',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[200],
  },
  scenarioRow: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
  },
  scenarioCell: {
    width: 110,
    fontSize: typography.fontSize.sm,
  },
  scenarioHeaderText: {
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[500],
  },
  scenarioExtraAmount: {
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
  },
  scenarioHighlight: {
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[700],
  },

  // Analysis
  analysisBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  analysisText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[800],
    lineHeight: 20,
  },

  // Refinancing
  refiBox: {
    marginTop: spacing.md,
    backgroundColor: colors.info[50],
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.info[200],
    gap: spacing.sm,
  },
  refiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  refiTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.info[800],
  },
  refiText: {
    fontSize: typography.fontSize.sm,
    color: colors.info[700],
    lineHeight: 20,
  },
  refiStats: {
    gap: spacing.xs,
  },
  refiStat: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.info[700],
  },
});
