import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  FileText,
  Calendar,
  AlertTriangle,
  TrendingUp,
  Upload,
  ClipboardCheck,
  Search,
  ArrowRight,
  Sparkles,
  Crown,
  Zap,
  Shield,
  MessageSquare,
} from 'lucide-react-native';
import { useAuthStore } from '../../src/store/authStore';
import { useAuth } from '../../src/hooks/useAuth';
import { useDocuments } from '../../src/hooks/useDocuments';
import { useSubscription } from '../../src/hooks/useSubscription';
import Card from '../../src/components/ui/Card';
import Button from '../../src/components/ui/Button';
import Badge from '../../src/components/ui/Badge';
import GradientIcon from '../../src/components/ui/GradientIcon';
import LoadingSpinner from '../../src/components/ui/LoadingSpinner';
import TodayFeedWidget from '../../src/components/dashboard/TodayFeedWidget';
import ReviewPrompt from '../../src/components/ui/ReviewPrompt';
import OnboardingModal from '../../src/components/OnboardingModal';
import { getUserProfile, isOnboardingComplete } from '../../src/lib/supabase';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius } from '../../src/theme/spacing';

// Max width matching root layout's MAX_APP_WIDTH for card sizing
const MAX_CONTENT_WIDTH = 480;

// ---------- helpers ----------

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatRelativeDate(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `${days} days`;
  if (days <= 30) return `${Math.ceil(days / 7)} weeks`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const planIcons: Record<string, React.ReactNode> = {
  free: <Shield size={16} color={colors.slate[500]} />,
  starter: <Zap size={16} color={colors.warning[600]} />,
  pro: <Crown size={16} color={colors.primary[600]} />,
};

const planLabels: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
};

// ---------- component ----------

