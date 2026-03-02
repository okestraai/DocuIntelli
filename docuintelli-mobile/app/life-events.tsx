import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, TextInput,
  StyleSheet, RefreshControl, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, router, useFocusEffect } from 'expo-router';
import {
  Compass, Plus, ChevronRight, ChevronLeft, CheckCircle, AlertTriangle,
  Clock, Archive, ArrowLeft, Home, Heart, Briefcase, Baby, GraduationCap,
  Plane, FileText, RefreshCw,
} from 'lucide-react-native';
import {
  getTemplates, getEvents, createEvent, getEventDetail,
  archiveEvent, unarchiveEvent,
  TemplateOverview, LifeEvent, EventDetail, ReadinessData,
  RequirementStatusItem,
} from '../src/lib/lifeEventsApi';
import { useAuth } from '../src/hooks/useAuth';
import { useSubscription } from '../src/hooks/useSubscription';
import ProFeatureGate from '../src/components/ProFeatureGate';
import { useDocuments } from '../src/hooks/useDocuments';
import Button from '../src/components/ui/Button';
import Card from '../src/components/ui/Card';
import Badge from '../src/components/ui/Badge';
import GradientIcon from '../src/components/ui/GradientIcon';
import LoadingSpinner from '../src/components/ui/LoadingSpinner';
import { useToast } from '../src/contexts/ToastContext';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { spacing, borderRadius } from '../src/theme/spacing';

type SubView = 'list' | 'intake' | 'detail';

// Status badge variant mapping
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  satisfied: 'success',
  expiring_soon: 'warning',
  needs_update: 'error',
  incomplete_metadata: 'warning',
  missing: 'error',
  not_applicable: 'default',
  pending: 'warning',
};

const STATUS_LABEL: Record<string, string> = {
  satisfied: 'Complete',
  expiring_soon: 'Expiring',
  needs_update: 'Needs Update',
  incomplete_metadata: 'Incomplete',
  missing: 'Missing',
  not_applicable: 'N/A',
  pending: 'Pending',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  satisfied: <CheckCircle size={14} color={colors.success[600]} strokeWidth={2} />,
  expiring_soon: <Clock size={14} color={colors.warning[600]} strokeWidth={2} />,
  needs_update: <AlertTriangle size={14} color={colors.error[600]} strokeWidth={2} />,
  incomplete_metadata: <AlertTriangle size={14} color={colors.warning[600]} strokeWidth={2} />,
  missing: <AlertTriangle size={14} color={colors.error[600]} strokeWidth={2} />,
  pending: <Clock size={14} color={colors.warning[600]} strokeWidth={2} />,
};

// Template icon mapping
const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  compass: <Compass size={22} color={colors.white} strokeWidth={2} />,
  home: <Home size={22} color={colors.white} strokeWidth={2} />,
  heart: <Heart size={22} color={colors.white} strokeWidth={2} />,
  briefcase: <Briefcase size={22} color={colors.white} strokeWidth={2} />,
  baby: <Baby size={22} color={colors.white} strokeWidth={2} />,
  'graduation-cap': <GraduationCap size={22} color={colors.white} strokeWidth={2} />,
  plane: <Plane size={22} color={colors.white} strokeWidth={2} />,
};

// Light version icons for event cards
const TEMPLATE_ICONS_COLORED: Record<string, React.ReactNode> = {
  compass: <Compass size={20} color={colors.primary[600]} strokeWidth={2} />,
  home: <Home size={20} color={colors.primary[600]} strokeWidth={2} />,
  heart: <Heart size={20} color={colors.primary[600]} strokeWidth={2} />,
  briefcase: <Briefcase size={20} color={colors.primary[600]} strokeWidth={2} />,
  baby: <Baby size={20} color={colors.primary[600]} strokeWidth={2} />,
  'graduation-cap': <GraduationCap size={20} color={colors.primary[600]} strokeWidth={2} />,
  plane: <Plane size={20} color={colors.primary[600]} strokeWidth={2} />,
};

function getTemplateIcon(icon: string, light = false) {
  const map = light ? TEMPLATE_ICONS_COLORED : TEMPLATE_ICONS;
  return map[icon] || (light
    ? <Compass size={20} color={colors.primary[600]} strokeWidth={2} />
    : <Compass size={22} color={colors.white} strokeWidth={2} />);
}

