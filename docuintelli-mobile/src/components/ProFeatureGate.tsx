import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Crown, Lock, ArrowRight, Zap } from 'lucide-react-native';
import Button from './ui/Button';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

interface ProFeatureGateProps {
  featureName: string;
  featureDescription: string;
  onUpgrade: () => void;
  requiredPlan?: 'starter' | 'pro';
  price?: number;
}

export default function ProFeatureGate({
  featureName,
  featureDescription,
  onUpgrade,
  requiredPlan = 'pro',
  price,
}: ProFeatureGateProps) {
  const isStarter = requiredPlan === 'starter';
  const displayPrice = price ?? (isStarter ? 9 : 19);
  const badgeLabel = isStarter ? 'STARTER FEATURE' : 'PRO FEATURE';
  const buttonLabel = isStarter ? 'Upgrade to Starter' : 'Upgrade to Pro';
  const GateIcon = isStarter ? Zap : Crown;
  const badgeGradient = isStarter
    ? (['#059669', '#0d9488'] as const)  // emerald → teal
    : (['#d97706', '#f59e0b'] as const); // amber → yellow

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Gradient icon */}
        <LinearGradient
          colors={[...colors.gradient.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconCircle}
        >
          <GateIcon size={28} color={colors.white} strokeWidth={2} />
        </LinearGradient>

        {/* Tier badge */}
        <LinearGradient
          colors={[...badgeGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.badge}
        >
          <Crown size={10} color={colors.white} strokeWidth={2.5} />
          <Text style={styles.badgeText}>{badgeLabel}</Text>
        </LinearGradient>

        <Text style={styles.title}>{featureName}</Text>
        <Text style={styles.description}>{featureDescription}</Text>

        <Button
          title={buttonLabel}
          onPress={onUpgrade}
          variant="primary"
          size="lg"
          iconRight={<ArrowRight size={16} color={colors.white} strokeWidth={2} />}
          fullWidth
        />

        <Text style={styles.priceHint}>
          Starting at ${displayPrice}/mo · Cancel anytime
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.slate[50],
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    alignItems: 'center',
    maxWidth: 340,
    width: '100%',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: colors.slate[100],
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    marginBottom: spacing.lg,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1,
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
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  priceHint: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    marginTop: spacing.md,
  },
});
