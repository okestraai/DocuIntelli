import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DollarSign, TrendingUp, TrendingDown, PiggyBank } from 'lucide-react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface FinancialSummaryCardsProps {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsRate: number;
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

interface KPIConfig {
  label: string;
  value: string;
  icon: React.ReactNode;
  bg: string;
  iconBg: string;
}

export default function FinancialSummaryCards({
  totalBalance,
  monthlyIncome,
  monthlyExpenses,
  savingsRate,
}: FinancialSummaryCardsProps) {
  const cards: KPIConfig[] = [
    {
      label: 'Total Balance',
      value: formatCurrency(totalBalance),
      icon: <DollarSign size={18} color={colors.primary[600]} strokeWidth={2} />,
      bg: colors.primary[50],
      iconBg: colors.primary[100],
    },
    {
      label: 'Monthly Income',
      value: formatCurrency(monthlyIncome),
      icon: <TrendingUp size={18} color={colors.success[600]} strokeWidth={2} />,
      bg: colors.success[50],
      iconBg: colors.success[100],
    },
    {
      label: 'Monthly Expenses',
      value: formatCurrency(monthlyExpenses),
      icon: <TrendingDown size={18} color={colors.error[600]} strokeWidth={2} />,
      bg: colors.error[50],
      iconBg: colors.error[100],
    },
    {
      label: 'Savings Rate',
      value: `${Math.round(savingsRate)}%`,
      icon: <PiggyBank size={18} color={colors.teal[600]} strokeWidth={2} />,
      bg: colors.teal[50],
      iconBg: colors.teal[100],
    },
  ];

  return (
    <View style={styles.grid}>
      {cards.map((card) => (
        <View key={card.label} style={[styles.card, { backgroundColor: card.bg }]}>
          <View style={[styles.iconWrap, { backgroundColor: card.iconBg }]}>
            {card.icon}
          </View>
          <Text style={styles.value} numberOfLines={1}>{card.value}</Text>
          <Text style={styles.label}>{card.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    flex: 1,
    minWidth: '47%',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.xs,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  value: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  label: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[500],
  },
});
