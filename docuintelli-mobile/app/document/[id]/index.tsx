import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  Image,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useToast } from '../../../src/contexts/ToastContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { goBack } from '../../../src/utils/navigation';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  FileText,
  Calendar,
  Tag,
  HardDrive,
  Trash2,
  MessageSquare,
  Clock,
  CheckCircle,
  AlertTriangle,
  Eye,
  X,
  AlertCircle,
  Maximize2,
} from 'lucide-react-native';
import { supabase, deleteDocument } from '../../../src/lib/supabase';
import type { SupabaseDocument } from '../../../src/lib/supabase';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../src/lib/config';
import Card from '../../../src/components/ui/Card';
import Button from '../../../src/components/ui/Button';
import Badge from '../../../src/components/ui/Badge';
import GradientIcon from '../../../src/components/ui/GradientIcon';
import LoadingSpinner from '../../../src/components/ui/LoadingSpinner';
import DocumentHealthPanel from '../../../src/components/documents/DocumentHealthPanel';
import { colors } from '../../../src/theme/colors';
import { typography } from '../../../src/theme/typography';
import { spacing, borderRadius } from '../../../src/theme/spacing';

// Only import WebView on native platforms
let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

type CategoryKey = keyof typeof colors.category;

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'error'; Icon: typeof CheckCircle }> = {
  active: { label: 'Active', variant: 'success', Icon: CheckCircle },
  expiring: { label: 'Expiring Soon', variant: 'warning', Icon: AlertTriangle },
  expired: { label: 'Expired', variant: 'error', Icon: Clock },
};