// Readiness ring component using bordered Views
function ReadinessRing({ score, size = 56 }: { score: number; size?: number }) {
  const progress = Math.min(100, Math.max(0, score));
  const ringColor = progress >= 80 ? colors.primary[600]
    : progress >= 50 ? colors.warning[600]
    : colors.error[600];
  const trackColor = progress >= 80 ? colors.primary[100]
    : progress >= 50 ? colors.warning[100]
    : colors.error[100];

  return (
    <View style={[styles.ringOuter, { width: size, height: size, borderRadius: size / 2 }]}>
      {/* Track circle */}
      <View style={[styles.ringTrack, {
        width: size, height: size, borderRadius: size / 2,
        borderColor: trackColor,
      }]} />
      {/* Progress fill (visual approximation using border-based approach) */}
      <View style={[styles.ringProgress, {
        width: size, height: size, borderRadius: size / 2,
        borderColor: ringColor,
        borderTopColor: progress > 25 ? ringColor : 'transparent',
        borderRightColor: progress > 50 ? ringColor : 'transparent',
        borderBottomColor: progress > 75 ? ringColor : 'transparent',
        borderLeftColor: progress > 0 ? ringColor : 'transparent',
        transform: [{ rotate: '-90deg' }],
      }]} />
      {/* Center content */}
      <View style={[styles.ringCenter, {
        width: size - 10,
        height: size - 10,
        borderRadius: (size - 10) / 2,
      }]}>
        <Text style={[styles.ringText, { fontSize: size * 0.24, color: ringColor }]}>
          {Math.round(progress)}%
        </Text>
      </View>
    </View>
  );
}

