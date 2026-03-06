import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
  Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, router } from 'expo-router';
import {
  ClipboardCheck, ChevronDown, ChevronUp, AlertTriangle, Calendar,
  FileText, Clock, CheckCircle, Lightbulb, Shield, TrendingUp,
  TrendingDown, Minus, ArrowRight, X,
} from 'lucide-react-native';
import { useWeeklyAudit, useEngagementActions } from '../src/hooks/useEngagement';

import Card from '../src/components/ui/Card';
import Badge from '../src/components/ui/Badge';
import Button from '../src/components/ui/Button';
import GradientIcon from '../src/components/ui/GradientIcon';
import LoadingSpinner from '../src/components/ui/LoadingSpinner';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { spacing, borderRadius } from '../src/theme/spacing';

// Health card config
const HEALTH_CONFIG = {
  healthy: {
    bg: colors.primary[50],
    text: colors.primary[800],
    label: colors.primary[700],
    border: colors.primary[200],
    icon: <CheckCircle size={18} color={colors.primary[600]} strokeWidth={2} />,
  },
  watch: {
    bg: colors.warning[50],
    text: colors.warning[800],
    label: colors.warning[700],
    border: colors.warning[200],
    icon: <Clock size={18} color={colors.warning[600]} strokeWidth={2} />,
  },
  risk: {
    bg: '#FFF7ED',
    text: '#9A3412',
    label: '#C2410C',
    border: '#FED7AA',
    icon: <AlertTriangle size={18} color="#EA580C" strokeWidth={2} />,
  },
  critical: {
    bg: colors.error[50],
    text: colors.error[800],
    label: colors.error[700],
    border: colors.error[200],
    icon: <AlertTriangle size={18} color={colors.error[600]} strokeWidth={2} />,
  },
};

// Section config
const SECTION_CONFIG: Record<string, {
  icon: React.ReactNode;
  variant: 'warning' | 'info' | 'error' | 'default';
  emptyMessage: string;
}> = {
  nearing_expiration: {
    icon: <Calendar size={18} color={colors.warning[600]} strokeWidth={2} />,
    variant: 'warning',
    emptyMessage: 'No documents nearing expiration',
  },
  incomplete_metadata: {
    icon: <FileText size={18} color={colors.info[600]} strokeWidth={2} />,
    variant: 'info',
    emptyMessage: 'All documents have complete metadata',
  },
  missing_expirations: {
    icon: <AlertTriangle size={18} color={colors.error[600]} strokeWidth={2} />,
    variant: 'error',
    emptyMessage: 'All documents have expiration dates',
  },
  missing_cadence: {
    icon: <Clock size={18} color={colors.slate[500]} strokeWidth={2} />,
    variant: 'default',
    emptyMessage: 'All documents have review schedules',
  },
};

const CADENCE_PRESETS = [
  { days: 90, label: 'Every 3 months' },
  { days: 180, label: 'Every 6 months' },
  { days: 365, label: 'Every year' },
];

const getDefaultCadence = (category: string): number => {
  switch (category) {
    case 'lease': case 'contract': return 180;
    default: return 365;
  }
};

