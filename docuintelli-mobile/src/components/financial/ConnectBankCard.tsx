import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Building2, Plus, ArrowRight } from 'lucide-react-native';
import Button from '../ui/Button';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface ConnectBankCardProps {
  onConnect: () => void;
  loading?: boolean;
  /** Show as compact inline button instead of full CTA card */
  compact?: boolean;
}

export default function ConnectBankCard({ onConnect, loading = false, compact = false }: ConnectBankCardProps) {
  if (compact) {
    return (
      <Button
        title="Connect Bank"
        onPress={onConnect}
        loading={loading}
        variant="outline"
        size="sm"
        icon={<Plus size={16} color={colors.slate[700]} strokeWidth={2} />}
      />
    );
  }

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={[...colors.gradient.primaryLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.iconCircle}
      >
        <Building2 size={28} color={colors.primary[600]} strokeWidth={1.5} />
      </LinearGradient>

      <Text style={styles.title}>Connect Your Bank</Text>
      <Text style={styles.description}>
        Link your accounts to get AI-powered spending insights, bill tracking, and personalized financial recommendations.
      </Text>

      <View style={styles.features}>
        {['Spending analysis', 'Bill tracking', 'Loan detection'].map((f) => (
          <View key={f} style={styles.featureRow}>
            <View style={styles.featureDot} />
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      <Button
        title="Connect Bank Account"
        onPress={onConnect}
        loading={loading}
        variant="primary"
        size="lg"
        icon={<Building2 size={18} color={colors.white} strokeWidth={2} />}
        iconRight={<ArrowRight size={16} color={colors.white} strokeWidth={2} />}
        fullWidth
      />

      <Text style={styles.secureNote}>
        Secured by Plaid · Bank-level encryption
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.slate[200],
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  features: {
    alignSelf: 'stretch',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary[500],
  },
  featureText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[700],
  },
  secureNote: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    marginTop: spacing.md,
  },
});
