import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PieChart } from 'lucide-react-native';
import type { CategoryBreakdown } from '../../lib/financialApi';
import CollapsibleSection from './CollapsibleSection';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface SpendingBreakdownProps {
  categories: CategoryBreakdown[];
}

const CATEGORY_COLORS = [
  colors.primary[500],
  colors.teal[500],
  colors.info[500],
  colors.warning[500],
  colors.error[500],
  colors.slate[400],
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f97316', // orange
  '#06b6d4', // cyan
];

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

export default function SpendingBreakdown({ categories }: SpendingBreakdownProps) {
  if (!categories.length) return null;

  const top = categories.slice(0, 8);
  const maxPercentage = Math.max(...top.map((c) => c.percentage));

  return (
    <CollapsibleSection
      icon={<PieChart size={18} color={colors.primary[600]} strokeWidth={2} />}
      title="Spending Breakdown"
    >
      <View style={styles.list}>
        {top.map((cat, i) => {
          const barWidth = maxPercentage > 0 ? (cat.percentage / maxPercentage) * 100 : 0;
          const barColor = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
          return (
            <View key={cat.category} style={styles.row}>
              <View style={styles.labelRow}>
                <View style={[styles.dot, { backgroundColor: barColor }]} />
                <Text style={styles.category} numberOfLines={1}>{cat.category}</Text>
                <Text style={styles.amount}>{formatCurrency(cat.monthly_average)}/mo</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${barWidth}%`, backgroundColor: barColor }]} />
              </View>
              <Text style={styles.percentage}>{Math.round(cat.percentage)}%</Text>
            </View>
          );
        })}
      </View>
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  row: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  category: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
  },
  amount: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
  },
  barTrack: {
    height: 6,
    backgroundColor: colors.slate[100],
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  percentage: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    textAlign: 'right',
  },
});
