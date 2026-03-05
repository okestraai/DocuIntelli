import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Modal, Image, Platform,
  Dimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Shield, Users, Clock, CheckCircle, AlertTriangle, FileText,
  Eye, ChevronDown, ChevronRight, Lock, Unlock, ArrowLeft, X,
  Maximize2, Calendar, HardDrive, AlertCircle,
} from 'lucide-react-native';
import {
  getSharedWithMe, getSharedEventDetail, requestAccess, getSharedDocPreview,
  type SharedEventSummary, type AccessibleDocument,
} from '../src/lib/emergencyAccessApi';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { spacing, borderRadius } from '../src/theme/spacing';
import Card from '../src/components/ui/Card';

// Only import WebView on native platforms
let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function policyLabel(policy: string): string {
  switch (policy) {
    case 'immediate': return 'Immediate';
    case 'time_delayed': return 'Time-Delayed';
    case 'approval': return 'Owner Approval';
    default: return policy;
  }
}

function secondsUntil(isoDate: string): number {
  return Math.max(0, Math.floor((new Date(isoDate).getTime() - Date.now()) / 1000));
}

function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [
    h.toString().padStart(2, '0'),
    m.toString().padStart(2, '0'),
    s.toString().padStart(2, '0'),
  ].join(':');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Policy / Status config
// ---------------------------------------------------------------------------

const POLICY_CONFIG: Record<string, {
  icon: typeof Unlock;
  bg: string;
  text: string;
  border: string;
}> = {
  immediate: {
    icon: Unlock,
    bg: colors.primary[50],
    text: colors.primary[700],
    border: colors.primary[200],
  },
  time_delayed: {
    icon: Clock,
    bg: colors.warning[50],
    text: colors.warning[700],
    border: colors.warning[200],
  },
  approval: {
    icon: Lock,
    bg: colors.info[50],
    text: colors.info[700],
    border: colors.info[200],
  },
};

const STATUS_CONFIG: Record<string, {
  icon: typeof Shield;
  bg: string;
  text: string;
  border: string;
  label: string;
}> = {
  none: {
    icon: Shield,
    bg: colors.slate[50],
    text: colors.slate[600],
    border: colors.slate[200],
    label: 'Not requested',
  },
  pending: {
    icon: Clock,
    bg: colors.warning[50],
    text: colors.warning[700],
    border: colors.warning[200],
    label: 'Pending',
  },
  approved: {
    icon: CheckCircle,
    bg: colors.primary[50],
    text: colors.primary[700],
    border: colors.primary[200],
    label: 'Approved',
  },
  auto_granted: {
    icon: CheckCircle,
    bg: colors.primary[50],
    text: colors.primary[700],
    border: colors.primary[200],
    label: 'Access granted',
  },
  denied: {
    icon: AlertTriangle,
    bg: colors.error[50],
    text: colors.error[700],
    border: colors.error[200],
    label: 'Denied',
  },
  vetoed: {
    icon: AlertTriangle,
    bg: colors.error[50],
    text: colors.error[700],
    border: colors.error[200],
    label: 'Vetoed',
  },
};

// ---------------------------------------------------------------------------
// PolicyBadge
// ---------------------------------------------------------------------------