export default function DashboardScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Platform.OS === 'web' ? Math.min(windowWidth, MAX_CONTENT_WIDTH) : windowWidth;
  const actionCardWidth = (contentWidth - spacing.lg * 2 - spacing.md) / 2;

  const { user } = useAuthStore();
  const { isAuthenticated } = useAuth();
  const { documents, loading, refetch } = useDocuments(isAuthenticated);
  const { subscription, loading: subLoading, documentCount, canAskQuestion, isPro, isStarterOrAbove } = useSubscription();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check if onboarding is complete
  useEffect(() => {
    if (!user?.id) return;
    getUserProfile().then(profile => {
      if (!isOnboardingComplete(profile)) {
        setShowOnboarding(true);
      }
    }).catch(() => {});
  }, [user?.id]);

  const displayName =
    user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User';
  const firstName = displayName.split(' ')[0];

  // Derived data
  const activeCount = useMemo(
    () => documents.filter((d) => d.status === 'active').length,
    [documents],
  );

  const expiringDocs = useMemo(
    () =>
      documents
        .filter((d) => d.status === 'expiring' || d.status === 'expired')
        .sort((a, b) => {
          if (!a.expiration_date) return 1;
          if (!b.expiration_date) return -1;
          return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
        }),
    [documents],
  );

  const aiQuestionsLeft = subscription
    ? subscription.plan === 'free'
      ? Math.max(0, subscription.ai_questions_limit - subscription.ai_questions_used)
      : -1 // unlimited
    : 0;

  const docUsagePercent = subscription
    ? Math.min(100, Math.round((documentCount / subscription.document_limit) * 100))
    : 0;

  const uploadUsagePercent = subscription
    ? Math.min(
        100,
        Math.round(
          (subscription.monthly_uploads_used / subscription.monthly_upload_limit) * 100,
        ),
      )
    : 0;

  // ---------- render ----------

  if (subLoading) return <LoadingSpinner fullScreen />;

  return (
    <>
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          Platform.OS === 'web' && { alignItems: 'center' },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refetch}
            tintColor={colors.primary[600]}
            colors={[colors.primary[600]]}
          />
        }
      >
        <View style={{ width: '100%' }}>
        {/* ====== WELCOME HEADER ====== */}
        <LinearGradient
          colors={[...colors.gradient.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.welcomeBanner}
        >
          <View style={styles.welcomeContent}>
            <View style={styles.welcomeTextBlock}>
              <Text style={styles.greetingText}>{getGreeting()},</Text>
              <Text style={styles.nameText} numberOfLines={1}>
                {firstName}
              </Text>
              <View style={styles.docSummaryPill}>
                <FileText size={14} color="rgba(255,255,255,0.85)" />
                <Text style={styles.docSummaryText}>
                  {documentCount} document{documentCount !== 1 ? 's' : ''} stored
                </Text>
              </View>
            </View>
            <View style={styles.welcomeDecoCircle}>
              <Sparkles size={28} color="rgba(255,255,255,0.3)" />
            </View>
          </View>

          {/* Subtle decorative circles */}
          <View style={[styles.decorCircle, styles.decorCircle1]} />
          <View style={[styles.decorCircle, styles.decorCircle2]} />
        </LinearGradient>

        {/* ====== QUICK ACTIONS GRID (2x2) ====== */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionLabel}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <QuickAction
              icon={<Upload size={22} color={colors.white} />}
              title="Upload"
              subtitle="Add document"
              cardWidth={actionCardWidth}
              onPress={() => router.push('/upload')}
            />
            <QuickAction
              icon={<ClipboardCheck size={22} color={colors.white} />}
              title="Audit"
              subtitle="Vault health"
              cardWidth={actionCardWidth}
              onPress={() => router.push('/audit')}
              locked={!isStarterOrAbove}
              requiredPlan="starter"
            />
            <QuickAction
              icon={<Search size={22} color={colors.white} />}
              title="Search"
              subtitle="Find anything"
              cardWidth={actionCardWidth}
              onPress={() => router.push('/search')}
              locked={!isPro}
              requiredPlan="pro"
            />
            <QuickAction
              icon={<MessageSquare size={22} color={colors.white} />}
              title="AI Chat"
              subtitle="Ask anything"
              cardWidth={actionCardWidth}
              onPress={() => router.push('/(tabs)/chat')}
              locked={!isPro}
              requiredPlan="pro"
            />
          </View>
        </View>

        {/* ====== STATS ROW ====== */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionLabel}>Overview</Text>
          <View style={styles.statsRow}>
            <StatCard
              icon={<FileText size={18} color={colors.primary[600]} />}
              iconBg={colors.primary[50]}
              value={String(documentCount)}
              label="Total"
            />
            <StatCard
              icon={<TrendingUp size={18} color={colors.success[600]} />}
              iconBg={colors.success[50]}
              value={String(activeCount)}
              label="Active"
            />
            <StatCard
              icon={<AlertTriangle size={18} color={colors.warning[600]} />}
              iconBg={colors.warning[50]}
              value={String(expiringDocs.length)}
              label="Expiring"
              highlight={expiringDocs.length > 0}
            />
            <StatCard
              icon={<MessageSquare size={18} color={colors.info[600]} />}
              iconBg={colors.info[50]}
              value={aiQuestionsLeft === -1 ? '\u221E' : String(aiQuestionsLeft)}
              label="AI Left"
            />
          </View>
        </View>

        {/* ====== TODAY'S FEED ====== */}
        <View style={styles.sectionContainer}>
          <TodayFeedWidget />
        </View>

        {/* ====== EXPIRATION ALERTS ====== */}
        {expiringDocs.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Expiration Alerts</Text>
              <Badge
                label={`${expiringDocs.length}`}
                variant={expiringDocs.some((d) => d.status === 'expired') ? 'error' : 'warning'}
              />
            </View>
            <Card>
              {expiringDocs.slice(0, 5).map((doc, index) => {
                const isExpired = doc.status === 'expired';
                const days = doc.expiration_date ? daysUntil(doc.expiration_date) : null;

                return (
                  <TouchableOpacity
                    key={doc.id}
                    style={[
                      styles.alertRow,
                      index < Math.min(expiringDocs.length, 5) - 1 && styles.alertRowBorder,
                    ]}
                    activeOpacity={0.6}
                    onPress={() =>
                      router.push({ pathname: '/document/[id]', params: { id: doc.id } })
                    }
                  >
                    {/* Calendar icon */}
                    <View
                      style={[
                        styles.alertIconCircle,
                        {
                          backgroundColor: isExpired ? colors.error[50] : colors.warning[50],
                        },
                      ]}
                    >
                      <Calendar
                        size={18}
                        color={isExpired ? colors.error[600] : colors.warning[600]}
                      />
                    </View>

                    {/* Doc info */}
                    <View style={styles.alertInfo}>
                      <Text style={styles.alertDocName} numberOfLines={1}>
                        {doc.name}
                      </Text>
                      <View style={styles.alertMeta}>
                        <Text
                          style={[
                            styles.alertDateText,
                            isExpired && { color: colors.error[600] },
                          ]}
                        >
                          {doc.expiration_date
                            ? formatRelativeDate(doc.expiration_date)
                            : 'No date'}
                        </Text>
                        <Badge
                          label={isExpired ? 'Expired' : 'Expiring'}
                          variant={isExpired ? 'error' : 'warning'}
                        />
                      </View>
                    </View>

                    {/* Navigate arrow */}
                    <ArrowRight size={18} color={colors.slate[400]} />
                  </TouchableOpacity>
                );
              })}

              {expiringDocs.length > 5 && (
                <TouchableOpacity
                  style={styles.seeAllRow}
                  onPress={() => router.push('/(tabs)/vault')}
                >
                  <Text style={styles.seeAllText}>
                    See all {expiringDocs.length} alerts
                  </Text>
                  <ArrowRight size={14} color={colors.primary[600]} />
                </TouchableOpacity>
              )}
            </Card>
          </View>
        )}

        {/* ====== PLAN USAGE CARD ====== */}
        {subscription && (
          <View style={styles.sectionContainer}>
            <Card>
              {/* Plan header row */}
              <View style={styles.planHeader}>
                <View style={styles.planNameRow}>
                  <View style={styles.planIconCircle}>
                    {planIcons[subscription.plan]}
                  </View>
                  <View>
                    <Text style={styles.planTitle}>
                      {planLabels[subscription.plan]} Plan
                    </Text>
                    <Text style={styles.planSubtitle}>
                      {subscription.plan === 'free'
                        ? 'Basic document storage'
                        : subscription.plan === 'starter'
                        ? 'Enhanced features'
                        : 'Full power, unlimited AI'}
                    </Text>
                  </View>
                </View>
                <Badge
                  label={subscription.status === 'active' ? 'Active' : subscription.status}
                  variant={subscription.status === 'active' ? 'success' : 'warning'}
                />
              </View>

              {/* Document storage bar */}
              <View style={styles.usageBlock}>
                <View style={styles.usageLabelRow}>
                  <Text style={styles.usageLabelText}>Document Storage</Text>
                  <Text style={styles.usageValueText}>
                    {documentCount} / {subscription.document_limit}
                  </Text>
                </View>
                <View style={styles.progressBarTrack}>
                  <LinearGradient
                    colors={
                      docUsagePercent > 90
                        ? ([colors.error[500], colors.warning[500]] as [string, string])
                        : ([...colors.gradient.primary] as [string, string])
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.progressBarFill, { width: `${Math.max(2, docUsagePercent)}%` }]}
                  />
                </View>
              </View>

              {/* Monthly uploads bar */}
              <View style={styles.usageBlock}>
                <View style={styles.usageLabelRow}>
                  <Text style={styles.usageLabelText}>Monthly Uploads</Text>
                  <Text style={styles.usageValueText}>
                    {subscription.monthly_uploads_used} / {subscription.monthly_upload_limit}
                  </Text>
                </View>
                <View style={styles.progressBarTrack}>
                  <LinearGradient
                    colors={
                      uploadUsagePercent > 90
                        ? ([colors.error[500], colors.warning[500]] as [string, string])
                        : ([...colors.gradient.primary] as [string, string])
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[
                      styles.progressBarFill,
                      { width: `${Math.max(2, uploadUsagePercent)}%` },
                    ]}
                  />
                </View>
              </View>

              {/* AI questions (free plan only) */}
              {subscription.plan === 'free' && (
                <View style={styles.usageBlock}>
                  <View style={styles.usageLabelRow}>
                    <Text style={styles.usageLabelText}>AI Questions</Text>
                    <Text style={styles.usageValueText}>
                      {subscription.ai_questions_used} / {subscription.ai_questions_limit}
                    </Text>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <LinearGradient
                      colors={
                        !canAskQuestion
                          ? ([colors.error[500], colors.warning[500]] as [string, string])
                          : ([colors.info[500], colors.primary[500]] as [string, string])
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.max(
                            2,
                            Math.round(
                              (subscription.ai_questions_used /
                                subscription.ai_questions_limit) *
                                100,
                            ),
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              )}

              {/* Upgrade button for free users */}
              {subscription.plan === 'free' && (
                <Button
                  title="Upgrade Plan"
                  onPress={() => router.push('/billing')}
                  size="sm"
                  icon={<Zap size={16} color={colors.white} />}
                  fullWidth
                  style={{ marginTop: spacing.lg }}
                />
              )}
            </Card>
          </View>
        )}

        {/* ====== REVIEW PROMPT ====== */}
        <ReviewPrompt documentCount={documentCount} />
        </View>
      </ScrollView>
    </SafeAreaView>
    <OnboardingModal visible={showOnboarding} onComplete={() => setShowOnboarding(false)} />
    </>
  );
}

