import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Receipt, CalendarClock, Plus, X as XIcon } from 'lucide-react-native';
import type { RecurringBill } from '../../lib/financialApi';
import {
  getTagOptions,
  addIncomeStreamTag,
  removeIncomeStreamTag,
} from '../../lib/financialApi';
import CollapsibleSection from './CollapsibleSection';
import TagPicker from '../ui/TagPicker';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface RecurringBillsListProps {
  bills: RecurringBill[];
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// Derive auto-tags from bill properties (frequency + category)
function getAutoTags(bill: RecurringBill): string[] {
  const tags: string[] = [];
  if (bill.frequency) tags.push(capitalize(bill.frequency));
  if (bill.category) tags.push(bill.category);
  return [...new Set(tags)];
}

export default function RecurringBillsList({ bills }: RecurringBillsListProps) {
  const [billTagOptions, setBillTagOptions] = useState<string[]>([]);
  const [localTags, setLocalTags] = useState<Record<string, string[]>>({});
  const [materialized, setMaterialized] = useState<Set<string>>(new Set());
  const [pickerStem, setPickerStem] = useState<string | null>(null);

  useEffect(() => {
    getTagOptions().then(opts => setBillTagOptions(opts.bill_tags || [])).catch(() => {});
  }, []);

  // Initialize tags: use user_tags if present, otherwise auto-derive from frequency + category
  useEffect(() => {
    const tags: Record<string, string[]> = {};
    const alreadySaved = new Set<string>();
    for (const b of bills) {
      if (b.merchant_stem) {
        const userTags = b.user_tags || [];
        if (userTags.length > 0) {
          tags[b.merchant_stem] = [...userTags];
          alreadySaved.add(b.merchant_stem);
        } else {
          tags[b.merchant_stem] = getAutoTags(b);
        }
      }
    }
    setLocalTags(tags);
    setMaterialized(alreadySaved);
  }, [bills]);

  if (!bills.length) return null;

  const total = bills.reduce((sum, b) => sum + b.monthly_amount, 0);

  // Persist auto-derived tags to DB so future add/remove works correctly
  const ensureMaterialized = async (stem: string) => {
    if (materialized.has(stem)) return;
    const currentTags = localTags[stem] || [];
    for (const tag of currentTags) {
      await addIncomeStreamTag(stem, tag);
    }
    setMaterialized(prev => new Set(prev).add(stem));
  };

  const handleAddTag = async (bill: RecurringBill, tag: string) => {
    const stem = bill.merchant_stem;
    setLocalTags(prev => ({ ...prev, [stem]: [...(prev[stem] || []), tag] }));
    setPickerStem(null);
    try {
      await ensureMaterialized(stem);
      await addIncomeStreamTag(stem, tag);
    } catch {
      setLocalTags(prev => ({ ...prev, [stem]: (prev[stem] || []).filter(t => t !== tag) }));
    }
  };

  const handleRemoveTag = async (bill: RecurringBill, tag: string) => {
    const stem = bill.merchant_stem;
    const remaining = (localTags[stem] || []).filter(t => t !== tag);
    setLocalTags(prev => ({ ...prev, [stem]: remaining }));
    try {
      if (!materialized.has(stem)) {
        // Materialize only the remaining tags (skips the removed one)
        for (const t of remaining) {
          await addIncomeStreamTag(stem, t);
        }
        setMaterialized(prev => new Set(prev).add(stem));
      } else {
        await removeIncomeStreamTag(stem, tag);
      }
    } catch {
      console.error('Failed to remove bill tag');
    }
  };

  const pickerBill = bills.find(b => b.merchant_stem === pickerStem);

  return (
    <CollapsibleSection
      icon={<Receipt size={18} color={colors.primary[600]} strokeWidth={2} />}
      title="Recurring Bills"
      trailing={<Text style={styles.total}>{formatCurrency(total)}/mo</Text>}
    >
      <View style={styles.list}>
        {bills.slice(0, 10).map((bill, i) => {
          const stem = bill.merchant_stem || `bill-${i}`;
          const tags = localTags[stem] || [];

          return (
            <View key={`${bill.name}-${i}`} style={styles.row}>
              <View style={styles.billInfo}>
                <Text style={styles.billName} numberOfLines={1}>{bill.name}</Text>
                {bill.next_expected && (
                  <View style={styles.nextDate}>
                    <CalendarClock size={12} color={colors.slate[400]} strokeWidth={2} />
                    <Text style={styles.nextDateText}>Next: {formatDate(bill.next_expected)}</Text>
                  </View>
                )}
                {/* Tags row — frequency + category auto-derived, plus user tags */}
                <View style={styles.tagRow}>
                  {tags.map(tag => (
                    <TouchableOpacity
                      key={tag}
                      onPress={() => handleRemoveTag(bill, tag)}
                    >
                      <View style={styles.tagInner}>
                        <Text style={styles.tagText}>{tag}</Text>
                        <XIcon size={10} color={colors.warning[600]} />
                      </View>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => setPickerStem(stem)}
                    style={styles.addButton}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Plus size={12} color={colors.slate[400]} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.billAmount}>{formatCurrency(bill.monthly_amount)}/mo</Text>
            </View>
          );
        })}
      </View>

      <TagPicker
        visible={!!pickerStem}
        title="Label Bill"
        options={billTagOptions}
        existingTags={pickerStem ? (localTags[pickerStem] || []) : []}
        onSelect={(tag) => pickerBill && handleAddTag(pickerBill, tag)}
        onClose={() => setPickerStem(null)}
      />
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  total: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[600],
  },
  list: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
  },
  billInfo: {
    flex: 1,
    marginRight: spacing.md,
    gap: spacing.xs,
  },
  billName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[800],
  },
  nextDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nextDateText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
  },
  billAmount: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    marginTop: 2,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tagInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    backgroundColor: colors.warning[50],
    borderColor: colors.warning[200],
  },
  tagText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.warning[700],
  },
  addButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.slate[50],
  },
});
