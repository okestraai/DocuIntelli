import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle } from 'lucide-react-native';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { borderRadius, spacing } from '../../theme/spacing';

interface PlanCardProps {
  name: string;
  price: string;
  period: string;
  features: string[];
  isCurrent: boolean;
  isUpgrade: boolean;
  disabled: boolean;
  onSelect: () => void;
}

export default function PlanCard({
  name,
  price,
  period,
  features,
  isCurrent,
  isUpgrade,
  disabled,
  onSelect,
}: PlanCardProps) {
  const isDowngrade = !isCurrent && !isUpgrade;

  return (
    <Card style={styles.card}>
      {/* Header section */}
      {isCurrent ? (
        <LinearGradient
          colors={[...colors.gradient.primaryLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <View style={styles.nameRow}>
              <Text style={styles.planName}>{name}</Text>
              <Badge label="Current Plan" variant="primary" />
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{price}</Text>
              <Text style={styles.period}>{period}</Text>
            </View>
          </View>
        </LinearGradient>
      ) : (
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.planName}>{name}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{price}</Text>
              <Text style={styles.period}>{period}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Feature list */}
      <View style={styles.features}>
        {features.map((feature, index) => (
          <View key={index} style={styles.featureRow}>
            <CheckCircle size={18} color={colors.primary[500]} />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      {/* Action button */}
      {!isCurrent && (
        <View style={styles.buttonContainer}>
          {disabled ? (
            <Button
              title={`${isUpgrade ? 'Upgrade' : 'Downgrade'} to ${name}`}
              onPress={onSelect}
              variant={isUpgrade ? 'primary' : 'outline'}
              disabled
              fullWidth
            />
          ) : isUpgrade ? (
            <Button
              title={`Upgrade to ${name}`}
              onPress={onSelect}
              variant="primary"
              fullWidth
            />
          ) : (
            <Button
              title={`Downgrade to ${name}`}
              onPress={onSelect}
              variant="outline"
              fullWidth
            />
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  header: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
  },
  headerContent: {
    gap: spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planName: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  period: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.normal,
    color: colors.slate[500],
    marginLeft: spacing.xs,
  },
  features: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.normal,
    color: colors.slate[700],
    flex: 1,
  },
  buttonContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
});
