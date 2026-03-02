import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Platform, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import {
  Target, PiggyBank, CreditCard, TrendingDown, TrendingUp,
  Sparkles, ChevronDown, ChevronUp, Check, X,
} from 'lucide-react-native';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import {
  createGoal,
  updateGoal,
  getGoalSuggestions,
  GoalType,
  GoalSuggestion,
  FinancialGoal,
  CreateGoalRequest,
} from '../../lib/financialGoalsApi';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

// ── Config ──────────────────────────────────────────────────

const GOAL_TYPE_OPTIONS: Array<{
  value: GoalType;
  label: string;
  description: string;
  Icon: any;
}> = [
  { value: 'savings', label: 'Savings', description: 'Save toward a target', Icon: PiggyBank },
  { value: 'spending_limit', label: 'Spending Limit', description: 'Limit spending', Icon: CreditCard },
  { value: 'debt_paydown', label: 'Debt Paydown', description: 'Pay down debt', Icon: TrendingDown },
  { value: 'income_target', label: 'Income Target', description: 'Track income', Icon: TrendingUp },
  { value: 'ad_hoc', label: 'Custom', description: 'Any goal', Icon: Target },
];

const ACCOUNT_TYPE_FILTER: Record<GoalType, string[] | null> = {
  savings: ['depository'],
  spending_limit: null,
  debt_paydown: ['credit', 'loan'],
  income_target: null,
  ad_hoc: null,
};

const PERIOD_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ── Checkbox ────────────────────────────────────────────────

function Checkbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7} hitSlop={8}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Check size={14} color={colors.white} strokeWidth={3} />}
      </View>
    </TouchableOpacity>
  );
}

// ── Main Modal ──────────────────────────────────────────────

interface GoalCreationModalProps {
  visible: boolean;
  onClose: () => void;
  onGoalCreated: () => void;
  connectedAccounts: any[];
  editingGoal: FinancialGoal | null;
}