/** Reusable audit content — can be embedded in Vault or rendered standalone. */
export function AuditContent({ embedded }: { embedded?: boolean }) {
  const { data, loading, error, refresh } = useWeeklyAudit();
  const { dismissGap, setCadence, actionLoading } = useEngagementActions();
  const [expandedSection, setExpandedSection] = useState<string | null>('nearing_expiration');
  const [cadenceModal, setCadenceModal] = useState<{ docId: string; docName: string; category: string } | null>(null);
  const [selectedCadence, setSelectedCadence] = useState<number>(365);
  const [customDays, setCustomDays] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const toggleSection = (key: string) => {
    setExpandedSection(prev => prev === key ? null : key);
  };

  const openCadenceModal = (docId: string, docName: string, category: string) => {
    const defaultDays = getDefaultCadence(category);
    setSelectedCadence(defaultDays);
    setCustomDays('');
    setUseCustom(false);
    setCadenceModal({ docId, docName, category });
  };

  const handleConfirmCadence = async () => {
    if (!cadenceModal) return;
    const days = useCustom ? parseInt(customDays, 10) : selectedCadence;
    if (!days || days < 7 || days > 730) return;
    await setCadence(cadenceModal.docId, days);
    setCadenceModal(null);
    refresh();
  };

  const handleDismissGap = async (key: string) => {
    await dismissGap(key, 'unknown');
    refresh();
  };

  const handleNavigateToDocument = (docId: string) => {
    router.push({ pathname: '/document/[id]', params: { id: docId } });
  };

  if (loading) {
    if (embedded) return <LoadingSpinner fullScreen />;
    return (
      <>
        <Stack.Screen options={{ title: 'Weekly Audit', headerShown: true }} />
        <LoadingSpinner fullScreen />
      </>
    );
  }

  if (error) {
    if (embedded) return (
      <View style={styles.errorContainer}>
        <GradientIcon size={56} light>
          <AlertTriangle size={24} color={colors.error[600]} strokeWidth={2} />
        </GradientIcon>
        <Text style={styles.errorTitle}>Unable to load audit</Text>
        <Text style={styles.errorText}>Something went wrong loading your vault audit data.</Text>
        <Button title="Retry" onPress={refresh} variant="primary" size="md" />
      </View>
    );
    return (
      <>
        <Stack.Screen options={{ title: 'Weekly Audit', headerShown: true }} />
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <View style={styles.errorContainer}>
            <GradientIcon size={56} light>
              <AlertTriangle size={24} color={colors.error[600]} strokeWidth={2} />
            </GradientIcon>
            <Text style={styles.errorTitle}>Unable to load audit</Text>
            <Text style={styles.errorText}>Something went wrong loading your vault audit data.</Text>
            <Button title="Retry" onPress={refresh} variant="primary" size="md" />
          </View>
        </SafeAreaView>
      </>
    );
  }

  if (!data) return null;

  const sections = [
    {
      key: 'nearing_expiration',
      title: 'Nearing Expiration',
      count: data.nearingExpiration.length,
      items: data.nearingExpiration,
    },
    {
      key: 'incomplete_metadata',
      title: 'Incomplete Metadata',
      count: data.incompleteMetadata.length,
      items: data.incompleteMetadata,
    },
    {
      key: 'missing_expirations',
      title: 'Missing Expiration Dates',
      count: data.missingExpirations.length,
      items: data.missingExpirations,
    },
    {
      key: 'missing_cadence',
      title: 'No Review Schedule',
      count: data.missingReviewCadence.length,
      items: data.missingReviewCadence,
    },
  ];

  const allClear = sections.every(s => s.count === 0) && data.gapSuggestions.length === 0;
  const totalIssues = sections.reduce((sum, s) => sum + s.count, 0);

  // Trend icon
  const TrendIcon = data.preparedness.trend === 'up' ? TrendingUp
    : data.preparedness.trend === 'down' ? TrendingDown
    : Minus;
  const trendColor = data.preparedness.trend === 'up' ? colors.primary[600]
    : data.preparedness.trend === 'down' ? colors.error[600]
    : colors.slate[400];

  const auditBody = (
    <>
          {/* Health summary grid */}
          <View style={styles.summaryGrid}>
            {(['healthy', 'watch', 'risk', 'critical'] as const).map(key => {
              const config = HEALTH_CONFIG[key];
              const value = data.healthSummary[key];
              return (
                <View
                  key={key}
                  style={[styles.summaryCard, {
                    backgroundColor: config.bg,
                    borderColor: config.border,
                  }]}
                >
                  {config.icon}
                  <Text style={[styles.summaryNumber, { color: config.text }]}>{value}</Text>
                  <Text style={[styles.summaryLabel, { color: config.label }]}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Preparedness score card */}
          <Card>
            <View style={styles.preparednessRow}>
              <View style={styles.preparednessLeft}>
                <View style={styles.preparednessScoreCircle}>
                  <LinearGradient
                    colors={[...colors.gradient.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.preparednessGradient}
                  >
                    <Text style={styles.preparednessScore}>{data.preparedness.score}</Text>
                  </LinearGradient>
                </View>
                <View style={styles.preparednessInfo}>
                  <Text style={styles.preparednessTitle}>Preparedness Score</Text>
                  <View style={styles.preparednessMetaRow}>
                    <Shield size={14} color={colors.slate[400]} strokeWidth={2} />
                    <Text style={styles.preparednessSubtext}>
                      {totalIssues === 0 ? 'All clear' : `${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found`}
                    </Text>
                  </View>
                </View>
              </View>
              {data.preparedness.trend !== 'stable' && (
                <View style={[styles.trendBadge, {
                  backgroundColor: data.preparedness.trend === 'up' ? colors.primary[50] : colors.error[50],
                }]}>
                  <TrendIcon size={14} color={trendColor} strokeWidth={2.5} />
                  <Text style={[styles.trendText, { color: trendColor }]}>
                    {data.preparedness.trend === 'up' ? 'Up' : 'Down'}
                  </Text>
                </View>
              )}
            </View>
          </Card>

          {/* All clear celebration */}
          {allClear && (
            <Card style={styles.allClearCard}>
              <GradientIcon size={56}>
                <CheckCircle size={28} color={colors.white} strokeWidth={2} />
              </GradientIcon>
              <Text style={styles.allClearTitle}>Your vault is in great shape!</Text>
              <Text style={styles.allClearText}>
                No issues found this week. All your documents have complete metadata, valid expiration dates, and healthy review schedules.
              </Text>
              <View style={styles.allClearBadge}>
                <Shield size={14} color={colors.primary[700]} strokeWidth={2} />
                <Text style={styles.allClearBadgeText}>Vault Protected</Text>
              </View>
            </Card>
          )}

          {/* Audit accordion sections */}
          {sections.map((section) => {
            const isExpanded = expandedSection === section.key;
            const sectionCfg = SECTION_CONFIG[section.key];

            return (
              <Card key={section.key} style={styles.sectionCard}>
                <TouchableOpacity
                  onPress={() => toggleSection(section.key)}
                  style={styles.sectionHeader}
                  activeOpacity={0.7}
                >
                  <View style={styles.sectionHeaderLeft}>
                    {sectionCfg.icon}
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    {section.count > 0 && (
                      <Badge label={String(section.count)} variant={sectionCfg.variant} />
                    )}
                    {section.count === 0 && (
                      <Badge label="Clear" variant="success" />
                    )}
                  </View>
                  {isExpanded ? (
                    <ChevronUp size={18} color={colors.slate[400]} strokeWidth={2} />
                  ) : (
                    <ChevronDown size={18} color={colors.slate[400]} strokeWidth={2} />
                  )}
                </TouchableOpacity>

                {isExpanded && section.items.length > 0 && (
                  <View style={styles.sectionItems}>
                    {section.items.map((doc: any) => {
                      const catColor = colors.category[doc.category as keyof typeof colors.category] || colors.category.other;
                      return (
                        <TouchableOpacity
                          key={doc.id}
                          style={styles.docItem}
                          onPress={() => handleNavigateToDocument(doc.id)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.docIconBox, { backgroundColor: catColor.bg }]}>
                            <FileText size={14} color={catColor.text} strokeWidth={2} />
                          </View>
                          <View style={styles.docInfo}>
                            <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
                            <View style={styles.docMetaRow}>
                              <Text style={[styles.docCategory, { color: catColor.text }]}>
                                {doc.category}
                              </Text>
                              {doc.expiration_date && (
                                <>
                                  <Text style={styles.docMetaDot}>-</Text>
                                  <Calendar size={11} color={colors.slate[400]} strokeWidth={2} />
                                  <Text style={styles.docMeta}>
                                    {new Date(doc.expiration_date).toLocaleDateString()}
                                  </Text>
                                </>
                              )}
                            </View>
                          </View>
                          {section.key === 'missing_cadence' ? (
                            <TouchableOpacity
                              style={styles.actionChip}
                              onPress={(e) => {
                                e.stopPropagation?.();
                                openCadenceModal(doc.id, doc.name, doc.category);
                              }}
                              disabled={actionLoading !== null}
                              activeOpacity={0.7}
                            >
                              <Clock size={12} color={colors.primary[700]} strokeWidth={2} />
                              <Text style={styles.actionChipText}>Schedule</Text>
                            </TouchableOpacity>
                          ) : (
                            <ArrowRight size={14} color={colors.slate[300]} strokeWidth={2} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {isExpanded && section.items.length === 0 && (
                  <View style={styles.sectionEmpty}>
                    <CheckCircle size={20} color={colors.primary[400]} strokeWidth={2} />
                    <Text style={styles.sectionEmptyText}>{sectionCfg.emptyMessage}</Text>
                  </View>
                )}
              </Card>
            );
          })}

          {/* Gap suggestions card */}
          {data.gapSuggestions.length > 0 && (
            <Card>
              <View style={styles.gapHeader}>
                <View style={styles.gapIconBox}>
                  <Lightbulb size={18} color={colors.warning[600]} strokeWidth={2} />
                </View>
                <View style={styles.gapHeaderInfo}>
                  <Text style={styles.gapTitle}>Suggested Missing Documents</Text>
                  <Text style={styles.gapSubtitle}>
                    Based on your current vault, we recommend adding these
                  </Text>
                </View>
              </View>

              <View style={styles.gapDivider} />

              {data.gapSuggestions.map((gap, index) => (
                <View key={gap.key} style={[
                  styles.gapItem,
                  index < data.gapSuggestions.length - 1 && styles.gapItemBorder,
                ]}>
                  <View style={styles.gapBullet} />
                  <View style={styles.gapContent}>
                    <Text style={styles.gapLabel}>{gap.label}</Text>
                    <Text style={styles.gapDesc}>{gap.description}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDismissGap(gap.key)}
                    disabled={actionLoading !== null}
                    style={styles.dismissBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <X size={16} color={colors.slate[400]} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              ))}
            </Card>
          )}

          {/* Cadence Picker Modal */}
          <Modal
            visible={cadenceModal !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setCadenceModal(null)}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setCadenceModal(null)}
            >
              <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
                {/* Header */}
                <View style={styles.modalHeader}>
                  <View style={styles.modalIconBox}>
                    <Clock size={20} color={colors.slate[600]} strokeWidth={2} />
                  </View>
                  <View style={styles.modalHeaderInfo}>
                    <Text style={styles.modalTitle}>Set Review Schedule</Text>
                    {cadenceModal && (
                      <Text style={styles.modalDocName} numberOfLines={1}>
                        {cadenceModal.docName} &bull; {cadenceModal.category}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => setCadenceModal(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <X size={20} color={colors.slate[400]} strokeWidth={2} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalSectionLabel}>How often should we remind you?</Text>

                {/* Presets */}
                {CADENCE_PRESETS.map((preset) => {
                  const isDefault = cadenceModal ? preset.days === getDefaultCadence(cadenceModal.category) : false;
                  const isSelected = !useCustom && selectedCadence === preset.days;
                  return (
                    <TouchableOpacity
                      key={preset.days}
                      style={[styles.presetOption, isSelected && styles.presetOptionActive]}
                      onPress={() => { setSelectedCadence(preset.days); setUseCustom(false); }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.presetOptionLeft}>
                        <Text style={[styles.presetLabel, isSelected && styles.presetLabelActive]}>
                          {preset.label}
                        </Text>
                        <Text style={[styles.presetDays, isSelected && styles.presetDaysActive]}>
                          {preset.days} days
                        </Text>
                      </View>
                      <View style={styles.presetOptionRight}>
                        {isDefault && (
                          <View style={styles.recommendedBadge}>
                            <Text style={styles.recommendedText}>Recommended</Text>
                          </View>
                        )}
                        <View style={[styles.radioOuter, isSelected && styles.radioOuterActive]}>
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* Custom option */}
                <TouchableOpacity
                  style={[styles.presetOption, useCustom && styles.presetOptionActive]}
                  onPress={() => setUseCustom(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.presetOptionLeft}>
                    <Text style={[styles.presetLabel, useCustom && styles.presetLabelActive]}>Custom</Text>
                    {useCustom && (
                      <View style={styles.customInputRow}>
                        <TextInput
                          style={styles.customInput}
                          value={customDays}
                          onChangeText={setCustomDays}
                          placeholder="e.g. 120"
                          placeholderTextColor={colors.slate[400]}
                          keyboardType="number-pad"
                          autoFocus
                          maxLength={3}
                        />
                        <Text style={styles.customDaysLabel}>days</Text>
                      </View>
                    )}
                  </View>
                  <View style={[styles.radioOuter, useCustom && styles.radioOuterActive]}>
                    {useCustom && <View style={styles.radioInner} />}
                  </View>
                </TouchableOpacity>

                <Text style={styles.modalHint}>
                  We'll notify you at 80%, 90%, and 100% of the review period.
                </Text>

                {/* Actions */}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setCadenceModal(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalConfirmBtn,
                      (actionLoading !== null || (useCustom && (!customDays || parseInt(customDays, 10) < 7 || parseInt(customDays, 10) > 730)))
                        && styles.modalConfirmBtnDisabled,
                    ]}
                    onPress={handleConfirmCadence}
                    disabled={actionLoading !== null || (useCustom && (!customDays || parseInt(customDays, 10) < 7 || parseInt(customDays, 10) > 730))}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.modalConfirmText}>
                      {actionLoading === 'cadence' ? 'Setting...' : 'Set Schedule'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
    </>
  );

  if (embedded) return auditBody;

  return (
    <>
      <Stack.Screen options={{ title: 'Weekly Audit', headerShown: true }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary[600]} />}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <GradientIcon size={44}>
                <ClipboardCheck size={22} color={colors.white} strokeWidth={2} />
              </GradientIcon>
              <View style={styles.headerTextCol}>
                <Text style={styles.pageTitle}>Weekly Vault Audit</Text>
                <Text style={styles.pageSubtitle}>Review your document vault health</Text>
              </View>
            </View>
          </View>

          {auditBody}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

/** Redirect: /audit now lives inside the Vault Health tab */
export default function AuditScreen() {
  useEffect(() => {
    router.replace({ pathname: '/(tabs)/vault', params: { tab: 'health' } });
  }, []);
  return <LoadingSpinner fullScreen />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate[50] },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },

  // Header
  header: { marginBottom: spacing.xs },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerTextCol: { flex: 1 },
  pageTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  pageSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    marginTop: 2,
  },

  // Error
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  errorTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[800],
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
    lineHeight: 22,
  },

  // Summary grid
  summaryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    gap: spacing.xs,
  },
  summaryNumber: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Preparedness
  preparednessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  preparednessLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  preparednessScoreCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
  },
  preparednessGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preparednessScore: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  preparednessInfo: {
    flex: 1,
  },
  preparednessTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  preparednessMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  preparednessSubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  trendText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },

  // All clear
  allClearCard: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  allClearTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    textAlign: 'center',
  },
  allClearText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  allClearBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginTop: spacing.xs,
  },
  allClearBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[700],
  },

  // Section accordion cards
  sectionCard: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  sectionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    flex: 1,
  },

  // Section items
  sectionItems: {
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[50],
  },
  docIconBox: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo: { flex: 1 },
  docName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  docMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 3,
  },
  docCategory: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    textTransform: 'capitalize',
  },
  docMetaDot: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[300],
  },
  docMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  actionChipText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[700],
  },

  // Section empty
  sectionEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
  },
  sectionEmptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    fontWeight: typography.fontWeight.medium,
  },

  // Gap suggestions
  gapHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  gapIconBox: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.warning[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapHeaderInfo: { flex: 1 },
  gapTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  gapSubtitle: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    marginTop: 2,
    lineHeight: 18,
  },
  gapDivider: {
    height: 1,
    backgroundColor: colors.slate[100],
    marginVertical: spacing.md,
  },
  gapItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  gapItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[50],
  },
  gapBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.warning[500],
    marginTop: 6,
  },
  gapContent: { flex: 1 },
  gapLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  gapDesc: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    marginTop: 2,
    lineHeight: 18,
  },
  dismissBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Cadence picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  modalIconBox: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderInfo: {
    flex: 1,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.slate[900],
  },
  modalDocName: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    marginTop: 2,
  },
  modalSectionLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.slate[500],
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },
  presetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    borderColor: colors.slate[200],
    marginBottom: spacing.sm,
  },
  presetOptionActive: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[50],
  },
  presetOptionLeft: {
    flex: 1,
  },
  presetOptionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  presetLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.slate[700],
  },
  presetLabelActive: {
    color: colors.primary[700],
  },
  presetDays: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    marginTop: 2,
  },
  presetDaysActive: {
    color: colors.primary[500],
  },
  recommendedBadge: {
    backgroundColor: colors.slate[100],
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.slate[600],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.slate[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: colors.primary[500],
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary[500],
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  customInput: {
    width: 80,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary[300],
    borderRadius: borderRadius.lg,
    fontSize: typography.fontSize.sm,
    color: colors.slate[900],
    backgroundColor: colors.white,
  },
  customDaysLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.primary[600],
    fontWeight: typography.fontWeight.medium as any,
  },
  modalHint: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.slate[600],
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
  },
  modalConfirmBtnDisabled: {
    opacity: 0.5,
  },
  modalConfirmText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.white,
  },
});