export default function LifeEventsScreen() {
  const { isAuthenticated } = useAuth();
  const { documents } = useDocuments(isAuthenticated);
  const { showToast } = useToast();
  const { isPro, loading: subLoading, refreshSubscription } = useSubscription();

  // Re-fetch subscription when screen comes into focus (e.g. after upgrading on billing screen)
  useFocusEffect(
    useCallback(() => {
      refreshSubscription();
    }, [refreshSubscription])
  );

  const [subView, setSubView] = useState<SubView>('list');
  const [templates, setTemplates] = useState<TemplateOverview[]>([]);
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [archivedEvents, setArchivedEvents] = useState<LifeEvent[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Intake state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string>>({});

  // Detail state
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tmpl, evts, archived] = await Promise.all([
        getTemplates(),
        getEvents(),
        getEvents('archived'),
      ]);
      setTemplates(tmpl);
      setEvents(evts);
      setArchivedEvents(archived);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Handlers
  const handleStartEvent = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setIntakeAnswers({});
    const tmpl = templates.find(t => t.id === templateId);
    if (tmpl && tmpl.intakeQuestions.length > 0) {
      setSubView('intake');
    } else {
      handleCreateEvent(templateId, {});
    }
  };

  const handleCreateEvent = async (templateId: string, answers: Record<string, string>) => {
    try {
      setDetailLoading(true);
      const result = await createEvent(templateId, answers);
      const detail = await getEventDetail(result.event.id);
      setEventDetail(detail);
      setSubView('detail');
      showToast('Event created', 'success');
      getEvents().then(setEvents).catch(() => {});
    } catch (err: any) {
      showToast(err.message || 'Failed to create event', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleOpenEvent = async (eventId: string) => {
    try {
      setDetailLoading(true);
      setSubView('detail');
      const detail = await getEventDetail(eventId);
      setEventDetail(detail);
      // Expand all sections by default
      const secs: Record<string, boolean> = {};
      const reqs = detail.readiness.requirements;
      for (const rs of reqs) {
        const tmplReq = detail.template.requirements.find(r => r.id === rs.requirementId);
        if (tmplReq) secs[tmplReq.section] = true;
      }
      setExpandedSections(secs);
    } catch (err: any) {
      showToast(err.message || 'Failed to load event', 'error');
      setSubView('list');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!eventDetail) return;
    try {
      setDetailLoading(true);
      const detail = await getEventDetail(eventDetail.event.id);
      setEventDetail(detail);
    } catch (err: any) {
      showToast(err.message || 'Failed to refresh', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!eventDetail) return;
    try {
      await archiveEvent(eventDetail.event.id);
      showToast('Event archived', 'success');
      setSubView('list');
      loadData();
    } catch (err: any) { showToast(err.message || 'Failed to archive', 'error'); }
  };

  const handleUnarchive = async () => {
    if (!eventDetail) return;
    try {
      await unarchiveEvent(eventDetail.event.id);
      showToast('Event unarchived', 'success');
      setSubView('list');
      loadData();
    } catch (err: any) { showToast(err.message || 'Failed to unarchive', 'error'); }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (subLoading) return (
    <>
      <Stack.Screen options={{ title: 'Life Events', headerShown: true }} />
      <LoadingSpinner fullScreen />
    </>
  );

  if (!isPro) {
    return (
      <>
        <Stack.Screen options={{ title: 'Life Events', headerShown: true }} />
        <ProFeatureGate
          featureName="Life Events"
          featureDescription="Plan for life's big moments with personalized document checklists. Track your readiness for moves, marriages, new jobs, and more."
          onUpgrade={() => router.push('/billing')}
          requiredPlan="pro"
        />
      </>
    );
  }

  if (loading) return (
    <>
      <Stack.Screen options={{ title: 'Life Events', headerShown: true }} />
      <LoadingSpinner fullScreen />
    </>
  );

  // ── LIST VIEW ─────────────────────────────────────────────────────
  if (subView === 'list') {
    return (
      <>
        <Stack.Screen options={{ title: 'Life Events', headerShown: true }} />
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor={colors.primary[600]} />}
          >
            {/* Header */}
            <View style={styles.headerSection}>
              <View style={styles.headerRow}>
                <GradientIcon size={44}>
                  <Compass size={22} color={colors.white} strokeWidth={2} />
                </GradientIcon>
                <View style={styles.headerTextCol}>
                  <Text style={styles.pageTitle}>Life Events</Text>
                  <Text style={styles.pageSubtitle}>
                    Prepare for life's big moments
                  </Text>
                </View>
              </View>
            </View>

            {error && (
              <Card style={styles.errorCard}>
                <View style={styles.errorRow}>
                  <AlertTriangle size={16} color={colors.error[600]} strokeWidth={2} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </Card>
            )}

            {/* Welcome banner */}
            {events.length === 0 && archivedEvents.length === 0 && (
              <LinearGradient
                colors={[...colors.gradient.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.welcomeBanner}
              >
                <View style={styles.welcomeIconRow}>
                  <View style={styles.welcomeIconCircle}>
                    <Compass size={24} color={colors.primary[600]} strokeWidth={2} />
                  </View>
                </View>
                <Text style={styles.welcomeTitle}>Be ready for what's next</Text>
                <Text style={styles.welcomeText}>
                  Planning a move? Getting married? Pick an event below and we'll build a personalized document checklist for you.
                </Text>
              </LinearGradient>
            )}

            {/* Active events */}
            {events.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>My Active Events</Text>
                  <Badge label={String(events.length)} variant="primary" />
                </View>
                {events.map(ev => (
                  <TouchableOpacity
                    key={ev.id}
                    onPress={() => handleOpenEvent(ev.id)}
                    activeOpacity={0.7}
                  >
                    <Card style={styles.eventCard}>
                      <View style={styles.eventCardRow}>
                        <View style={styles.eventIconBox}>
                          {getTemplateIcon(ev.templateIcon, true)}
                        </View>
                        <View style={styles.eventInfoCol}>
                          <Text style={styles.eventName}>{ev.title}</Text>
                          <View style={styles.eventMetaRow}>
                            <FileText size={12} color={colors.slate[400]} strokeWidth={2} />
                            <Text style={styles.eventMeta}>
                              {ev.requirementCount} documents
                            </Text>
                            <Text style={styles.eventMetaDot}>-</Text>
                            <Clock size={12} color={colors.slate[400]} strokeWidth={2} />
                            <Text style={styles.eventMeta}>
                              {new Date(ev.created_at).toLocaleDateString()}
                            </Text>
                          </View>
                        </View>
                        <ReadinessRing score={ev.readiness_score} size={48} />
                        <ChevronRight size={16} color={colors.slate[300]} strokeWidth={2} />
                      </View>
                    </Card>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Template gallery */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {events.length > 0 ? 'Start Another Event' : 'Choose an Event'}
                </Text>
              </View>
              {templates.map(tmpl => (
                <TouchableOpacity
                  key={tmpl.id}
                  onPress={() => handleStartEvent(tmpl.id)}
                  activeOpacity={0.7}
                >
                  <Card style={styles.templateCard}>
                    <View style={styles.templateCardRow}>
                      <GradientIcon size={44}>
                        {getTemplateIcon(tmpl.icon)}
                      </GradientIcon>
                      <View style={styles.templateInfoCol}>
                        <Text style={styles.templateName}>{tmpl.name}</Text>
                        <Text style={styles.templateDesc} numberOfLines={2}>{tmpl.description}</Text>
                        <View style={styles.templateMetaRow}>
                          <Badge label={`${tmpl.requirementCount} docs`} variant="default" />
                          <Badge label={`${tmpl.sections.length} sections`} variant="default" />
                        </View>
                      </View>
                      <View style={styles.templateArrow}>
                        <Plus size={18} color={colors.primary[600]} strokeWidth={2} />
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </View>

            {/* Archived events */}
            {archivedEvents.length > 0 && (
              <View style={styles.section}>
                <TouchableOpacity
                  onPress={() => setShowArchived(!showArchived)}
                  activeOpacity={0.7}
                  style={styles.archivedToggle}
                >
                  <View style={styles.archivedToggleRow}>
                    <Archive size={16} color={colors.slate[500]} strokeWidth={2} />
                    <Text style={styles.archivedToggleText}>
                      Archived Events
                    </Text>
                    <Badge label={String(archivedEvents.length)} variant="default" />
                  </View>
                  <ChevronRight
                    size={16}
                    color={colors.slate[400]}
                    strokeWidth={2}
                    style={{ transform: [{ rotate: showArchived ? '90deg' : '0deg' }] }}
                  />
                </TouchableOpacity>
                {showArchived && archivedEvents.map(ev => (
                  <TouchableOpacity
                    key={ev.id}
                    onPress={() => handleOpenEvent(ev.id)}
                    activeOpacity={0.7}
                  >
                    <Card style={StyleSheet.flatten([styles.eventCard, styles.archivedCard])}>
                      <View style={styles.eventCardRow}>
                        <View style={[styles.eventIconBox, { opacity: 0.5 }]}>
                          {getTemplateIcon(ev.templateIcon, true)}
                        </View>
                        <View style={styles.eventInfoCol}>
                          <Text style={[styles.eventName, { color: colors.slate[600] }]}>{ev.title}</Text>
                          <Badge label="Archived" variant="default" />
                        </View>
                        <ReadinessRing score={ev.readiness_score} size={44} />
                      </View>
                    </Card>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Disclaimer */}
            <View style={styles.disclaimerBox}>
              <AlertTriangle size={14} color="#92400e" strokeWidth={2} />
              <Text style={styles.disclaimerText}>
                <Text style={styles.disclaimerBold}>Disclaimer: </Text>
                Life Events checklists and readiness scores are generated by AI for informational purposes only. They do not constitute legal, financial, or professional advice. Requirements may vary by jurisdiction and individual circumstances. Always verify with relevant authorities or qualified professionals.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </>
    );
  }

  // ── INTAKE VIEW ────────────────────────────────────────────────────
  if (subView === 'intake' && selectedTemplateId) {
    const tmpl = templates.find(t => t.id === selectedTemplateId);
    if (!tmpl) return null;

    return (
      <>
        <Stack.Screen options={{ title: tmpl.name, headerShown: true }} />
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <ScrollView contentContainerStyle={styles.scroll}>
            {/* Back button */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setSubView('list')}
              activeOpacity={0.7}
            >
              <ArrowLeft size={18} color={colors.slate[600]} strokeWidth={2} />
              <Text style={styles.backButtonText}>Back to events</Text>
            </TouchableOpacity>

            <Card>
              <View style={styles.intakeHeader}>
                <GradientIcon size={48}>
                  {getTemplateIcon(tmpl.icon)}
                </GradientIcon>
                <Text style={styles.intakeTitle}>{tmpl.name}</Text>
                <Text style={styles.intakeSubtitle}>Answer a few questions to tailor your checklist.</Text>
              </View>

              <View style={styles.intakeDivider} />

              {tmpl.intakeQuestions.map((q, idx) => (
                <View key={q.id} style={styles.intakeQuestion}>
                  <View style={styles.intakeQuestionHeader}>
                    <View style={styles.intakeQuestionNumber}>
                      <Text style={styles.intakeQuestionNumberText}>{idx + 1}</Text>
                    </View>
                    <Text style={styles.intakeLabel}>{q.label}</Text>
                  </View>
                  {q.type === 'select' && q.options ? (
                    <View style={styles.intakeOptions}>
                      {q.options.map(opt => {
                        const isSelected = intakeAnswers[q.id] === opt.value;
                        return (
                          <TouchableOpacity
                            key={opt.value}
                            style={[styles.intakeOption, isSelected && styles.intakeOptionActive]}
                            onPress={() => setIntakeAnswers(prev => ({ ...prev, [q.id]: opt.value }))}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.intakeRadio, isSelected && styles.intakeRadioActive]}>
                              {isSelected && <View style={styles.intakeRadioDot} />}
                            </View>
                            <Text style={[styles.intakeOptionText, isSelected && styles.intakeOptionTextActive]}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.intakeToggleRow}>
                      {[{ val: 'true', label: 'Yes' }, { val: 'false', label: 'No' }].map(({ val, label }) => {
                        const isSelected = intakeAnswers[q.id] === val;
                        return (
                          <TouchableOpacity
                            key={val}
                            style={[styles.intakeToggle, isSelected && (
                              val === 'true' ? styles.intakeToggleYes : styles.intakeToggleNo
                            )]}
                            onPress={() => setIntakeAnswers(prev => ({ ...prev, [q.id]: val }))}
                            activeOpacity={0.7}
                          >
                            {val === 'true' ? (
                              <CheckCircle size={16} color={isSelected ? colors.success[600] : colors.slate[400]} strokeWidth={2} />
                            ) : (
                              <AlertTriangle size={16} color={isSelected ? colors.error[600] : colors.slate[400]} strokeWidth={2} />
                            )}
                            <Text style={[
                              styles.intakeToggleText,
                              isSelected && (val === 'true' ? styles.intakeToggleTextYes : styles.intakeToggleTextNo),
                            ]}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ))}

              <View style={styles.intakeActions}>
                <Button
                  title="Cancel"
                  onPress={() => setSubView('list')}
                  variant="outline"
                  style={{ flex: 1 }}
                  icon={<ChevronLeft size={16} color={colors.slate[700]} strokeWidth={2} />}
                />
                <Button
                  title="Generate Checklist"
                  onPress={() => handleCreateEvent(selectedTemplateId, intakeAnswers)}
                  loading={detailLoading}
                  disabled={detailLoading}
                  style={{ flex: 2 }}
                  iconRight={<ChevronRight size={16} color={colors.white} strokeWidth={2} />}
                />
              </View>
            </Card>
          </ScrollView>
        </SafeAreaView>
      </>
    );
  }

  // ── DETAIL VIEW ────────────────────────────────────────────────────
  if (subView === 'detail') {
    if (detailLoading && !eventDetail) {
      return (
        <>
          <Stack.Screen options={{ title: 'Event Details', headerShown: true }} />
          <LoadingSpinner fullScreen />
        </>
      );
    }

    if (!eventDetail) return null;

    const { event, template, readiness } = eventDetail;
    const reqs = readiness.requirements;

    // Group by section
    const sections: Record<string, { req: typeof template.requirements[0]; status: RequirementStatusItem }[]> = {};
    for (const rs of reqs) {
      const tmplReq = template.requirements.find(r => r.id === rs.requirementId);
      if (!tmplReq) continue;
      const sec = tmplReq.section;
      if (!sections[sec]) sections[sec] = [];
      sections[sec].push({ req: tmplReq, status: rs });
    }

    // Filter
    const filteredSections: typeof sections = {};
    for (const [sec, items] of Object.entries(sections)) {
      const filtered = statusFilter === 'all' ? items : items.filter(i => i.status.status === statusFilter);
      if (filtered.length > 0) filteredSections[sec] = filtered;
    }

    // Status counts
    const counts: Record<string, number> = {};
    for (const rs of reqs) {
      counts[rs.status] = (counts[rs.status] || 0) + 1;
    }

    const totalReqs = reqs.length;
    const satisfiedCount = counts.satisfied || 0;

    const FILTERS = [
      { key: 'all', label: 'All', count: totalReqs },
      { key: 'missing', label: 'Missing', count: counts.missing || 0 },
      { key: 'needs_update', label: 'Update', count: counts.needs_update || 0 },
      { key: 'satisfied', label: 'Done', count: counts.satisfied || 0 },
    ];

    return (
      <>
        <Stack.Screen options={{ title: event.title, headerShown: true }} />
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <ScrollView contentContainerStyle={styles.scroll}>
            {/* Back button */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => { setSubView('list'); setEventDetail(null); }}
              activeOpacity={0.7}
            >
              <ArrowLeft size={18} color={colors.slate[600]} strokeWidth={2} />
              <Text style={styles.backButtonText}>Back to events</Text>
            </TouchableOpacity>

            {/* Header card */}
            <Card>
              <View style={styles.detailHeader}>
                <GradientIcon size={48}>
                  {getTemplateIcon(event.templateIcon)}
                </GradientIcon>
                <View style={styles.detailHeaderInfo}>
                  <Text style={styles.detailTitle}>{event.title}</Text>
                  <View style={styles.detailMetaRow}>
                    <Clock size={12} color={colors.slate[400]} strokeWidth={2} />
                    <Text style={styles.detailMeta}>Started {new Date(event.created_at).toLocaleDateString()}</Text>
                    {event.status === 'archived' && <Badge label="Archived" variant="default" />}
                  </View>
                </View>
              </View>

              {/* Readiness score section */}
              <View style={styles.detailScoreSection}>
                <ReadinessRing score={readiness.readinessScore} size={72} />
                <View style={styles.detailScoreInfo}>
                  <Text style={styles.detailScoreTitle}>Readiness Score</Text>
                  <Text style={styles.detailScoreStats}>
                    {satisfiedCount} of {totalReqs} requirements met
                  </Text>
                </View>
              </View>

              {/* Progress bar with gradient fill */}
              <View style={styles.progressBarContainer}>
                <View style={styles.progressBarTrack}>
                  <LinearGradient
                    colors={[...colors.gradient.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.progressBarFill, { width: `${Math.min(100, readiness.readinessScore)}%` }]}
                  />
                </View>
                <Text style={styles.progressBarLabel}>{Math.round(readiness.readinessScore)}%</Text>
              </View>

              {/* Next best action */}
              {readiness.nextBestAction && (
                <View style={styles.nextAction}>
                  <AlertTriangle size={16} color={colors.warning[700]} strokeWidth={2} />
                  <View style={styles.nextActionTextCol}>
                    <Text style={styles.nextActionLabel}>Next Step</Text>
                    <Text style={styles.nextActionText}>{readiness.nextBestAction}</Text>
                  </View>
                </View>
              )}

              {/* Actions */}
              <View style={styles.detailActions}>
                <Button
                  title="Refresh"
                  onPress={handleRefresh}
                  variant="outline"
                  size="sm"
                  loading={detailLoading}
                  icon={<RefreshCw size={14} color={colors.slate[700]} strokeWidth={2} />}
                  style={{ flex: 1 }}
                />
                {event.status === 'archived' ? (
                  <Button
                    title="Unarchive"
                    onPress={handleUnarchive}
                    variant="secondary"
                    size="sm"
                    icon={<Archive size={14} color={colors.slate[700]} strokeWidth={2} />}
                    style={{ flex: 1 }}
                  />
                ) : (
                  <Button
                    title="Archive"
                    onPress={handleArchive}
                    variant="secondary"
                    size="sm"
                    icon={<Archive size={14} color={colors.slate[700]} strokeWidth={2} />}
                    style={{ flex: 1 }}
                  />
                )}
              </View>
            </Card>

            {/* Status filter chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTERS.map(f => {
                const isActive = statusFilter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                    onPress={() => setStatusFilter(f.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                      {f.label}
                    </Text>
                    {f.count > 0 && (
                      <View style={[styles.filterCount, isActive && styles.filterCountActive]}>
                        <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                          {f.count}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Sections with accordion */}
            {Object.entries(filteredSections).map(([section, items]) => {
              const isExpanded = expandedSections[section] !== false;
              const sectionSatisfied = items.filter(i => i.status.status === 'satisfied').length;

              return (
                <Card key={section} style={styles.sectionCard}>
                  <TouchableOpacity
                    onPress={() => toggleSection(section)}
                    style={styles.sectionHeaderRow}
                    activeOpacity={0.7}
                  >
                    <View style={styles.sectionHeaderLeft}>
                      <Text style={styles.sectionHeaderTitle}>{section}</Text>
                      <Badge
                        label={`${sectionSatisfied}/${items.length}`}
                        variant={sectionSatisfied === items.length ? 'success' : 'default'}
                      />
                    </View>
                    <ChevronRight
                      size={18}
                      color={colors.slate[400]}
                      strokeWidth={2}
                      style={{ transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }}
                    />
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.sectionItems}>
                      {items.map(({ req, status: rs }) => (
                        <View key={req.id} style={styles.reqItem}>
                          <View style={styles.reqRow}>
                            <View style={styles.reqStatusIcon}>
                              {STATUS_ICON[rs.status] || <Clock size={14} color={colors.slate[400]} strokeWidth={2} />}
                            </View>
                            <View style={styles.reqInfoCol}>
                              <View style={styles.reqTitleRow}>
                                <Text style={styles.reqTitle} numberOfLines={1}>{req.title}</Text>
                                <Badge
                                  label={STATUS_LABEL[rs.status] || rs.status}
                                  variant={STATUS_VARIANT[rs.status] || 'default'}
                                />
                              </View>
                              {req.description ? (
                                <Text style={styles.reqDesc} numberOfLines={2}>{req.description}</Text>
                              ) : null}

                              {/* Matched document */}
                              {rs.matchedDocuments.length > 0 && (
                                <TouchableOpacity
                                  style={styles.matchedDoc}
                                  onPress={() => router.push({
                                    pathname: '/document/[id]',
                                    params: { id: rs.matchedDocuments[0].documentId },
                                  })}
                                  activeOpacity={0.7}
                                >
                                  <FileText size={14} color={colors.primary[600]} strokeWidth={2} />
                                  <View style={styles.matchedDocInfo}>
                                    <Text style={styles.matchedDocName} numberOfLines={1}>
                                      {rs.matchedDocuments[0].documentName}
                                    </Text>
                                    <Text style={styles.matchedDocMeta}>
                                      {Math.round(rs.matchedDocuments[0].confidence * 100)}% confidence
                                    </Text>
                                  </View>
                                  <ChevronRight size={14} color={colors.primary[400]} strokeWidth={2} />
                                </TouchableOpacity>
                              )}

                              {rs.suggestedAction && (
                                <View style={styles.suggestedActionRow}>
                                  <AlertTriangle size={12} color={colors.warning[600]} strokeWidth={2} />
                                  <Text style={styles.suggestedAction}>{rs.suggestedAction}</Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </Card>
              );
            })}

            {/* Empty filtered state */}
            {Object.keys(filteredSections).length === 0 && statusFilter !== 'all' && (
              <Card style={styles.emptyFilterCard}>
                <CheckCircle size={24} color={colors.primary[500]} strokeWidth={2} />
                <Text style={styles.emptyFilterTitle}>
                  No {statusFilter === 'missing' ? 'missing' : statusFilter === 'needs_update' ? 'update needed' : 'completed'} items
                </Text>
                <Text style={styles.emptyFilterText}>
                  Try a different filter to see requirements
                </Text>
              </Card>
            )}
          </ScrollView>
        </SafeAreaView>
      </>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate[50] },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },

  // Header
  headerSection: { marginBottom: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
  errorCard: { backgroundColor: colors.error[50], borderColor: colors.error[200] },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  errorText: { fontSize: typography.fontSize.sm, color: colors.error[700], flex: 1 },

  // Welcome banner
  welcomeBanner: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    overflow: 'hidden',
  },
  welcomeIconRow: { marginBottom: spacing.md },
  welcomeIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
    marginBottom: spacing.sm,
  },
  welcomeText: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 22,
  },

  // Section
  section: { gap: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },

  // Event card
  eventCard: { marginBottom: 0 },
  eventCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  eventIconBox: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventInfoCol: { flex: 1 },
  eventName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  eventMeta: { fontSize: typography.fontSize.xs, color: colors.slate[500] },
  eventMetaDot: { fontSize: typography.fontSize.xs, color: colors.slate[300] },
  archivedCard: { opacity: 0.65 },

  // Template card
  templateCard: { marginBottom: 0 },
  templateCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  templateInfoCol: { flex: 1 },
  templateName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    marginBottom: 2,
  },
  templateDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  templateMetaRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  templateArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Archived toggle
  archivedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  archivedToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  archivedToggleText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[600],
  },

  // Back button
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  backButtonText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    fontWeight: typography.fontWeight.medium,
  },

  // Intake
  intakeHeader: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  intakeTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    marginTop: spacing.md,
    textAlign: 'center',
  },
  intakeSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  intakeDivider: {
    height: 1,
    backgroundColor: colors.slate[100],
    marginBottom: spacing.lg,
  },
  intakeQuestion: {
    marginBottom: spacing.xl,
  },
  intakeQuestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  intakeQuestionNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  intakeQuestionNumberText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[700],
  },
  intakeLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
    flex: 1,
  },
  intakeOptions: {
    gap: spacing.sm,
    paddingLeft: spacing['2xl'] + spacing.sm,
  },
  intakeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  intakeOptionActive: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[400],
  },
  intakeRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.slate[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  intakeRadioActive: {
    borderColor: colors.primary[600],
  },
  intakeRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary[600],
  },
  intakeOptionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
    flex: 1,
  },
  intakeOptionTextActive: {
    color: colors.primary[800],
    fontWeight: typography.fontWeight.semibold,
  },
  intakeToggleRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingLeft: spacing['2xl'] + spacing.sm,
  },
  intakeToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  intakeToggleYes: {
    backgroundColor: colors.success[50],
    borderColor: colors.success[200],
  },
  intakeToggleNo: {
    backgroundColor: colors.error[50],
    borderColor: colors.error[200],
  },
  intakeToggleText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[600],
  },
  intakeToggleTextYes: { color: colors.success[700] },
  intakeToggleTextNo: { color: colors.error[700] },
  intakeActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
  },

  // Detail header
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  detailHeaderInfo: { flex: 1 },
  detailTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  detailMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
  },

  // Detail score section
  detailScoreSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.slate[50],
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  detailScoreInfo: { flex: 1 },
  detailScoreTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
  },
  detailScoreStats: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    marginTop: 2,
  },

  // Progress bar
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  progressBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.slate[100],
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
  },
  progressBarLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[600],
    width: 36,
    textAlign: 'right',
  },

  // Next action
  nextAction: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warning[50],
    borderWidth: 1,
    borderColor: colors.warning[200],
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  nextActionTextCol: { flex: 1 },
  nextActionLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.warning[800],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  nextActionText: {
    fontSize: typography.fontSize.sm,
    color: colors.warning[800],
    lineHeight: 20,
  },

  // Detail actions
  detailActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  // Readiness Ring
  ringOuter: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringTrack: {
    position: 'absolute',
    borderWidth: 4,
  },
  ringProgress: {
    position: 'absolute',
    borderWidth: 4,
  },
  ringCenter: {
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringText: {
    fontWeight: typography.fontWeight.bold,
  },

  // Filters
  filterRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate[200],
  },
  filterChipActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  filterText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    fontWeight: typography.fontWeight.medium,
  },
  filterTextActive: {
    color: colors.white,
    fontWeight: typography.fontWeight.semibold,
  },
  filterCount: {
    backgroundColor: colors.slate[100],
    borderRadius: borderRadius.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  filterCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  filterCountText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[600],
  },
  filterCountTextActive: {
    color: colors.white,
  },

  // Section accordion cards
  sectionCard: { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' },
  sectionHeaderRow: {
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
  sectionHeaderTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },

  // Requirement items
  sectionItems: {
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
  },
  reqItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[50],
  },
  reqRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  reqStatusIcon: {
    marginTop: 2,
  },
  reqInfoCol: { flex: 1 },
  reqTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  reqTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    flex: 1,
  },
  reqDesc: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    lineHeight: 18,
    marginBottom: spacing.xs,
  },

  // Matched document
  matchedDoc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  matchedDocInfo: { flex: 1 },
  matchedDocName: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[800],
  },
  matchedDocMeta: {
    fontSize: 10,
    color: colors.primary[600],
    marginTop: 1,
  },

  // Suggested action
  suggestedActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  suggestedAction: {
    fontSize: typography.fontSize.xs,
    color: colors.warning[700],
    fontWeight: typography.fontWeight.medium,
    flex: 1,
  },

  // Empty filter state
  emptyFilterCard: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyFilterTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[700],
  },
  emptyFilterText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
  },

  // Disclaimer
  disclaimerBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: borderRadius.lg,
  },
  disclaimerText: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    color: '#92400e',
    lineHeight: 18,
  },
  disclaimerBold: {
    fontWeight: typography.fontWeight.bold,
  },
});
