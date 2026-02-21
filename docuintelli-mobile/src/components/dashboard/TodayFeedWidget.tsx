import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import {
  Activity,
  AlertTriangle,
  Clock,
  Lightbulb,
  CheckCircle,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  ChevronRight,
} from 'lucide-react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { useTodayFeed, useEngagementActions } from '../../hooks/useEngagement';
import type { TodayFeedItem } from '../../lib/engagementApi';

function getScoreColor(score: number): string {
  if (score >= 70) return colors.primary[600];
  if (score >= 40) return colors.warning[600];
  return colors.error[600];
}

function getSeverityConfig(severity: TodayFeedItem['severity']) {
  switch (severity) {
    case 'critical':
      return {
        Icon: AlertTriangle,
        bg: colors.error[50],
        color: colors.error[600],
      };
    case 'warning':
      return {
        Icon: Clock,
        bg: colors.warning[50],
        color: colors.warning[600],
      };
    case 'info':
    default:
      return {
        Icon: Lightbulb,
        bg: colors.primary[50],
        color: colors.primary[600],
      };
  }
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  switch (trend) {
    case 'up':
      return <TrendingUp size={14} color={colors.success[600]} />;
    case 'down':
      return <TrendingDown size={14} color={colors.error[600]} />;
    case 'stable':
    default:
      return <Minus size={14} color={colors.slate[500]} />;
  }
}

function SkeletonRow() {
  return (
    <View style={styles.skeletonRow}>
      <View style={styles.skeletonCircle} />
      <View style={styles.skeletonContent}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonDesc} />
      </View>
    </View>
  );
}

export default function TodayFeedWidget() {
  const { data, loading, error, refresh } = useTodayFeed();
  const { dismissGap } = useEngagementActions();

  const feed = data?.feed ?? [];
  const preparedness = data?.preparedness;
  const displayedItems = feed.slice(0, 5);

  const handleDismissGap = async (gapKey: string) => {
    try {
      await dismissGap(gapKey, '', false);
      refresh();
    } catch {
      // Silently handle dismiss errors
    }
  };

  const handleNavigateToDocument = (documentId: string) => {
    router.push({ pathname: '/document/[id]', params: { id: documentId } });
  };

  return (
    <View style={styles.container}>
      {/* Section Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Today's Actions</Text>
          <Badge label={String(feed.length)} variant="default" />
        </View>

        {preparedness && (
          <View style={styles.preparednessPill}>
            <Shield size={14} color={getScoreColor(preparedness.score)} />
            <Text
              style={[
                styles.preparednessScore,
                { color: getScoreColor(preparedness.score) },
              ]}
            >
              {preparedness.score}
            </Text>
            <TrendIcon trend={preparedness.trend} />
          </View>
        )}
      </View>

      {/* Feed Items */}
      {loading && (
        <View style={styles.feedList}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      )}

      {!loading && !error && feed.length === 0 && (
        <View style={styles.emptyState}>
          <CheckCircle size={24} color={colors.success[600]} />
          <Text style={styles.emptyText}>All clear for today</Text>
        </View>
      )}

      {!loading && !error && feed.length > 0 && (
        <View style={styles.feedList}>
          {displayedItems.map((item, index) => {
            const severity = getSeverityConfig(item.severity);
            const SeverityIcon = severity.Icon;

            return (
              <Card key={`${item.type}-${item.gapKey ?? item.documentId ?? index}`} style={styles.feedCard} padded>
                <View style={styles.feedItemRow}>
                  {/* Severity icon circle */}
                  <View style={[styles.severityCircle, { backgroundColor: severity.bg }]}>
                    <SeverityIcon size={14} color={severity.color} />
                  </View>

                  {/* Content */}
                  <View style={styles.feedItemContent}>
                    <Text style={styles.feedItemTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.feedItemDescription} numberOfLines={2}>
                      {item.description}
                    </Text>
                    {item.documentName && (
                      <TouchableOpacity
                        onPress={() => item.documentId && handleNavigateToDocument(item.documentId)}
                      >
                        <Text style={styles.feedItemDocLink} numberOfLines={1}>
                          {item.documentName}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Action area */}
                  <View style={styles.feedItemAction}>
                    {item.type === 'gap' && item.gapKey && (
                      <TouchableOpacity
                        onPress={() => handleDismissGap(item.gapKey!)}
                        hitSlop={8}
                        style={styles.dismissButton}
                      >
                        <X size={16} color={colors.slate[400]} />
                      </TouchableOpacity>
                    )}
                    {item.type === 'action' && (
                      <TouchableOpacity
                        onPress={() => item.documentId && handleNavigateToDocument(item.documentId)}
                      >
                        <Text style={styles.actionButtonText}>Update</Text>
                      </TouchableOpacity>
                    )}
                    {(item.type === 'risk' || item.type === 'health_change') && item.documentId && (
                      <TouchableOpacity
                        onPress={() => handleNavigateToDocument(item.documentId!)}
                      >
                        <Text style={styles.actionButtonText}>View</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {/* View More link */}
      {!loading && feed.length > 5 && (
        <TouchableOpacity
          style={styles.viewMoreRow}
          onPress={() => router.push('/audit')}
        >
          <Text style={styles.viewMoreText}>View Full Audit</Text>
          <ChevronRight size={16} color={colors.primary[600]} />
        </TouchableOpacity>
      )}

      {/* Error state */}
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },

  /* Header */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },

  /* Preparedness pill */
  preparednessPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  preparednessScore: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },

  /* Feed list */
  feedList: {
    gap: spacing.sm,
  },

  /* Feed card */
  feedCard: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  feedItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },

  /* Severity circle */
  severityCircle: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Feed item content */
  feedItemContent: {
    flex: 1,
    gap: 2,
  },
  feedItemTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[900],
  },
  feedItemDescription: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    lineHeight: typography.fontSize.xs * typography.lineHeight.normal,
  },
  feedItemDocLink: {
    fontSize: typography.fontSize.xs,
    color: colors.primary[600],
    marginTop: 2,
  },

  /* Action area */
  feedItemAction: {
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 40,
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.slate[50],
  },
  actionButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[600],
  },

  /* Empty state */
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['2xl'],
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
  },

  /* Skeleton */
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  skeletonCircle: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate[100],
  },
  skeletonContent: {
    flex: 1,
    gap: spacing.sm,
  },
  skeletonTitle: {
    width: '60%',
    height: 12,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.slate[100],
  },
  skeletonDesc: {
    width: '80%',
    height: 10,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.slate[100],
  },

  /* View more */
  viewMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  viewMoreText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[600],
  },

  /* Error */
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.error[600],
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
});