function PolicyBadge({ policy }: { policy: string }) {
  const cfg = POLICY_CONFIG[policy] || POLICY_CONFIG.immediate;
  const Icon = cfg.icon;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Icon size={12} color={cfg.text} strokeWidth={2.5} />
      <Text style={[styles.badgeText, { color: cfg.text }]}>{policyLabel(policy)}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.none;
  const Icon = cfg.icon;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Icon size={12} color={cfg.text} strokeWidth={2.5} />
      <Text style={[styles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// CooldownCountdown
// ---------------------------------------------------------------------------

function CooldownCountdown({ cooldownEndsAt, onComplete }: {
  cooldownEndsAt: string;
  onComplete: () => void;
}) {
  const [remaining, setRemaining] = useState(() => secondsUntil(cooldownEndsAt));

  useEffect(() => {
    setRemaining(secondsUntil(cooldownEndsAt));
    const interval = setInterval(() => {
      const left = secondsUntil(cooldownEndsAt);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(interval);
        onComplete();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownEndsAt, onComplete]);

  if (remaining <= 0) {
    return (
      <View style={[styles.statusBanner, {
        backgroundColor: colors.primary[50],
        borderColor: colors.primary[200],
      }]}>
        <CheckCircle size={20} color={colors.primary[600]} strokeWidth={2} />
        <Text style={[styles.statusBannerText, { color: colors.primary[700] }]}>
          Cooldown complete. Pull to refresh for updated access.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.statusBanner, {
      backgroundColor: colors.warning[50],
      borderColor: colors.warning[200],
    }]}>
      <Clock size={20} color={colors.warning[600]} strokeWidth={2} />
      <View style={styles.statusBannerContent}>
        <Text style={[styles.statusBannerText, { color: colors.warning[800] }]}>
          Access will be granted after cooldown period
        </Text>
        <Text style={styles.countdownText}>{formatCountdown(remaining)}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared Document Viewer Modal — matches vault viewer layout
// ---------------------------------------------------------------------------

function isImageFile(mimeType: string, fileName: string): boolean {
  return mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff)$/i.test(fileName);
}

function isPdfFile(mimeType: string, fileName: string): boolean {
  return mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

function formatFileSize(sizeStr: string | null | undefined): string {
  if (!sizeStr) return '—';
  const bytes = parseInt(sizeStr, 10);
  if (isNaN(bytes)) return sizeStr;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PREVIEW_HEIGHT = 300;

function SharedDocViewerModal({ visible, doc, previewUrl, loading: urlLoading, onClose }: {
  visible: boolean;
  doc: AccessibleDocument | null;
  previewUrl: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  const [webviewError, setWebviewError] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  // Reset state when modal opens with new content
  useEffect(() => {
    if (visible) {
      setWebviewError(false);
      setFullScreen(false);
    }
  }, [visible]);

  const mime = (doc?.type || '').toLowerCase();
  const fileName = doc?.name || '';
  const isImage = isImageFile(mime, fileName);
  const isPdf = isPdfFile(mime, fileName);
  const categoryLabel = doc?.category
    ? doc.category.charAt(0).toUpperCase() + doc.category.slice(1)
    : 'Other';

  const url = previewUrl || '';
  const getWebViewUri = () => {
    if (isPdf && Platform.OS === 'android') {
      return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // Renders the preview content (used both inline and full-screen)
  const renderPreviewContent = (height?: number) => {
    if (webviewError) {
      return (
        <View style={[viewerStyles.previewErrorWrap, height ? { height } : { flex: 1 }]}>
          <AlertCircle size={24} color={colors.slate[400]} />
          <Text style={viewerStyles.previewErrorText}>Failed to load document</Text>
          <TouchableOpacity
            onPress={() => setWebviewError(false)}
            style={viewerStyles.retryBtn}
            activeOpacity={0.7}
          >
            <Text style={viewerStyles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (isImage) {
      return (
        <Image
          source={{ uri: url }}
          style={height ? { width: '100%', height, borderRadius: borderRadius.md } : viewerStyles.fullScreenImage}
          resizeMode="contain"
          onError={() => setWebviewError(true)}
        />
      );
    }

    if (Platform.OS === 'web') {
      return (
        <View style={height ? { height, borderRadius: borderRadius.md, overflow: 'hidden' } : { flex: 1 }}>
          <iframe
            src={url}
            style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 } as any}
            title={doc?.name || 'Document'}
          />
        </View>
      );
    }

    if (WebView) {
      return (
        <View style={height ? { height, borderRadius: borderRadius.md, overflow: 'hidden' } : { flex: 1 }}>
          <WebView
            source={{ uri: getWebViewUri() }}
            style={{ flex: 1 }}
            scalesPageToFit
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            originWhitelist={['*']}
            scrollEnabled={!height}
            nestedScrollEnabled={!height}
            onError={() => setWebviewError(true)}
            onHttpError={(syntheticEvent: any) => {
              if (syntheticEvent?.nativeEvent?.statusCode >= 400) {
                setWebviewError(true);
              }
            }}
            renderLoading={() => (
              <View style={viewerStyles.loading}>
                <ActivityIndicator size="large" color={colors.primary[600]} />
              </View>
            )}
          />
        </View>
      );
    }

    return (
      <View style={[viewerStyles.previewErrorWrap, height ? { height } : { flex: 1 }]}>
        <FileText size={48} color={colors.slate[300]} />
        <Text style={viewerStyles.previewErrorText}>Preview not available</Text>
      </View>
    );
  };

  // Single modal — visible when doc is set (loading OR ready)
  const isOpen = visible && !!doc;

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <SafeAreaView style={viewerStyles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={viewerStyles.header}>
          <TouchableOpacity
            onPress={onClose}
            style={viewerStyles.backButton}
            activeOpacity={0.7}
          >
            <ArrowLeft size={22} color={colors.slate[700]} />
          </TouchableOpacity>
          <View style={viewerStyles.headerTitleWrap}>
            <Text style={viewerStyles.headerTitle} numberOfLines={1}>{doc?.name || ''}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Gradient accent stripe */}
        <LinearGradient
          colors={[...colors.gradient.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={viewerStyles.accentStripe}
        />

        {/* Loading state — shown while fetching signed URL */}
        {urlLoading && (
          <View style={viewerStyles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={viewerStyles.loadingText}>
              Loading {doc?.name || 'document'}...
            </Text>
          </View>
        )}

        {/* Content — shown once URL is ready */}
        {!urlLoading && !!previewUrl && !!doc && (
          <ScrollView
            style={viewerStyles.scrollView}
            contentContainerStyle={viewerStyles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Inline Document Preview Card */}
            <TouchableOpacity
              onPress={() => setFullScreen(true)}
              activeOpacity={0.9}
            >
              <Card style={viewerStyles.previewCard}>
                <View style={viewerStyles.previewHeader}>
                  <Eye size={16} color={colors.primary[600]} />
                  <Text style={viewerStyles.previewLabel}>Document Preview</Text>
                  <Maximize2 size={16} color={colors.slate[400]} />
                </View>
                {renderPreviewContent(PREVIEW_HEIGHT)}
              </Card>
            </TouchableOpacity>

            {/* Status badges */}
            <View style={viewerStyles.statusRow}>
              <View style={[viewerStyles.categoryBadge, {
                backgroundColor: colors.category?.other?.bg || colors.slate[50],
                borderColor: colors.category?.other?.border || colors.slate[200],
              }]}>
                <Text style={[viewerStyles.categoryBadgeText, {
                  color: colors.category?.other?.text || colors.slate[700],
                }]}>
                  {categoryLabel}
                </Text>
              </View>
              <View style={[viewerStyles.statusBadge, {
                backgroundColor: doc.status === 'expired' ? colors.error[50] : colors.primary[50],
                borderColor: doc.status === 'expired' ? colors.error[200] : colors.primary[200],
              }]}>
                <Text style={[viewerStyles.statusBadgeText, {
                  color: doc.status === 'expired' ? colors.error[700] : colors.primary[700],
                }]}>
                  {doc.status === 'expired' ? 'Expired' : 'Active'}
                </Text>
              </View>
            </View>

            {/* Document Details Card */}
            <Card style={viewerStyles.detailsCard}>
              <Text style={viewerStyles.sectionTitle}>Document Details</Text>

              <View style={viewerStyles.detailRow}>
                <View style={viewerStyles.detailLeft}>
                  <View style={viewerStyles.detailIconWrap}>
                    <FileText size={18} color={colors.primary[600]} />
                  </View>
                  <Text style={viewerStyles.detailLabel}>File Type</Text>
                </View>
                <Text style={viewerStyles.detailValue}>{(doc.type || 'unknown').toUpperCase()}</Text>
              </View>

              <View style={viewerStyles.detailRow}>
                <View style={viewerStyles.detailLeft}>
                  <View style={viewerStyles.detailIconWrap}>
                    <Calendar size={18} color={colors.primary[600]} />
                  </View>
                  <Text style={viewerStyles.detailLabel}>Uploaded</Text>
                </View>
                <Text style={viewerStyles.detailValue}>{formatDate(doc.upload_date)}</Text>
              </View>

              {doc.expiration_date && (
                <View style={viewerStyles.detailRow}>
                  <View style={viewerStyles.detailLeft}>
                    <View style={viewerStyles.detailIconWrap}>
                      <Clock size={18} color={doc.status === 'expired' ? colors.error[600] : colors.primary[600]} />
                    </View>
                    <Text style={viewerStyles.detailLabel}>Expires</Text>
                  </View>
                  <Text style={[viewerStyles.detailValue, doc.status === 'expired' && { color: colors.error[600] }]}>
                    {formatDate(doc.expiration_date)}
                  </Text>
                </View>
              )}

              <View style={[viewerStyles.detailRow, { borderBottomWidth: 0 }]}>
                <View style={viewerStyles.detailLeft}>
                  <View style={viewerStyles.detailIconWrap}>
                    <HardDrive size={18} color={colors.primary[600]} />
                  </View>
                  <Text style={viewerStyles.detailLabel}>File Size</Text>
                </View>
                <Text style={viewerStyles.detailValue}>{formatFileSize(doc.size)}</Text>
              </View>
            </Card>

            <View style={{ height: spacing['2xl'] }} />
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Full-screen viewer modal */}
      {fullScreen && !!previewUrl && (
        <Modal
          visible
          animationType="slide"
          presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
          onRequestClose={() => setFullScreen(false)}
        >
          <SafeAreaView style={viewerStyles.fullScreenSafe} edges={['top', 'bottom']}>
            <TouchableOpacity
              onPress={() => setFullScreen(false)}
              style={viewerStyles.fullScreenFloatingClose}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={20} color={colors.white} strokeWidth={2.5} />
            </TouchableOpacity>

            {isImage ? (
              <ScrollView
                style={{ flex: 1, backgroundColor: colors.slate[900] }}
                contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}
                maximumZoomScale={5}
                minimumZoomScale={1}
                bouncesZoom
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              >
                <Image
                  source={{ uri: url }}
                  style={viewerStyles.fullScreenImage}
                  resizeMode="contain"
                />
              </ScrollView>
            ) : (
              renderPreviewContent()
            )}
          </SafeAreaView>
        </Modal>
      )}
    </Modal>
  );
}

const viewerStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    textAlign: 'center',
  },
  accentStripe: {
    height: 3,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.slate[50],
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },

  /* Inline Preview */
  previewCard: {
    overflow: 'hidden',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
    marginBottom: spacing.sm,
  },
  previewLabel: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[700],
  },
  previewErrorWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  previewErrorText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  retryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[50],
  },
  retryBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[700],
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.slate[50],
  },
  loadingText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
  },

  /* Status badges */
  statusRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  categoryBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },

  /* Details Card */
  detailsCard: {},
  sectionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  detailIconWrap: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    fontWeight: typography.fontWeight.medium,
  },
  detailValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
    maxWidth: '50%',
    textAlign: 'right',
  },

  /* Full-screen */
  fullScreenSafe: {
    flex: 1,
    backgroundColor: colors.white,
  },
  fullScreenFloatingClose: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    zIndex: 100,
    elevation: 100,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fullScreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
});

// ---------------------------------------------------------------------------
// DocumentList
// ---------------------------------------------------------------------------

function DocumentList({ grantId, documents, onViewDocument }: {
  grantId: string;
  documents: AccessibleDocument[];
  onViewDocument: (grantId: string, doc: AccessibleDocument) => Promise<void>;
}) {
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);

  const handleView = async (doc: AccessibleDocument) => {
    setLoadingDocId(doc.id);
    try {
      await onViewDocument(grantId, doc);
    } finally {
      setLoadingDocId(null);
    }
  };

  if (documents.length === 0) {
    return (
      <View style={styles.docEmptyContainer}>
        <FileText size={32} color={colors.slate[300]} strokeWidth={1.5} />
        <Text style={styles.docEmptyText}>No documents available for this event yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.docList}>
      {documents.map((doc, index) => (
        <View
          key={doc.id}
          style={[
            styles.docItem,
            index < documents.length - 1 && styles.docItemBorder,
          ]}
        >
          <View style={styles.docIconBox}>
            <FileText size={18} color={colors.primary[600]} strokeWidth={2} />
          </View>
          <View style={styles.docInfo}>
            <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
            <View style={styles.docMetaRow}>
              <Text style={styles.docCategory}>{doc.category}</Text>
              <Text style={styles.docMetaSep}>|</Text>
              <Text style={styles.docMeta}>{doc.size}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.viewButton,
              loadingDocId === doc.id && styles.viewButtonDisabled,
            ]}
            onPress={() => handleView(doc)}
            disabled={loadingDocId === doc.id}
            activeOpacity={0.7}
          >
            {loadingDocId === doc.id ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Eye size={14} color={colors.white} strokeWidth={2.5} />
                <Text style={styles.viewButtonText}>View</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// EventDetailPanel (expanded content)
// ---------------------------------------------------------------------------

function EventDetailPanel({ event, onRefreshParent, onViewDocument }: {
  event: SharedEventSummary;
  onRefreshParent: () => void;
  onViewDocument: (grantId: string, doc: AccessibleDocument) => Promise<void>;
}) {
  const [documents, setDocuments] = useState<AccessibleDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const fetchedRef = useRef(false);

  const hasAccess = event.request_status === 'approved' || event.request_status === 'auto_granted';
  const isDenied = event.request_status === 'denied' || event.request_status === 'vetoed';
  const isPending = event.request_status === 'pending';
  const isNone = event.request_status === 'none';

  // Fetch documents when access is granted
  useEffect(() => {
    if (!hasAccess || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    getSharedEventDetail(event.grant_id)
      .then((detail) => setDocuments(detail.documents))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [hasAccess, event.grant_id]);

  const handleRequestAccess = async () => {
    setRequesting(true);
    setError(null);
    try {
      await requestAccess(event.grant_id);
      onRefreshParent();
    } catch (err: any) {
      setError(err.message || 'Failed to request access');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <View style={styles.detailPanel}>
      {/* Error banner */}
      {error && (
        <View style={[styles.statusBanner, {
          backgroundColor: colors.error[50],
          borderColor: colors.error[200],
          marginBottom: spacing.md,
        }]}>
          <AlertTriangle size={18} color={colors.error[600]} strokeWidth={2} />
          <Text style={[styles.statusBannerText, { color: colors.error[700], flex: 1 }]}>
            {error}
          </Text>
        </View>
      )}

      {/* Status: none - show policy description + request button */}
      {isNone && (
        <View style={styles.detailSection}>
          {event.access_policy === 'immediate' && (
            <Text style={styles.policyDescription}>
              This event uses <Text style={styles.policyDescBold}>immediate access</Text>.
              Your request will be granted automatically.
            </Text>
          )}
          {event.access_policy === 'time_delayed' && (
            <Text style={styles.policyDescription}>
              This event uses a <Text style={styles.policyDescBold}>time-delayed policy</Text>.
              After requesting, there will be a{' '}
              <Text style={styles.policyDescBold}>{event.delay_hours}-hour</Text> cooldown
              before access is granted. The owner can veto during this period.
            </Text>
          )}
          {event.access_policy === 'approval' && (
            <Text style={styles.policyDescription}>
              This event requires <Text style={styles.policyDescBold}>owner approval</Text>.
              The owner will be notified and must approve your request before you can view documents.
            </Text>
          )}
          <TouchableOpacity
            style={[styles.requestButton, requesting && styles.requestButtonDisabled]}
            onPress={handleRequestAccess}
            disabled={requesting}
            activeOpacity={0.7}
          >
            {requesting ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Shield size={16} color={colors.white} strokeWidth={2.5} />
            )}
            <Text style={styles.requestButtonText}>Request Access</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pending: time_delayed with cooldown */}
      {isPending && event.access_policy === 'time_delayed' && event.cooldown_ends_at && (
        <CooldownCountdown
          cooldownEndsAt={event.cooldown_ends_at}
          onComplete={onRefreshParent}
        />
      )}

      {/* Pending: approval-based */}
      {isPending && event.access_policy === 'approval' && (
        <View style={[styles.statusBanner, {
          backgroundColor: colors.info[50],
          borderColor: colors.info[200],
        }]}>
          <Clock size={20} color={colors.info[600]} strokeWidth={2} />
          <View style={styles.statusBannerContent}>
            <Text style={[styles.statusBannerText, { color: colors.info[800] }]}>
              Waiting for owner approval
            </Text>
            <Text style={[styles.statusBannerSubtext, { color: colors.info[600] }]}>
              {event.owner_name} will be notified and can approve or deny your request.
            </Text>
          </View>
        </View>
      )}

      {/* Pending: immediate (should resolve quickly) */}
      {isPending && event.access_policy === 'immediate' && (
        <View style={[styles.statusBanner, {
          backgroundColor: colors.primary[50],
          borderColor: colors.primary[200],
        }]}>
          <ActivityIndicator size="small" color={colors.primary[600]} />
          <Text style={[styles.statusBannerText, { color: colors.primary[700] }]}>
            Processing your access request...
          </Text>
        </View>
      )}

      {/* Denied / vetoed */}
      {isDenied && (
        <View style={[styles.statusBanner, {
          backgroundColor: colors.error[50],
          borderColor: colors.error[200],
        }]}>
          <AlertTriangle size={20} color={colors.error[600]} strokeWidth={2} />
          <View style={styles.statusBannerContent}>
            <Text style={[styles.statusBannerText, { color: colors.error[800] }]}>
              Access denied
            </Text>
            <Text style={[styles.statusBannerSubtext, { color: colors.error[600] }]}>
              {event.request_status === 'vetoed'
                ? 'The owner vetoed your access request during the cooldown period.'
                : 'The owner has denied your access request.'}
            </Text>
          </View>
        </View>
      )}

      {/* Access granted: show documents */}
      {hasAccess && (
        <View>
          <View style={styles.grantedHeader}>
            <CheckCircle size={16} color={colors.primary[600]} strokeWidth={2.5} />
            <Text style={styles.grantedText}>
              Access granted
              {event.access_granted_at && (
                <Text style={styles.grantedDate}>
                  {' '}on {formatDate(event.access_granted_at)}
                </Text>
              )}
            </Text>
          </View>
          {loading ? (
            <View style={styles.docLoadingContainer}>
              <ActivityIndicator size="large" color={colors.primary[600]} />
            </View>
          ) : (
            <DocumentList grantId={event.grant_id} documents={documents} onViewDocument={onViewDocument} />
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// EventCard
// ---------------------------------------------------------------------------

function EventCard({ event, onRefreshParent, onViewDocument }: {
  event: SharedEventSummary;
  onRefreshParent: () => void;
  onViewDocument: (grantId: string, doc: AccessibleDocument) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasAccess = event.request_status === 'approved' || event.request_status === 'auto_granted';

  return (
    <View style={styles.card}>
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        style={styles.cardHeader}
        activeOpacity={0.7}
      >
        {/* Event icon */}
        <View style={[styles.eventIconBox, {
          backgroundColor: hasAccess ? colors.primary[50] : colors.slate[50],
        }]}>
          <FileText
            size={20}
            color={hasAccess ? colors.primary[600] : colors.slate[400]}
            strokeWidth={2}
          />
        </View>

        {/* Event info */}
        <View style={styles.cardInfoCol}>
          <Text style={styles.eventTitle} numberOfLines={1}>{event.event_title}</Text>
          <Text style={styles.eventSubtitle} numberOfLines={1}>
            Shared by {event.owner_name}
            {event.document_count > 0 && (
              <Text style={styles.eventDocCount}>
                {'  '}{event.document_count} doc{event.document_count !== 1 ? 's' : ''}
              </Text>
            )}
          </Text>
        </View>

        {/* Chevron */}
        {expanded ? (
          <ChevronDown size={18} color={colors.slate[400]} strokeWidth={2} />
        ) : (
          <ChevronRight size={18} color={colors.slate[400]} strokeWidth={2} />
        )}
      </TouchableOpacity>

      {/* Badge row (below header for mobile) */}
      <View style={styles.badgeRow}>
        <PolicyBadge policy={event.access_policy} />
        <StatusBadge status={event.request_status} />
      </View>

      {/* Expanded detail */}
      {expanded && (
        <EventDetailPanel event={event} onRefreshParent={onRefreshParent} onViewDocument={onViewDocument} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// SkeletonCard
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.skeletonCircle, { width: 44, height: 44 }]} />
        <View style={styles.cardInfoCol}>
          <View style={[styles.skeletonLine, { width: '70%', height: 14 }]} />
          <View style={[styles.skeletonLine, { width: '40%', height: 12, marginTop: 6 }]} />
        </View>
      </View>
      <View style={styles.badgeRow}>
        <View style={[styles.skeletonLine, { width: 80, height: 24, borderRadius: borderRadius.full }]} />
        <View style={[styles.skeletonLine, { width: 90, height: 24, borderRadius: borderRadius.full }]} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Embeddable section (for use inside Life Events tab)
// ---------------------------------------------------------------------------

export function SharedWithMeSection() {
  const [events, setEvents] = useState<SharedEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared doc viewer state
  const [viewerDoc, setViewerDoc] = useState<AccessibleDocument | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  const fetchEvents = useCallback(async (isRefresh = false) => {
    try {
      setError(null);
      if (isRefresh) setRefreshing(true);
      const data = await getSharedWithMe();
      setEvents(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load shared events');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleRefresh = useCallback(() => {
    fetchEvents(true);
  }, [fetchEvents]);

  const handleViewDocument = async (grantId: string, doc: AccessibleDocument) => {
    try {
      setViewerLoading(true);
      setViewerDoc(doc);
      const { url } = await getSharedDocPreview(grantId, doc.id);
      if (!url) throw new Error('No preview URL returned');
      setViewerUrl(url);
    } catch (err: any) {
      console.error('Failed to load document:', err.message);
      Alert.alert('Unable to load document', err.message || 'Failed to load document. Please try again.');
      setViewerDoc(null);
      setViewerUrl(null);
    } finally {
      setViewerLoading(false);
    }
  };

  const closeViewer = () => {
    setViewerDoc(null);
    setViewerUrl(null);
  };

  // Group events by owner name
  const groupedByOwner = events.reduce<Record<string, SharedEventSummary[]>>((acc, event) => {
    const key = event.owner_name || event.owner_email;
    if (!acc[key]) acc[key] = [];
    acc[key].push(event);
    return acc;
  }, {});

  const ownerNames = Object.keys(groupedByOwner).sort();

  return (
    <>
      {/* Single viewer modal — opens immediately on View click, shows loading inside */}
      <SharedDocViewerModal
        visible={!!viewerDoc}
        doc={viewerDoc}
        previewUrl={viewerUrl}
        loading={viewerLoading}
        onClose={closeViewer}
      />

    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary[600]}
          colors={[colors.primary[600]]}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIconBox}>
          <Users size={22} color={colors.primary[700]} strokeWidth={2} />
        </View>
        <View style={styles.headerTextCol}>
          <Text style={styles.pageTitle}>Shared With Me</Text>
          <Text style={styles.pageSubtitle}>
            Life event documents shared with you via Emergency Access
          </Text>
        </View>
      </View>

      {/* Error state */}
      {error && !loading && (
        <View style={styles.errorBanner}>
          <AlertTriangle size={20} color={colors.error[600]} strokeWidth={2} />
          <Text style={styles.errorBannerText}>{error}</Text>
          <TouchableOpacity
            onPress={() => { setLoading(true); fetchEvents(); }}
            activeOpacity={0.7}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Loading state */}
      {loading && (
        <View style={styles.skeletonContainer}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      )}

      {/* Empty state */}
      {!loading && !error && events.length === 0 && (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconBox}>
            <Shield size={32} color={colors.slate[300]} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>No shared documents yet</Text>
          <Text style={styles.emptyText}>
            When someone adds you as a trusted contact and shares a life event with you,
            it will appear here. You'll be able to request access to their important documents
            when the time comes.
          </Text>
        </View>
      )}

      {/* Event list grouped by owner */}
      {!loading && !error && ownerNames.length > 0 && (
        <View style={styles.ownerGroupContainer}>
          {ownerNames.map((ownerName) => (
            <View key={ownerName} style={styles.ownerGroup}>
              {/* Owner header */}
              <View style={styles.ownerHeader}>
                <View style={styles.ownerAvatar}>
                  <Users size={14} color={colors.teal[700]} strokeWidth={2.5} />
                </View>
                <Text style={styles.ownerName}>{ownerName}</Text>
                <Text style={styles.ownerEventCount}>
                  {groupedByOwner[ownerName].length} event
                  {groupedByOwner[ownerName].length !== 1 ? 's' : ''}
                </Text>
              </View>

              {/* Event cards */}
              <View style={styles.eventCardList}>
                {groupedByOwner[ownerName].map((event) => (
                  <EventCard
                    key={event.grant_id}
                    event={event}
                    onRefreshParent={() => fetchEvents(false)}
                    onViewDocument={handleViewDocument}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
    </>
  );
}

// ---------------------------------------------------------------------------
// Standalone screen (kept for direct navigation from settings)
// ---------------------------------------------------------------------------

export default function SharedWithMeScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Shared With Me',
          headerShown: true,
        }}
      />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <SharedWithMeSection />
      </SafeAreaView>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.slate[50],
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  headerIconBox: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
  },
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

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[200],
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  errorBannerText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.error[800],
  },
  retryText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.error[700],
    textDecorationLine: 'underline',
  },

  // Loading skeletons
  skeletonContainer: {
    gap: spacing.md,
  },
  skeletonCircle: {
    borderRadius: borderRadius.lg,
    backgroundColor: colors.slate[100],
  },
  skeletonLine: {
    backgroundColor: colors.slate[100],
    borderRadius: borderRadius.sm,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing['5xl'],
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate[200],
    borderRadius: borderRadius['2xl'],
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },

  // Owner groups
  ownerGroupContainer: {
    gap: spacing['2xl'],
  },
  ownerGroup: {
    gap: spacing.md,
  },
  ownerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ownerAvatar: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.teal[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
  },
  ownerEventCount: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
  },
  eventCardList: {
    gap: spacing.md,
  },

  // Card
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate[200],
    borderRadius: borderRadius['2xl'],
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  eventIconBox: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfoCol: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  eventSubtitle: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    marginTop: 2,
  },
  eventDocCount: {
    color: colors.slate[400],
  },

  // Badge row
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },

  // Detail panel
  detailPanel: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
  },
  detailSection: {
    gap: spacing.md,
  },
  policyDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    lineHeight: 22,
  },
  policyDescBold: {
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
  },

  // Request button
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignSelf: 'flex-start',
  },
  requestButtonDisabled: {
    backgroundColor: colors.primary[400],
  },
  requestButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },

  // Status banners (cooldown, approval, denied, etc.)
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  statusBannerContent: {
    flex: 1,
  },
  statusBannerText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  statusBannerSubtext: {
    fontSize: typography.fontSize.xs,
    marginTop: 4,
    lineHeight: 18,
  },
  countdownText: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.warning[700],
    fontVariant: ['tabular-nums'],
    marginTop: spacing.xs,
  },

  // Granted header
  grantedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  grantedText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[700],
  },
  grantedDate: {
    fontWeight: typography.fontWeight.normal,
    color: colors.slate[500],
  },

  // Document list
  docLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
  },
  docEmptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  docEmptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
  },
  docList: {
    borderWidth: 1,
    borderColor: colors.slate[200],
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
  },
  docItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
  },
  docIconBox: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo: {
    flex: 1,
    minWidth: 0,
  },
  docName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
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
    color: colors.slate[500],
    textTransform: 'capitalize',
  },
  docMetaSep: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[300],
  },
  docMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  viewButtonDisabled: {
    backgroundColor: colors.primary[400],
  },
  viewButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.white,
  },
});
