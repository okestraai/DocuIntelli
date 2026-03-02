import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles, Building2 } from 'lucide-react-native';
import CollapsibleSection from './CollapsibleSection';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface AIInsightsSectionProps {
  insights: string[];
  accountAnalysis?: Record<string, string[]>;
  recommendations?: string;
}

export default function AIInsightsSection({
  insights,
  accountAnalysis,
  recommendations,
}: AIInsightsSectionProps) {
  if (!insights.length && !recommendations) return null;

  return (
    <View style={styles.container}>
      {/* AI Insights */}
      <CollapsibleSection
        icon={
          <LinearGradient
            colors={[...colors.gradient.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconWrap}
          >
            <Sparkles size={14} color={colors.white} strokeWidth={2} />
          </LinearGradient>
        }
        title="AI Financial Insights"
      >
        <View style={styles.insightsList}>
          {insights.map((insight, i) => (
            <View key={i} style={styles.insightRow}>
              <View style={styles.bullet} />
              <Text style={styles.insightText}>{insight}</Text>
            </View>
          ))}
        </View>

        {recommendations && (
          <LinearGradient
            colors={[...colors.gradient.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.recoBox}
          >
            <Text style={styles.recoText}>{recommendations}</Text>
          </LinearGradient>
        )}
      </CollapsibleSection>

      {/* Account-Level Analysis */}
      {accountAnalysis && Object.keys(accountAnalysis).length > 0 && (
        <CollapsibleSection
          icon={<Building2 size={18} color={colors.primary[600]} strokeWidth={2} />}
          title="Account Analysis"
          defaultExpanded={false}
        >
          <View style={styles.accountsList}>
            {Object.entries(accountAnalysis).map(([account, observations]) => (
              <View key={account} style={styles.accountSection}>
                <Text style={styles.accountName}>{account}</Text>
                {observations.map((obs, j) => (
                  <View key={j} style={styles.insightRow}>
                    <View style={styles.bullet} />
                    <Text style={styles.insightText}>{obs}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </CollapsibleSection>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightsList: {
    gap: spacing.sm,
  },
  insightRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary[400],
    marginTop: 7,
  },
  insightText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.slate[700],
    lineHeight: 20,
  },
  recoBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  recoText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[800],
    lineHeight: 20,
  },
  accountsList: {
    gap: spacing.lg,
  },
  accountSection: {
    gap: spacing.sm,
  },
  accountName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
  },
});
