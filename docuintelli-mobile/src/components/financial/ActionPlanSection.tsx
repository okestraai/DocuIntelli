import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Target, AlertCircle, ArrowUpCircle, MinusCircle, CheckCircle2 } from 'lucide-react-native';
import type { ActionItem } from '../../lib/financialApi';
import { createGoal, getGoals, GoalType } from '../../lib/financialGoalsApi';
import CollapsibleSection from './CollapsibleSection';
import Badge from '../ui/Badge';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface ActionPlanSectionProps {
  items: ActionItem[];
  onGoalCreated?: () => void;
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const PRIORITY_CONFIG: Record<string, { variant: 'error' | 'warning' | 'info'; icon: React.ReactNode; label: string }> = {
  high: {
    variant: 'error',
    icon: <AlertCircle size={14} color={colors.error[600]} strokeWidth={2} />,
    label: 'High',
  },
  medium: {
    variant: 'warning',
    icon: <ArrowUpCircle size={14} color={colors.warning[600]} strokeWidth={2} />,
    label: 'Medium',
  },
  low: {
    variant: 'info',
    icon: <MinusCircle size={14} color={colors.info[600]} strokeWidth={2} />,
    label: 'Low',
  },
};

function inferGoalType(title: string): GoalType {
  const lower = title.toLowerCase();
  if (/save|saving|emergency fund/i.test(lower)) return 'savings';
  if (/reduce|cut|limit|spend/i.test(lower)) return 'spending_limit';
  if (/debt|pay off|loan/i.test(lower)) return 'debt_paydown';
  if (/income|earn/i.test(lower)) return 'income_target';
  return 'ad_hoc';
}

export default function ActionPlanSection({ items, onGoalCreated }: ActionPlanSectionProps) {
  const [addedGoals, setAddedGoals] = useState<Set<number>>(new Set());
  const [addingGoal, setAddingGoal] = useState<number | null>(null);

  // On mount, check existing goals to persist "Added to Goals" state across reloads
  useEffect(() => {
    if (items.length === 0) return;
    getGoals().then(data => {
      const goalNames = new Set(data.goals.map(g => g.name.toLowerCase()));
      const matched = new Set<number>();
      items.forEach((item, i) => {
        if (goalNames.has(item.title.slice(0, 60).toLowerCase())) {
          matched.add(i);
        }
      });
      if (matched.size > 0) setAddedGoals(matched);
    }).catch(() => {});
  }, [items]);

  if (!items.length) return null;

  const handleAddAsGoal = async (item: ActionItem, index: number) => {
    setAddingGoal(index);
    try {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 30);
      const targetAmount = item.potential_savings
        ? Math.round(item.potential_savings * 6)
        : 500;

      await createGoal({
        goal_type: inferGoalType(item.title),
        name: item.title.slice(0, 60),
        description: item.description,
        target_amount: targetAmount,
        target_date: targetDate.toISOString().split('T')[0],
        linked_account_ids: [],
      });
      setAddedGoals(prev => new Set(prev).add(index));
      onGoalCreated?.();
    } catch (err) {
      console.error('Failed to create goal:', err);
    } finally {
      setAddingGoal(null);
    }
  };

  return (
    <CollapsibleSection
      icon={<Target size={18} color={colors.primary[600]} strokeWidth={2} />}
      title="30-Day Action Plan"
    >
      <View style={styles.list}>
        {items.map((item, i) => {
          const config = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.low;
          const isAdded = addedGoals.has(i);
          const isAdding = addingGoal === i;

          return (
            <View key={i} style={styles.item}>
              <View style={styles.itemHeader}>
                {config.icon}
                <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                <Badge label={config.label} variant={config.variant} />
              </View>
              <Text style={styles.itemDescription}>{item.description}</Text>
              {item.potential_savings != null && item.potential_savings > 0 && (
                <Text style={styles.savings}>
                  Potential savings: {formatCurrency(item.potential_savings)}/mo
                </Text>
              )}
              <TouchableOpacity
                onPress={() => handleAddAsGoal(item, i)}
                disabled={isAdded || isAdding}
                style={[styles.goalButton, isAdded && styles.goalButtonAdded]}
                activeOpacity={0.7}
              >
                {isAdding ? (
                  <ActivityIndicator size={14} color={colors.slate[500]} />
                ) : isAdded ? (
                  <CheckCircle2 size={14} color={colors.success[600]} strokeWidth={2} />
                ) : (
                  <Target size={14} color={colors.slate[500]} strokeWidth={2} />
                )}
                <Text style={[styles.goalButtonText, isAdded && styles.goalButtonTextAdded]}>
                  {isAdded ? 'Added to Goals' : 'Add as Goal'}
                </Text>
              </TouchableOpacity>
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
  item: {
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
    gap: spacing.xs,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  itemTitle: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
  },
  itemDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    lineHeight: 20,
    paddingLeft: spacing.xl,
  },
  savings: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
    paddingLeft: spacing.xl,
  },
  goalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    marginLeft: spacing.xl,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  goalButtonAdded: {
    backgroundColor: colors.success[50],
    borderColor: colors.success[200],
  },
  goalButtonText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[600],
  },
  goalButtonTextAdded: {
    color: colors.success[700],
  },
});