// ---------- sub-components ----------

function QuickAction({
  icon,
  title,
  subtitle,
  cardWidth,
  onPress,
  locked = false,
  requiredPlan,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  cardWidth: number;
  onPress: () => void;
  locked?: boolean;
  requiredPlan?: 'starter' | 'pro';
}) {
  return (
    <TouchableOpacity style={[styles.quickActionCard, { width: cardWidth }]} activeOpacity={0.7} onPress={onPress}>
      <View style={{ position: 'relative' }}>
        <GradientIcon size={44}>{icon}</GradientIcon>
        {locked && (
          <View style={[
            styles.crownBadgeAction,
            { backgroundColor: requiredPlan === 'pro' ? '#d97706' : colors.primary[600] },
          ]}>
            <Crown size={10} color={colors.white} strokeWidth={2.5} />
          </View>
        )}
      </View>
      <Text style={styles.quickActionTitle}>{title}</Text>
      <Text style={styles.quickActionSub}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

function StatCard({
  icon,
  iconBg,
  value,
  label,
  highlight = false,
}: {
  icon: React.ReactNode;
  iconBg: string;
  value: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconCircle, { backgroundColor: iconBg }]}>{icon}</View>
      <Text
        style={[
          styles.statValue,
          highlight && { color: colors.warning[600] },
        ]}
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ---------- styles ----------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.slate[50],
  },
  scroll: {
    paddingBottom: spacing.xl,
  },

  // ---- Welcome banner ----
  welcomeBanner: {
    paddingTop: spacing['2xl'],
    paddingBottom: spacing['3xl'],
    paddingHorizontal: spacing.xl,
    borderBottomLeftRadius: borderRadius.xl + 8,
    borderBottomRightRadius: borderRadius.xl + 8,
    overflow: 'hidden',
    position: 'relative',
  },
  welcomeContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  welcomeTextBlock: {
    flex: 1,
  },
  greetingText: {
    fontSize: typography.fontSize.base,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: typography.fontWeight.medium,
  },
  nameText: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
    marginTop: 2,
  },
  docSummaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  docSummaryText: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: typography.fontWeight.medium,
  },
  welcomeDecoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  decorCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  decorCircle1: {
    width: 120,
    height: 120,
    top: -30,
    right: -20,
  },
  decorCircle2: {
    width: 80,
    height: 80,
    bottom: -20,
    left: 40,
  },

  // ---- Sections ----
  sectionContainer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  sectionLabel: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
    marginBottom: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },

  // ---- Quick Actions ----
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  quickActionCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.lg + 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.slate[200],
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  quickActionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
    marginTop: spacing.sm + 2,
  },
  quickActionSub: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    marginTop: 2,
  },

  // ---- Stats ----
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.slate[200],
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs + 2,
  },
  statValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  statLabel: {
    fontSize: 11,
    color: colors.slate[400],
    fontWeight: typography.fontWeight.medium,
    marginTop: 1,
  },

  // ---- Plan Usage ----
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  planNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  planIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  planSubtitle: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    marginTop: 1,
  },
  usageBlock: {
    marginBottom: spacing.md,
  },
  usageLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs + 2,
  },
  usageLabelText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    fontWeight: typography.fontWeight.medium,
  },
  usageValueText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[700],
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: colors.slate[100],
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },

  // ---- Expiration Alerts ----
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  alertRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
  },
  alertIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertInfo: {
    flex: 1,
  },
  alertDocName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
    marginBottom: spacing.xs,
  },
  alertMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  alertDateText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    fontWeight: typography.fontWeight.medium,
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
    marginTop: spacing.xs,
  },
  seeAllText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
  },

  // Crown badge for gated quick actions
  crownBadgeAction: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
});
