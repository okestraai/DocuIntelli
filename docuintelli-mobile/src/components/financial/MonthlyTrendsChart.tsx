import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { BarChart3 } from 'lucide-react-native';
import type { MonthlyAverage } from '../../lib/financialApi';
import CollapsibleSection from './CollapsibleSection';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface MonthlyTrendsChartProps {
  data: MonthlyAverage[];
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'short' });
}

export default function MonthlyTrendsChart({ data }: MonthlyTrendsChartProps) {
  if (!data.length) return null;

  const maxValue = Math.max(...data.flatMap((d) => [d.income, d.expenses]));
  const BAR_MAX_HEIGHT = 80;

  return (
    <CollapsibleSection
      icon={<BarChart3 size={18} color={colors.primary[600]} strokeWidth={2} />}
      title="Monthly Trends"
    >
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success[500] }]} />
          <Text style={styles.legendText}>Income</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.error[500] }]} />
          <Text style={styles.legendText}>Expenses</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chartContainer}
      >
        {data.map((month) => {
          const incomeHeight = maxValue > 0 ? (month.income / maxValue) * BAR_MAX_HEIGHT : 0;
          const expenseHeight = maxValue > 0 ? (month.expenses / maxValue) * BAR_MAX_HEIGHT : 0;
          const isPositiveNet = month.net >= 0;
          return (
            <View key={month.month} style={styles.monthCol}>
              <View style={styles.barsRow}>
                <View style={styles.barWrap}>
                  <View style={[styles.bar, styles.incomeBar, { height: Math.max(incomeHeight, 4) }]} />
                </View>
                <View style={styles.barWrap}>
                  <View style={[styles.bar, styles.expenseBar, { height: Math.max(expenseHeight, 4) }]} />
                </View>
              </View>
              <Text style={styles.monthLabel}>{formatMonth(month.month)}</Text>
              <Text style={[styles.netLabel, isPositiveNet ? styles.netPositive : styles.netNegative]}>
                {isPositiveNet ? '+' : ''}{formatCurrency(month.net)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
  },
  chartContainer: {
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  monthCol: {
    alignItems: 'center',
    minWidth: 56,
    gap: spacing.xs,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 80,
  },
  barWrap: {
    justifyContent: 'flex-end',
    width: 16,
    height: 80,
  },
  bar: {
    width: 16,
    borderRadius: 4,
  },
  incomeBar: {
    backgroundColor: colors.success[500],
  },
  expenseBar: {
    backgroundColor: colors.error[500],
  },
  monthLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[500],
  },
  netLabel: {
    fontSize: 10,
    fontWeight: typography.fontWeight.semibold,
  },
  netPositive: {
    color: colors.success[600],
  },
  netNegative: {
    color: colors.error[600],
  },
});
