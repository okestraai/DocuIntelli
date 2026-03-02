import React, { useState, useEffect } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Platform, ActivityIndicator, Alert, KeyboardAvoidingView,
} from 'react-native';
import { Plus, Trash2, Calendar, X } from 'lucide-react-native';
import Button from '../ui/Button';
import {
  getGoalActivities,
  createGoalActivity,
  deleteGoalActivity,
  FinancialGoal,
  GoalActivity,
  GoalType,
} from '../../lib/financialGoalsApi';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

const AMOUNT_HELP: Record<GoalType, string> = {
  savings: 'Amount saved toward this goal',
  spending_limit: 'Additional spending not captured by bank',
  debt_paydown: 'Extra payment toward this debt',
  income_target: 'Additional income earned',
  ad_hoc: 'Progress amount to log',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

interface LogActivityModalProps {
  visible: boolean;
  goal: FinancialGoal;
  onClose: () => void;
  onActivityChanged: () => void;
}

export default function LogActivityModal({
  visible,
  goal,
  onClose,
  onActivityChanged,
}: LogActivityModalProps) {
  const [activities, setActivities] = useState<GoalActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [activityDate, setActivityDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setAmount('');
      setDescription('');
      setActivityDate(new Date().toISOString().split('T')[0]);
      setError(null);
      setLoadingActivities(true);
      getGoalActivities(goal.id)
        .then(data => setActivities(data.activities))
        .catch(err => console.error('Failed to load activities:', err))
        .finally(() => setLoadingActivities(false));
    }
  }, [visible, goal.id]);

  const handleSubmit = async () => {
    setError(null);

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setError('Amount must be a positive number');
      return;
    }
    if (!activityDate) {
      setError('Date is required');
      return;
    }

    setSubmitting(true);
    try {
      const newActivity = await createGoalActivity(goal.id, {
        amount: parsed,
        description: description.trim() || undefined,
        activity_date: activityDate,
      });
      setActivities(prev => [newActivity, ...prev]);
      setAmount('');
      setDescription('');
      setActivityDate(new Date().toISOString().split('T')[0]);
      onActivityChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to log activity');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (activity: GoalActivity) => {
    if (Platform.OS === 'web') {
      if (confirm('Delete this activity entry?')) {
        confirmDelete(activity.id);
      }
    } else {
      Alert.alert(
        'Delete Activity',
        'Delete this activity entry?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(activity.id) },
        ],
      );
    }
  };

  const confirmDelete = async (activityId: string) => {
    setDeletingId(activityId);
    try {
      await deleteGoalActivity(goal.id, activityId);
      setActivities(prev => prev.filter(a => a.id !== activityId));
      onActivityChanged();
    } catch (err) {
      console.error('Failed to delete activity:', err);
    } finally {
      setDeletingId(null);
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
                <Text style={styles.headerTitle}>Log Activity</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>{goal.name}</Text>
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
              {/* Form */}
              <View style={styles.formSection}>
                {/* Amount */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Amount</Text>
                  <View style={styles.amountInputWrap}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      value={amount}
                      onChangeText={setAmount}
                      placeholder="0.00"
                      placeholderTextColor={colors.slate[400]}
                      style={styles.amountInput}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <Text style={styles.helpText}>{AMOUNT_HELP[goal.goal_type]}</Text>
                </View>

                {/* Date + Note row */}
                <View style={styles.rowFields}>
                  <View style={styles.halfField}>
                    <Text style={styles.fieldLabel}>Date</Text>
                    {isWeb ? (
                      <TextInput
                        value={activityDate}
                        onChangeText={setActivityDate}
                        style={styles.textInput}
                        // @ts-ignore — web-only attribute
                        type="date"
                      />
                    ) : (
                      <TextInput
                        value={activityDate}
                        onChangeText={setActivityDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={colors.slate[400]}
                        style={styles.textInput}
                        keyboardType="numbers-and-punctuation"
                      />
                    )}
                  </View>
                  <View style={styles.halfField}>
                    <Text style={styles.fieldLabel}>
                      Note <Text style={styles.optionalLabel}>(optional)</Text>
                    </Text>
                    <TextInput
                      value={description}
                      onChangeText={setDescription}
                      placeholder="e.g., Cash deposit"
                      placeholderTextColor={colors.slate[400]}
                      style={styles.textInput}
                    />
                  </View>
                </View>

                {/* Error */}
                {error && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {/* Submit button */}
                <Button
                  title={submitting ? 'Logging...' : 'Log Activity'}
                  onPress={handleSubmit}
                  variant="primary"
                  size="md"
                  loading={submitting}
                  disabled={submitting}
                  icon={!submitting ? <Plus size={16} color={colors.white} strokeWidth={2} /> : undefined}
                  fullWidth
                />
              </View>

              {/* Activity History */}
              <View style={styles.historySection}>
                <Text style={styles.historyTitle}>Activity History</Text>
                {loadingActivities ? (
                  <View style={styles.centered}>
                    <ActivityIndicator size="small" color={colors.primary[500]} />
                  </View>
                ) : activities.length === 0 ? (
                  <Text style={styles.emptyText}>No activities logged yet.</Text>
                ) : (
                  <View style={styles.activityList}>
                    {activities.map(a => (
                      <View key={a.id} style={styles.activityRow}>
                        <View style={styles.activityInfo}>
                          <View style={styles.activityDateRow}>
                            <Calendar size={12} color={colors.slate[400]} strokeWidth={2} />
                            <Text style={styles.activityDate}>
                              {new Date(a.activity_date + 'T00:00:00').toLocaleDateString()}
                            </Text>
                          </View>
                          <Text style={styles.activityDesc} numberOfLines={1}>
                            {a.description || 'No description'}
                          </Text>
                        </View>
                        <View style={styles.activityActions}>
                          <Text style={styles.activityAmount}>
                            +{formatCurrency(a.amount)}
                          </Text>
                          <TouchableOpacity
                            onPress={() => handleDelete(a)}
                            disabled={deletingId === a.id}
                            hitSlop={8}
                            style={styles.deleteBtn}
                          >
                            {deletingId === a.id ? (
                              <ActivityIndicator size="small" color={colors.slate[400]} />
                            ) : (
                              <Trash2 size={14} color={colors.slate[400]} strokeWidth={2} />
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
              <Button
                title="Close"
                onPress={onClose}
                variant="ghost"
                size="md"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
  },
  keyboardAvoid: {
    ...(Platform.OS === 'web' ? {
      maxWidth: 500,
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
    maxHeight: '85%',
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
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
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
  },
  formSection: {
    gap: spacing.md,
  },
  fieldGroup: {
    gap: spacing.xs,
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
  helpText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
  },
  rowFields: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfField: {
    flex: 1,
    gap: spacing.xs,
  },
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
  historySection: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  historyTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[400],
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  activityList: {
    gap: spacing.sm,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.slate[50],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.slate[100],
    padding: spacing.md,
  },
  activityInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  activityDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activityDate: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
  },
  activityDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
  },
  activityActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.sm,
  },
  activityAmount: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[700],
  },
  deleteBtn: {
    padding: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate[200],
  },
});
