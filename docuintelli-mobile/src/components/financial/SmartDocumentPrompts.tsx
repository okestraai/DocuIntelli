import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import {
  Home, Car, GraduationCap, Landmark, FileText,
  Upload, X,
} from 'lucide-react-native';
import {
  getDetectedLoans, dismissDetectedLoan, linkDocumentToLoan,
  type DetectedLoanPrompt,
} from '../../lib/financialApi';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { useToast } from '../../contexts/ToastContext';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface SmartDocumentPromptsProps {
  onUploadComplete: () => void;
}

const LOAN_CONFIG: Record<string, {
  icon: React.ElementType;
  bg: string;
  border: string;
  iconColor: string;
  badgeVariant: 'info' | 'warning' | 'primary' | 'success' | 'default';
}> = {
  mortgage: {
    icon: Home,
    bg: colors.info[50],
    border: colors.info[200],
    iconColor: colors.info[600],
    badgeVariant: 'info',
  },
  auto_loan: {
    icon: Car,
    bg: colors.warning[50],
    border: colors.warning[200],
    iconColor: colors.warning[600],
    badgeVariant: 'warning',
  },
  student_loan: {
    icon: GraduationCap,
    bg: '#f3e8ff',
    border: '#c4b5fd',
    iconColor: '#7c3aed',
    badgeVariant: 'default',
  },
  personal_loan: {
    icon: Landmark,
    bg: colors.primary[50],
    border: colors.primary[200],
    iconColor: colors.primary[600],
    badgeVariant: 'primary',
  },
  other: {
    icon: FileText,
    bg: colors.slate[50],
    border: colors.slate[200],
    iconColor: colors.slate[600],
    badgeVariant: 'default',
  },
};

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

export default function SmartDocumentPrompts({ onUploadComplete }: SmartDocumentPromptsProps) {
  const [loans, setLoans] = useState<DetectedLoanPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadLoans();
  }, []);

  const loadLoans = async () => {
    try {
      const data = await getDetectedLoans();
      setLoans(data);
    } catch {
      // Silently fail — this is a supplementary feature
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async (loanId: string) => {
    setDismissing(loanId);
    try {
      await dismissDetectedLoan(loanId);
      setLoans((prev) => prev.filter((l) => l.id !== loanId));
      showToast('Loan prompt dismissed', 'info');
    } catch {
      showToast('Failed to dismiss', 'error');
    } finally {
      setDismissing(null);
    }
  };

  const handleUploadForLoan = (loan: DetectedLoanPrompt) => {
    // Navigate to upload screen with loan context
    router.push({
      pathname: '/upload',
      params: {
        loanId: loan.id,
        loanName: loan.display_name,
        suggestedCategory: 'contract',
      },
    });
  };

  if (loading || !loans.length) return null;

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.sectionTitle}>Optimize Your Debts</Text>
        <Badge label={`${loans.length} detected`} variant="primary" />
      </View>
      <Text style={styles.sectionSubtitle}>
        We detected recurring loan payments in your transactions. Upload your statements for personalized payoff analysis.
      </Text>

      {loans.map((loan) => {
        const config = LOAN_CONFIG[loan.loan_type] || LOAN_CONFIG.other;
        const Icon = config.icon;
        const isDismissing = dismissing === loan.id;

        return (
          <View
            key={loan.id}
            style={[styles.card, { backgroundColor: config.bg, borderColor: config.border }]}
          >
            {/* Dismiss button */}
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={() => handleDismiss(loan.id)}
              disabled={isDismissing}
              activeOpacity={0.7}
            >
              {isDismissing
                ? <ActivityIndicator size="small" color={colors.slate[400]} />
                : <X size={16} color={colors.slate[400]} strokeWidth={2} />}
            </TouchableOpacity>

            {/* Header */}
            <View style={styles.cardHeader}>
              <Icon size={20} color={config.iconColor} strokeWidth={2} />
              <Text style={styles.loanName} numberOfLines={1}>{loan.display_name}</Text>
            </View>

            {/* Payment info */}
            <Text style={styles.paymentAmount}>
              ~{formatCurrency(loan.estimated_monthly_payment)}/{loan.frequency === 'monthly' ? 'mo' : loan.frequency}
            </Text>

            {/* Prompt text */}
            <Text style={styles.promptText}>{loan.prompt_text}</Text>

            {/* Footer */}
            <View style={styles.cardFooter}>
              <Badge
                label={`${Math.round(loan.confidence * 100)}% match`}
                variant={config.badgeVariant}
              />
              <Button
                title="Upload Doc"
                onPress={() => handleUploadForLoan(loan)}
                variant="primary"
                size="sm"
                icon={<Upload size={14} color={colors.white} strokeWidth={2} />}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  sectionSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    marginTop: -spacing.sm,
  },
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  dismissBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing['2xl'],
  },
  loanName: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
  },
  paymentAmount: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  promptText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
});