function formatFileSize(sizeStr: string | null | undefined): string {
  if (!sizeStr) return '—';
  const bytes = parseInt(sizeStr, 10);
  if (isNaN(bytes)) return sizeStr;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getCategoryBadgeVariant(
  category: string | null | undefined
): { bg: string; text: string; border: string } {
  if (!category) return colors.category.other;
  const key = category.toLowerCase() as CategoryKey;
  return colors.category[key] || colors.category.other;
}

// ---- File type helpers ----
function isPdfFile(mimeType: string, fileName: string): boolean {
  return mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

function isImageFile(mimeType: string, fileName: string): boolean {
  return (
    mimeType.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff)$/i.test(fileName)
  );
}

function isWordFile(mimeType: string, fileName: string): boolean {
  return (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    /\.(doc|docx)$/i.test(fileName)
  );
}

function isTextFile(mimeType: string, fileName: string): boolean {
  return mimeType === 'text/plain' || fileName.toLowerCase().endsWith('.txt');
}

function isViewableFile(mimeType: string, fileName: string): boolean {
  return (
    isPdfFile(mimeType, fileName) ||
    isImageFile(mimeType, fileName) ||
    isWordFile(mimeType, fileName) ||
    isTextFile(mimeType, fileName)
  );
}

const PREVIEW_HEIGHT = 300;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function DocumentViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showToast } = useToast();
  const [doc, setDoc] = useState<SupabaseDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Inline preview state — auto-loads when document loads
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'pdf' | 'image' | 'html' | 'text' | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [fullScreen, setFullScreen] = useState(false);

  // Load document metadata
  useEffect(() => {
    if (!id) {
      setLoadError('No document ID provided');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        setDoc(data);
      } catch (err) {
        console.error('Error loading document:', err);
        setLoadError(err instanceof Error ? err.message : 'Failed to load document');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Auto-load document preview once doc is fetched
  const loadPreview = useCallback(async (document: SupabaseDocument) => {
    if (!document.file_path) return;
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const mimeType = (document.type || '').toLowerCase();
      const fileName = document.original_name || document.name || '';

      // Word documents → convert to HTML via Edge Function
      if (isWordFile(mimeType, fileName)) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const resp = await fetch(`${SUPABASE_URL}/functions/v1/convert-to-pdf`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ filePath: document.file_path }),
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to convert document');
        }

        const htmlContent = await resp.text();
        if (Platform.OS === 'web') {
          const blob = new Blob([htmlContent], { type: 'text/html' });
          setPreviewUrl(URL.createObjectURL(blob));
        } else {
          const base64 = btoa(unescape(encodeURIComponent(htmlContent)));
          setPreviewUrl(`data:text/html;base64,${base64}`);
        }
        setPreviewType('html');
        return;
      }

      // All other viewable files → signed URL
      const { data: signedUrlData, error: signedUrlError } = await supabase
        .storage
        .from('documents')
        .createSignedUrl(document.file_path, 3600);

      if (signedUrlError || !signedUrlData) {
        throw new Error('Failed to load document preview');
      }

      const url = signedUrlData.signedUrl;
      setPreviewUrl(url);

      if (isImageFile(mimeType, fileName)) {
        setPreviewType('image');
      } else if (isPdfFile(mimeType, fileName)) {
        setPreviewType('pdf');
      } else if (isTextFile(mimeType, fileName)) {
        setPreviewType('text');
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (doc) {
      const mimeType = (doc.type || '').toLowerCase();
      const fileName = doc.original_name || doc.name || '';
      if (isViewableFile(mimeType, fileName)) {
        loadPreview(doc);
      }
    }
  }, [doc, loadPreview]);

  const handleDelete = () => {
    const doDelete = async () => {
      setDeleting(true);
      try {
        await deleteDocument(id!);
        showToast('Document deleted', 'success');
        goBack('/(tabs)/vault');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Delete failed';
        showToast(msg, 'error');
      } finally {
        setDeleting(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${doc?.name}"? This cannot be undone.`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete Document',
        `Are you sure you want to delete "${doc?.name}"? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (Platform.OS === 'web' && previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  if (loading) return <LoadingSpinner fullScreen />;

  if (!doc) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.notFoundContainer}>
          <GradientIcon size={56}>
            <FileText size={28} color={colors.white} />
          </GradientIcon>
          <Text style={styles.notFoundTitle}>Document Not Found</Text>
          <Text style={styles.notFoundSub}>
            {loadError || 'This document may have been deleted or is no longer available.'}
          </Text>
          <Button
            title="Go Back"
            onPress={() => goBack('/(tabs)/vault')}
            variant="outline"
            icon={<ArrowLeft size={18} color={colors.slate[700]} />}
          />
        </View>
      </SafeAreaView>
    );
  }

  const statusKey = doc.status || 'active';
  const statusInfo = STATUS_CONFIG[statusKey] || STATUS_CONFIG.active;
  const StatusIcon = statusInfo.Icon;
  const categoryColors = getCategoryBadgeVariant(doc.category);
  const categoryLabel = doc.category
    ? doc.category.charAt(0).toUpperCase() + doc.category.slice(1)
    : 'Other';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBack('/(tabs)/vault')}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={colors.slate[700]} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {doc.name}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Gradient accent stripe */}
      <LinearGradient
        colors={[...colors.gradient.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.accentStripe}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ====== INLINE DOCUMENT PREVIEW ====== */}
        {previewLoading && (
          <Card style={styles.previewCard}>
            <View style={styles.previewLoadingWrap}>
              <ActivityIndicator size="large" color={colors.primary[600]} />
              <Text style={styles.previewLoadingText}>Loading preview...</Text>
            </View>
          </Card>
        )}

        {previewError && (
          <Card style={styles.previewCard}>
            <View style={styles.previewErrorWrap}>
              <AlertCircle size={24} color={colors.slate[400]} />
              <Text style={styles.previewErrorText}>{previewError}</Text>
              <TouchableOpacity
                onPress={() => doc && loadPreview(doc)}
                style={styles.retryBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {/* Image preview */}
        {previewUrl && previewType === 'image' && (
          <TouchableOpacity
            onPress={() => setFullScreen(true)}
            activeOpacity={0.9}
            style={styles.previewTouchable}
          >
            <Card style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <Eye size={16} color={colors.primary[600]} />
                <Text style={styles.previewLabel}>Document Preview</Text>
                <Maximize2 size={16} color={colors.slate[400]} />
              </View>
              <Image
                source={{ uri: previewUrl }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            </Card>
          </TouchableOpacity>
        )}

        {/* PDF / HTML / Text preview — WebView on native, iframe on web */}
        {previewUrl && previewType && previewType !== 'image' && (
          <TouchableOpacity
            onPress={() => setFullScreen(true)}
            activeOpacity={0.9}
            style={styles.previewTouchable}
          >
            <Card style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <Eye size={16} color={colors.primary[600]} />
                <Text style={styles.previewLabel}>Document Preview</Text>
                <Maximize2 size={16} color={colors.slate[400]} />
              </View>
              <View style={styles.previewWebViewWrap}>
                {Platform.OS === 'web' ? (
                  <iframe
                    src={previewUrl}
                    style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 } as any}
                    title="Document preview"
                  />
                ) : WebView ? (
                  <WebView
                    source={
                      previewUrl.startsWith('data:')
                        ? { html: atob(previewUrl.replace('data:text/html;base64,', '')), baseUrl: '' }
                        : {
                            uri:
                              previewType === 'pdf' && Platform.OS === 'android'
                                ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(previewUrl)}`
                                : previewUrl,
                          }
                    }
                    style={styles.previewWebView}
                    scalesPageToFit
                    javaScriptEnabled
                    domStorageEnabled
                    scrollEnabled={false}
                    nestedScrollEnabled={false}
                  />
                ) : null}
              </View>
            </Card>
          </TouchableOpacity>
        )}

        {/* Not viewable banner */}
        {!previewLoading && !previewUrl && !previewError && (
          <View style={styles.unsupportedBanner}>
            <AlertCircle size={18} color={colors.slate[500]} />
            <Text style={styles.unsupportedText}>
              Preview not available for this file type
            </Text>
          </View>
        )}

        {/* Status Bar */}
        <View style={styles.statusRow}>
          <View
            style={[
              styles.categoryBadge,
              {
                backgroundColor: categoryColors.bg,
                borderColor: categoryColors.border,
              },
            ]}
          >
            <Text style={[styles.categoryBadgeText, { color: categoryColors.text }]}>
              {categoryLabel}
            </Text>
          </View>

          <Badge label={statusInfo.label} variant={statusInfo.variant} />

          {doc.processed && <Badge label="Processed" variant="info" />}
        </View>

        {/* Details Card */}
        <Card style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Document Details</Text>

          <DetailRow
            icon={<FileText size={18} color={colors.primary[600]} />}
            label="File Type"
            value={(doc.type || 'unknown').toUpperCase()}
          />

          <DetailRow
            icon={<Calendar size={18} color={colors.primary[600]} />}
            label="Uploaded"
            value={formatDate(doc.upload_date)}
          />

          {doc.expiration_date && (
            <DetailRow
              icon={
                <StatusIcon
                  size={18}
                  color={
                    doc.status === 'expired'
                      ? colors.error[600]
                      : doc.status === 'expiring'
                      ? colors.warning[600]
                      : colors.primary[600]
                  }
                />
              }
              label="Expires"
              value={formatDate(doc.expiration_date)}
              valueColor={
                doc.status === 'expired'
                  ? colors.error[600]
                  : doc.status === 'expiring'
                  ? colors.warning[600]
                  : undefined
              }
            />
          )}

          <DetailRow
            icon={<HardDrive size={18} color={colors.primary[600]} />}
            label="File Size"
            value={formatFileSize(doc.size)}
          />
        </Card>

        {/* Tags Card */}
        {doc.tags && doc.tags.length > 0 && (
          <Card style={styles.tagsCard}>
            <View style={styles.tagsSectionHeader}>
              <Tag size={18} color={colors.primary[600]} />
              <Text style={styles.sectionTitle}>Tags</Text>
            </View>
            <View style={styles.tagsContainer}>
              {doc.tags.map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <LinearGradient
                    colors={[...colors.gradient.primaryLight]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.tagChipGradient}
                  >
                    <Text style={styles.tagChipText}>{tag}</Text>
                  </LinearGradient>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Document Health Panel */}
        <DocumentHealthPanel documentId={id!} category={doc.category} />

        {/* Spacer for bottom actions */}
        <View style={{ height: spacing['4xl'] }} />
      </ScrollView>

      {/* Bottom Action Buttons */}
      <View style={styles.bottomActions}>
        <View style={styles.bottomActionsInner}>
          <Button
            title="Chat with Document"
            onPress={() =>
              router.push({
                pathname: '/document/[id]/chat',
                params: { id: doc.id },
              })
            }
            size="lg"
            icon={<MessageSquare size={20} color={colors.white} />}
            fullWidth
          />
          <Button
            title="Delete Document"
            onPress={handleDelete}
            variant="danger"
            size="lg"
            loading={deleting}
            icon={!deleting ? <Trash2 size={20} color={colors.white} /> : undefined}
            fullWidth
          />
        </View>
      </View>

      {/* Full-screen viewer modal */}
      {fullScreen && previewUrl && (
        <Modal
          visible
          animationType="slide"
          presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
          onRequestClose={() => setFullScreen(false)}
        >
          <SafeAreaView style={styles.fullScreenSafe} edges={['top', 'bottom']}>
            {/* Floating close button — sits above the WebView on all platforms */}
            <TouchableOpacity
              onPress={() => setFullScreen(false)}
              style={styles.fullScreenFloatingClose}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={20} color={colors.white} strokeWidth={2.5} />
            </TouchableOpacity>

            {/* Content */}
            {previewType === 'image' ? (
              <ScrollView
                style={styles.fullScreenImageScroll}
                contentContainerStyle={styles.fullScreenImageContent}
                maximumZoomScale={5}
                minimumZoomScale={1}
                bouncesZoom
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              >
                <Image
                  source={{ uri: previewUrl }}
                  style={styles.fullScreenImage}
                  resizeMode="contain"
                />
              </ScrollView>
            ) : Platform.OS === 'web' ? (
              <View style={styles.fullScreenWebViewWrap}>
                <iframe
                  src={previewUrl}
                  style={{ width: '100%', height: '100%', border: 'none' } as any}
                  title={doc.name}
                />
              </View>
            ) : WebView ? (
              <WebView
                source={
                  previewUrl.startsWith('data:')
                    ? { html: atob(previewUrl.replace('data:text/html;base64,', '')), baseUrl: '' }
                    : {
                        uri:
                          previewType === 'pdf' && Platform.OS === 'android'
                            ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(previewUrl)}`
                            : previewUrl,
                      }
                }
                style={styles.fullScreenWebViewWrap}
                scalesPageToFit
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback
                startInLoadingState
                renderLoading={() => (
                  <View style={styles.fullScreenLoading}>
                    <ActivityIndicator size="large" color={colors.primary[600]} />
                  </View>
                )}
              />
            ) : null}
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

/* ---- Detail Row Subcomponent ---- */
interface DetailRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}

function DetailRow({ icon, label, value, valueColor }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailLeft}>
        <View style={styles.detailIconWrap}>{icon}</View>
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text
        style={[styles.detailValue, valueColor ? { color: valueColor } : undefined]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/* ---- Styles ---- */
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },

  /* Header */
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
  headerSpacer: {
    width: 40,
  },

  /* Accent Stripe */
  accentStripe: {
    height: 3,
  },

  /* Scroll */
  scrollView: {
    flex: 1,
    backgroundColor: colors.slate[50],
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },

  /* Status Row */
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

  /* Title Card */
  titleCard: {
    // no extra style needed, Card handles padding
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titleTextWrap: {
    flex: 1,
  },
  docName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    lineHeight: 26,
  },
  docOriginal: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[400],
    marginTop: 2,
  },

  /* Details Card */
  detailsCard: {
    // Card handles padding
  },
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

  /* Tags */
  tagsCard: {
    // Card handles padding
  },
  tagsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagChip: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  tagChipGradient: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  tagChipText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[700],
  },

  /* Bottom Actions */
  bottomActions: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xl,
  },
  bottomActionsInner: {
    gap: spacing.md,
  },

  /* Not Found */
  notFoundContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing['3xl'],
    gap: spacing.lg,
    backgroundColor: colors.slate[50],
  },
  notFoundTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    textAlign: 'center',
  },
  notFoundSub: {
    fontSize: typography.fontSize.base,
    color: colors.slate[500],
    textAlign: 'center',
    lineHeight: 22,
  },

  /* Unsupported file banner */
  unsupportedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.slate[100],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  unsupportedText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    flex: 1,
  },

  /* Inline Preview */
  previewCard: {
    overflow: 'hidden',
  },
  previewTouchable: {
    // wrapper for the touchable — no extra styling needed
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
  previewLoadingWrap: {
    height: PREVIEW_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  previewLoadingText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[400],
  },
  previewErrorWrap: {
    height: PREVIEW_HEIGHT,
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
  previewImage: {
    width: '100%',
    height: PREVIEW_HEIGHT,
    borderRadius: borderRadius.md,
  },
  previewWebViewWrap: {
    height: PREVIEW_HEIGHT,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  previewWebView: {
    flex: 1,
  },

  /* Full-Screen Viewer Modal */
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
  fullScreenImageScroll: {
    flex: 1,
    backgroundColor: colors.slate[900],
  },
  fullScreenImageContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  fullScreenWebViewWrap: {
    flex: 1,
  },
  fullScreenLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