export default function GoalCreationModal({
  visible,
  onClose,
  onGoalCreated,
  connectedAccounts,
  editingGoal,
}: GoalCreationModalProps) {
  const isEditing = !!editingGoal;

  // Form state
  const [goalType, setGoalType] = useState<GoalType>('savings');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [periodType, setPeriodType] = useState('monthly');
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

  // AI suggestions
  const [suggestions, setSuggestions] = useState<GoalSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      if (editingGoal) {
        setGoalType(editingGoal.goal_type);
        setName(editingGoal.name);
        setDescription(editingGoal.description || '');
        setTargetAmount(editingGoal.target_amount?.toString() || '');
        setTargetDate(editingGoal.target_date || '');
        setPeriodType(editingGoal.period_type || 'monthly');
        setSelectedAccounts(new Set(editingGoal.linked_account_ids || []));
        setShowSuggestions(false);
      } else {
        setGoalType('savings');
        setName('');
        setDescription('');
        setTargetAmount('');
        setTargetDate('');
        setPeriodType('monthly');
        setSelectedAccounts(new Set());
        setShowSuggestions(true);
      }
      setError(null);
      setSubmitting(false);
    }
  }, [visible, editingGoal]);

  // Load AI suggestions
  useEffect(() => {
    if (!isEditing && visible) {
      setSuggestionsLoading(true);
      getGoalSuggestions()
        .then(s => setSuggestions(s))
        .catch(err => console.error('Failed to load suggestions:', err))
        .finally(() => setSuggestionsLoading(false));
    }
  }, [isEditing, visible]);

  // Flatten all accounts
  const allAccounts = useMemo(() => {
    const result: Array<{
      account_id: string;
      name: string;
      type: string;
      subtype: string;
      mask: string;
      initial_balance: number;
    }> = [];
    for (const item of connectedAccounts) {
      for (const acct of item.accounts || []) {
        result.push(acct);
      }
    }
    return result;
  }, [connectedAccounts]);

  // Filter by goal type
  const typeFilter = ACCOUNT_TYPE_FILTER[goalType];
  const filteredAccounts = typeFilter
    ? allAccounts.filter(a => typeFilter.includes(a.type))
    : allAccounts;

  const toggleAccount = (accountId: string) => {
    setSelectedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const applySuggestion = (s: GoalSuggestion) => {
    setGoalType(s.goal_type);
    setName(s.name);
    setTargetAmount(s.suggested_target.toString());
    setTargetDate(s.suggested_date);
    setSelectedAccounts(new Set(s.linked_account_ids));
    setShowSuggestions(false);
  };

  const handleSubmit = async () => {
    setError(null);

    const amount = parseFloat(targetAmount);
    if (!name.trim()) { setError('Goal name is required'); return; }
    if (isNaN(amount) || amount <= 0) { setError('Target amount must be a positive number'); return; }
    if (!targetDate) { setError('Target date is required'); return; }

    const today = new Date().toISOString().split('T')[0];
    if (targetDate <= today) { setError('Target date must be in the future'); return; }

    setSubmitting(true);
    try {
      if (isEditing && editingGoal) {
        await updateGoal(editingGoal.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          target_amount: amount,
          target_date: targetDate,
          linked_account_ids: [...selectedAccounts],
        });
      } else {
        const data: CreateGoalRequest = {
          goal_type: goalType,
          name: name.trim(),
          description: description.trim() || undefined,
          target_amount: amount,
          target_date: targetDate,
          linked_account_ids: [...selectedAccounts],
        };
        if (goalType === 'spending_limit') {
          data.period_type = periodType;
        }
        await createGoal(data);
      }
      onGoalCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to save goal');
    } finally {
      setSubmitting(false);
    }
  };

  const isWeb = Platform.OS === 'web';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoid}
        >
          <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTextWrap}>
                <Text style={styles.headerTitle}>
                  {isEditing ? 'Edit Goal' : 'Create Financial Goal'}
                </Text>
                <Text style={styles.headerSubtitle}>
                  {isEditing ? 'Update your goal details' : 'Set a target and track progress'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.closeBtn}>
                <X size={20} color={colors.slate[400]} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {/* Scrollable body */}
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* AI Suggestions */}
              {!isEditing && (
                <View style={styles.suggestionsBox}>
                  <TouchableOpacity
                    onPress={() => setShowSuggestions(!showSuggestions)}
                    style={styles.suggestionsHeader}
                    activeOpacity={0.7}
                  >
                    <View style={styles.suggestionsHeaderLeft}>
                      <Sparkles size={16} color={colors.primary[600]} strokeWidth={2} />
                      <Text style={styles.suggestionsTitle}>AI-Suggested Goals</Text>
                      {suggestions.length > 0 && (
                        <View style={styles.suggestionsCount}>
                          <Text style={styles.suggestionsCountText}>{suggestions.length}</Text>
                        </View>
                      )}
                    </View>
                    {showSuggestions
                      ? <ChevronUp size={16} color={colors.primary[500]} strokeWidth={2} />
                      : <ChevronDown size={16} color={colors.primary[500]} strokeWidth={2} />}
                  </TouchableOpacity>

                  {showSuggestions && (
                    <View style={styles.suggestionsBody}>
                      {suggestionsLoading ? (
                        <View style={styles.suggestionsLoading}>
                          <ActivityIndicator size="small" color={colors.primary[500]} />
                          <Text style={styles.suggestionsLoadingText}>Analyzing your finances...</Text>
                        </View>
                      ) : suggestions.length === 0 ? (
                        <Text style={styles.suggestionsEmpty}>
                          No suggestions available. Create a custom goal below.
                        </Text>
                      ) : (
                        <View style={styles.suggestionsList}>
                          {suggestions.map((s, i) => {
                            const opt = GOAL_TYPE_OPTIONS.find(o => o.value === s.goal_type);
                            const SIcon = opt?.Icon || Target;
                            return (
                              <View key={i} style={styles.suggestionCard}>
                                <SIcon size={16} color={colors.primary[500]} strokeWidth={2} />
                                <View style={styles.suggestionText}>
                                  <Text style={styles.suggestionName} numberOfLines={1}>{s.name}</Text>
                                  <Text style={styles.suggestionDetail} numberOfLines={1}>
                                    {formatCurrency(s.suggested_target)} by{' '}
                                    {new Date(s.suggested_date + 'T00:00:00').toLocaleDateString()}
                                  </Text>
                                  <Text style={styles.suggestionReasoning} numberOfLines={2}>
                                    {s.reasoning}
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  onPress={() => applySuggestion(s)}
                                  style={styles.useThisBtn}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.useThisText}>Use This</Text>
                                </TouchableOpacity>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* Goal Type Selector */}
              {!isEditing && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Goal Type</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.typeScroll}
                  >
                    {GOAL_TYPE_OPTIONS.map(opt => {
                      const selected = goalType === opt.value;
                      const OptIcon = opt.Icon;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          onPress={() => {
                            setGoalType(opt.value);
                            setSelectedAccounts(new Set());
                          }}
                          style={[styles.typeBtn, selected && styles.typeBtnSelected]}
                          activeOpacity={0.7}
                        >
                          <OptIcon
                            size={16}
                            color={selected ? colors.primary[600] : colors.slate[400]}
                            strokeWidth={2}
                          />
                          <Text style={[
                            styles.typeBtnLabel,
                            selected && styles.typeBtnLabelSelected,
                          ]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Goal Name */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Goal Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g., Emergency Fund, Monthly Budget"
                  placeholderTextColor={colors.slate[400]}
                  style={styles.textInput}
                />
              </View>

              {/* Description */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Description <Text style={styles.optionalLabel}>(optional)</Text>
                </Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What is this goal for?"
                  placeholderTextColor={colors.slate[400]}
                  style={[styles.textInput, styles.textArea]}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>

              {/* Target Amount + Date */}
              <View style={styles.rowFields}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Target Amount</Text>
                  <View style={styles.amountInputWrap}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      value={targetAmount}
                      onChangeText={setTargetAmount}
                      placeholder="5,000"
                      placeholderTextColor={colors.slate[400]}
                      style={styles.amountInput}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Target Date</Text>
                  {isWeb ? (
                    <TextInput
                      value={targetDate}
                      onChangeText={setTargetDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.slate[400]}
                      style={styles.textInput}
                      // @ts-ignore — web-only attribute
                      type="date"
                    />
                  ) : (
                    <TextInput
                      value={targetDate}
                      onChangeText={setTargetDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.slate[400]}
                      style={styles.textInput}
                      keyboardType="numbers-and-punctuation"
                    />
                  )}
                </View>
              </View>

              {/* Period Type — spending_limit only */}
              {goalType === 'spending_limit' && !isEditing && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Budget Period</Text>
                  <View style={styles.periodRow}>
                    {PERIOD_OPTIONS.map(opt => {
                      const selected = periodType === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          onPress={() => setPeriodType(opt.value)}
                          style={[styles.periodBtn, selected && styles.periodBtnSelected]}
                          activeOpacity={0.7}
                        >
                          <Text style={[
                            styles.periodBtnText,
                            selected && styles.periodBtnTextSelected,
                          ]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Linked Accounts */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Linked Accounts
                  {goalType !== 'ad_hoc' && (
                    <Text style={styles.optionalLabel}> (select accounts to track)</Text>
                  )}
                </Text>
                {filteredAccounts.length === 0 ? (
                  <Text style={styles.noAccountsText}>
                    {allAccounts.length === 0
                      ? 'No connected accounts. Connect a bank account first.'
                      : `No ${typeFilter?.join('/')} accounts available for this goal type.`}
                  </Text>
                ) : (
                  <View style={styles.accountsList}>
                    {filteredAccounts.map(acct => {
                      const isLiability = acct.type === 'credit' || acct.type === 'loan';
                      const balance = isLiability
                        ? -Math.abs(acct.initial_balance || 0)
                        : (acct.initial_balance || 0);
                      const checked = selectedAccounts.has(acct.account_id);
                      return (
                        <TouchableOpacity
                          key={acct.account_id}
                          onPress={() => toggleAccount(acct.account_id)}
                          style={[styles.accountRow, checked && styles.accountRowChecked]}
                          activeOpacity={0.7}
                        >
                          <Checkbox
                            checked={checked}
                            onToggle={() => toggleAccount(acct.account_id)}
                          />
                          <View style={styles.accountInfo}>
                            <View style={styles.accountNameRow}>
                              <Text style={styles.accountName} numberOfLines={1}>
                                {acct.name}
                              </Text>
                              {acct.mask && (
                                <Text style={styles.accountMask}>{'\u2022\u2022'}{acct.mask}</Text>
                              )}
                            </View>
                            <Text style={styles.accountType}>{acct.type}</Text>
                          </View>
                          <Text style={[
                            styles.accountBalance,
                            isLiability && styles.negativeBalance,
                          ]}>
                            {formatCurrency(balance)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Error */}
              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
              <Button
                title="Cancel"
                onPress={onClose}
                variant="ghost"
                size="md"
                disabled={submitting}
              />
              <Button
                title={submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Goal'}
                onPress={handleSubmit}
                variant="primary"
                size="md"
                loading={submitting}
                disabled={submitting}
                icon={!submitting ? <Check size={16} color={colors.white} strokeWidth={2} /> : undefined}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
  },
  keyboardAvoid: {
    ...(Platform.OS === 'web' ? {
      maxWidth: 580,
      width: '95%',
    } : {}),
  },
  container: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    ...(Platform.OS === 'web' ? {
      borderBottomLeftRadius: borderRadius['2xl'],
      borderBottomRightRadius: borderRadius['2xl'],
    } : {}),
    maxHeight: '92%',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[200],
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    marginTop: 4,
  },
  closeBtn: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
  scrollArea: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },

  // AI Suggestions
  suggestionsBox: {
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.primary[200],
    overflow: 'hidden',
  },
  suggestionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  suggestionsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  suggestionsTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[800],
  },
  suggestionsCount: {
    backgroundColor: colors.primary[200],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  suggestionsCountText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[800],
  },
  suggestionsBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  suggestionsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  suggestionsLoadingText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[600],
  },
  suggestionsEmpty: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[600],
    paddingVertical: spacing.sm,
  },
  suggestionsList: {
    gap: spacing.sm,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary[100],
  },
  suggestionText: {
    flex: 1,
    minWidth: 0,
  },
  suggestionName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[900],
  },
  suggestionDetail: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    marginTop: 2,
  },
  suggestionReasoning: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    marginTop: 2,
  },
  useThisBtn: {
    backgroundColor: colors.primary[100],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  useThisText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[700],
  },

  // Goal type selector
  typeScroll: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
  },
  typeBtnSelected: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[50],
  },
  typeBtnLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
  },
  typeBtnLabelSelected: {
    color: colors.primary[800],
  },

  // Form fields
  fieldGroup: {
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
  },
  optionalLabel: {
    color: colors.slate[400],
    fontWeight: typography.fontWeight.normal,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.slate[200],
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.fontSize.sm,
    color: colors.slate[900],
    backgroundColor: colors.white,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  rowFields: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfField: {
    flex: 1,
    gap: spacing.sm,
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.slate[200],
    borderRadius: borderRadius.lg,
    backgroundColor: colors.white,
  },
  dollarSign: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[400],
    paddingLeft: spacing.md,
  },
  amountInput: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.fontSize.sm,
    color: colors.slate[900],
  },

  // Period type
  periodRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  periodBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  periodBtnSelected: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[50],
  },
  periodBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[600],
  },
  periodBtnTextSelected: {
    color: colors.primary[700],
  },

  // Linked accounts
  accountsList: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.slate[200],
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    maxHeight: 180,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
  },
  accountRowChecked: {
    backgroundColor: colors.primary[50],
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.slate[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  accountInfo: {
    flex: 1,
    minWidth: 0,
  },
  accountNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  accountName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[900],
    flexShrink: 1,
  },
  accountMask: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
  },
  accountType: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    textTransform: 'capitalize',
    marginTop: 2,
  },
  accountBalance: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  negativeBalance: {
    color: colors.error[600],
  },
  noAccountsText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[400],
    paddingVertical: spacing.sm,
  },

  // Error
  errorBox: {
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[200],
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.error[700],
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate[200],
  },
});
