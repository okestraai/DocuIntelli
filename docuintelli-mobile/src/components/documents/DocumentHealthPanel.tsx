import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation } from 'react-native';
import { router } from 'expo-router';
import {
  Heart,
  CheckCircle,
  Clock,
  AlertTriangle,
  Lightbulb,
  Upload,
  FileEdit,
  Calendar,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useDocumentHealth, useEngagementActions } from '../../hooks/useEngagement';
import type { HealthState } from '../../lib/engagementApi';

interface DocumentHealthPanelProps {
  documentId: string;
  category: string;
  onRefreshDocument?: () => void;
}

const stateColors: Record<HealthState, { bg: string; border: string; icon: string }> = {
  healthy: { bg: colors.primary[50], border: colors.primary[500], icon: colors.primary[600] },
  watch: { bg: colors.warning[50], border: colors.warning[500], icon: colors.warning[600] },
  risk: { bg: colors.error[50], border: colors.error[500], icon: colors.error[600] },
  critical: { bg: colors.error[100], border: colors.error[700], icon: colors.error[700] },
};

function getStateIcon(state: HealthState) {
  switch (state) {
    case 'healthy':
      return CheckCircle;
    case 'watch':
      return Clock;
    case 'risk':
    case 'critical':
      return AlertTriangle;
  }
}

function getStateBadgeVariant(state: HealthState): 'success' | 'warning' | 'error' {
  switch (state) {
    case 'healthy':
      return 'success';
    case 'watch':
      return 'warning';
    case 'risk':
    case 'critical':
      return 'error';
  }
}

function getStateLabel(state: HealthState): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

const CADENCE_OPTIONS = [
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
  { label: '2 years', days: 730 },
];

export default function DocumentHealthPanel({
  documentId,
  category,
  onRefreshDocument,
}: DocumentHealthPanelProps) {
  const { data, loading, error, refresh } = useDocumentHealth(documentId);
  const { actionLoading, updateMetadata, setCadence } = useEngagementActions();

  const [showMetadataForm, setShowMetadataForm] = useState(false);
  const [showCadenceSelector, setShowCadenceSelector] = useState(false);
  const [selectedCadence, setSelectedCadence] = useState<number | null>(null);

  // Metadata form state
  const [issuer, setIssuer] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [expirationDate, setExpirationDate] = useState('');

  // Populate form when data loads
  React.useEffect(() => {
    if (data?.metadata) {
      setIssuer(data.metadata.issuer || '');
      setOwnerName(data.metadata.ownerName || '');
      setExpirationDate(data.metadata.expirationDate || '');
    }
  }, [data?.metadata]);

  const toggleMetadataForm = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowMetadataForm(!showMetadataForm);
    if (showCadenceSelector) setShowCadenceSelector(false);
  };

  const toggleCadenceSelector = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowCadenceSelector(!showCadenceSelector);
    if (showMetadataForm) setShowMetadataForm(false);
  };

  const handleSaveMetadata = async () => {
    try {
      await updateMetadata(documentId, {
        issuer: issuer || undefined,
        ownerName: ownerName || undefined,
        expirationDate: expirationDate || undefined,
      });
      setShowMetadataForm(false);
      refresh();
      onRefreshDocument?.();
    } catch {
      // Error handling managed by hook
    }
  };

  const handleSetCadence = async () => {
    if (!selectedCadence) return;
    try {
      await setCadence(documentId, selectedCadence);
      setShowCadenceSelector(false);
      refresh();
      onRefreshDocument?.();
    } catch {
      // Error handling managed by hook
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingSpinner size="small" />
      </View>
    );
  }

  if (error) {
    return (
      <Card style={styles.errorCard}>
        <View style={styles.errorHeader}>
          <Heart size={18} color={colors.slate[400]} />
          <Text style={styles.errorTitle}>Document Health</Text>
        </View>
        <Text style={styles.errorText}>Unable to load health data</Text>
        <Button title="Retry" variant="outline" size="sm" onPress={refresh} />
      </Card>
    );
  }

  if (!data) return null;

  const { health, insights, nextReviewDate, suggestedCadenceDays, relationships, reverseRelationships, metadata } = data;
  const stateColor = stateColors[health.state];
  const StateIcon = getStateIcon(health.state);

  const isExpiring = health.reasons.some(
    (r) => r.toLowerCase().includes('expir') || r.toLowerCase().includes('expired')
  );
  const isMetadataIncomplete = !metadata?.issuer || !metadata?.ownerName;
  const hasNoReviewDate = !nextReviewDate;

  return (
    <View style={styles.container}>
      {/* 1. Health State Card */}
      <Card style={[styles.healthCard, { borderLeftColor: stateColor.border }]}>
        <View style={styles.healthHeader}>
          <View style={styles.healthHeaderLeft}>
            <StateIcon size={20} color={stateColor.icon} />
            <Text style={[styles.stateLabel, { color: stateColor.icon }]}>
              {getStateLabel(health.state)}
            </Text>
          </View>
          <Badge
            label={`${health.score}/100`}
            variant={getStateBadgeVariant(health.state)}
          />
        </View>

        {health.reasons.length > 0 && (
          <View style={styles.reasonsList}>
            {health.reasons.map((reason, index) => (
              <View key={index} style={styles.reasonRow}>
                <Text style={styles.reasonBullet}>{'\u2022'}</Text>
                <Text style={styles.reasonText}>{reason}</Text>
              </View>
            ))}
          </View>
        )}

        {nextReviewDate && (
          <View style={styles.reviewDateRow}>
            <Calendar size={12} color={colors.slate[500]} />
            <Text style={styles.reviewDateText}>
              Next review: {new Date(nextReviewDate).toLocaleDateString()}
            </Text>
          </View>
        )}
      </Card>

      {/* 2. Insights Section */}
      {insights.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Lightbulb size={16} color={colors.primary[600]} />
            <Text style={styles.sectionTitle}>Insights</Text>
          </View>
          {insights.map((insight: any, index: number) => {
            const insightSeverity = insight.severity || 'info';
            const insightBorder =
              insightSeverity === 'critical'
                ? colors.error[500]
                : insightSeverity === 'warning'
                  ? colors.warning[500]
                  : colors.primary[500];
            const InsightIcon =
              insightSeverity === 'critical'
                ? AlertTriangle
                : insightSeverity === 'warning'
                  ? Clock
                  : Lightbulb;
            const insightIconColor =
              insightSeverity === 'critical'
                ? colors.error[600]
                : insightSeverity === 'warning'
                  ? colors.warning[600]
                  : colors.primary[600];

            return (
              <Card
                key={index}
                style={[styles.insightCard, { borderLeftColor: insightBorder }]}
              >
                <View style={styles.insightRow}>
                  <InsightIcon size={16} color={insightIconColor} />
                  <View style={styles.insightContent}>
                    <Text style={styles.insightTitle}>{insight.title}</Text>
                    {insight.description && (
                      <Text style={styles.insightDescription}>
                        {insight.description}
                      </Text>
                    )}
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {/* 3. Quick Actions Row */}
      {(isExpiring || isMetadataIncomplete || hasNoReviewDate) && (
        <View style={styles.quickActionsRow}>
          {isExpiring && (
            <Button
              title="Upload Renewal"
              variant="outline"
              size="sm"
              icon={<Upload size={14} color={colors.slate[700]} />}
              onPress={() => router.push('/upload')}
            />
          )}
          {isMetadataIncomplete && (
            <Button
              title="Add Details"
              variant="outline"
              size="sm"
              icon={<FileEdit size={14} color={colors.slate[700]} />}
              onPress={toggleMetadataForm}
            />
          )}
          {hasNoReviewDate && (
            <Button
              title="Set Schedule"
              variant="outline"
              size="sm"
              icon={<Calendar size={14} color={colors.slate[700]} />}
              onPress={toggleCadenceSelector}
            />
          )}
        </View>
      )}

      {/* 4. Metadata Form (collapsible) */}
      {showMetadataForm && (
        <Card style={styles.formCard}>
          <Input
            label="Issuer / Provider"
            value={issuer}
            onChangeText={setIssuer}
            placeholder="e.g. State Farm, Comcast"
            containerStyle={styles.formField}
          />
          <Input
            label="Owner / Policyholder"
            value={ownerName}
            onChangeText={setOwnerName}
            placeholder="e.g. John Doe"
            containerStyle={styles.formField}
          />
          <Input
            label="Expiration Date"
            value={expirationDate}
            onChangeText={setExpirationDate}
            placeholder="YYYY-MM-DD"
            containerStyle={styles.formField}
          />
          <View style={styles.formButtons}>
            <Button
              title="Save"
              variant="primary"
              size="sm"
              onPress={handleSaveMetadata}
              loading={actionLoading === 'metadata'}
            />
            <Button
              title="Cancel"
              variant="ghost"
              size="sm"
              onPress={toggleMetadataForm}
            />
          </View>
        </Card>
      )}

      {/* 5. Review Cadence Selector (collapsible) */}
      {showCadenceSelector && (
        <Card style={styles.formCard}>
          <View style={styles.cadencePills}>
            {CADENCE_OPTIONS.map((option) => {
              const isSelected = selectedCadence === option.days;
              return (
                <TouchableOpacity
                  key={option.days}
                  onPress={() => setSelectedCadence(option.days)}
                  style={[
                    styles.cadencePill,
                    isSelected ? styles.cadencePillSelected : styles.cadencePillUnselected,
                  ]}
                >
                  <Text
                    style={[
                      styles.cadencePillText,
                      isSelected
                        ? styles.cadencePillTextSelected
                        : styles.cadencePillTextUnselected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.suggestedCadenceNote}>
            Suggested for {category}: {suggestedCadenceDays} days
          </Text>
          <View style={styles.formButtons}>
            <Button
              title="Set Schedule"
              variant="primary"
              size="sm"
              onPress={handleSetCadence}
              loading={actionLoading === 'cadence'}
              disabled={!selectedCadence}
            />
            <Button
              title="Cancel"
              variant="ghost"
              size="sm"
              onPress={toggleCadenceSelector}
            />
          </View>
        </Card>
      )}

      {/* 6. Related Documents */}
      {(relationships.length > 0 || reverseRelationships.length > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Related Documents</Text>
          {relationships.map((rel: any, index: number) => (
            <TouchableOpacity
              key={`rel-${index}`}
              style={styles.relatedDocRow}
              onPress={() => router.push({ pathname: '/document/[id]', params: { id: rel.relatedDocumentId } })}
            >
              <Text style={styles.relatedDocName} numberOfLines={1}>
                {rel.relatedDocumentName || 'Related Document'}
              </Text>
              <Text style={styles.relatedDocType}>{rel.relationshipType}</Text>
              <ChevronDown
                size={14}
                color={colors.slate[400]}
                style={{ transform: [{ rotate: '-90deg' }] }}
              />
            </TouchableOpacity>
          ))}
          {reverseRelationships.map((rel: any, index: number) => (
            <TouchableOpacity
              key={`rrel-${index}`}
              style={styles.relatedDocRow}
              onPress={() => router.push({ pathname: '/document/[id]', params: { id: rel.documentId } })}
            >
              <Text style={styles.relatedDocName} numberOfLines={1}>
                {rel.documentName || 'Related Document'}
              </Text>
              <Text style={styles.relatedDocType}>{rel.relationshipType}</Text>
              <ChevronDown
                size={14}
                color={colors.slate[400]}
                style={{ transform: [{ rotate: '-90deg' }] }}
              />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },

  /* Loading / Error */
  loadingContainer: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  errorCard: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[700],
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
  },

  /* Health State Card */
  healthCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary[500],
  },
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  healthHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stateLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },

  /* Reasons */
  reasonsList: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  reasonBullet: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
  },
  reasonText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
  },

  /* Review date */
  reviewDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  reviewDateText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
  },

  /* Section */
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
  },

  /* Insights */
  insightCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary[500],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  insightContent: {
    flex: 1,
    gap: 2,
  },
  insightTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  insightDescription: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    lineHeight: typography.fontSize.xs * typography.lineHeight.normal,
  },

  /* Quick Actions */
  quickActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },

  /* Form Card */
  formCard: {
    gap: spacing.md,
  },
  formField: {
    marginBottom: 0,
  },
  formButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },

  /* Cadence Selector */
  cadencePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cadencePill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
  },
  cadencePillSelected: {
    backgroundColor: colors.primary[600],
  },
  cadencePillUnselected: {
    backgroundColor: colors.slate[100],
  },
  cadencePillText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  cadencePillTextSelected: {
    color: colors.white,
  },
  cadencePillTextUnselected: {
    color: colors.slate[700],
  },
  suggestedCadenceNote: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },

  /* Related Documents */
  relatedDocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
  },
  relatedDocName: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[600],
  },
  relatedDocType: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
  },
});
