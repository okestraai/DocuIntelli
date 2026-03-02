import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, Alert,
  TouchableOpacity, Image,
} from 'react-native';
import { useToast } from '../src/contexts/ToastContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { goBack } from '../src/utils/navigation';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import {
  Upload, FileText, Link, Camera, X, Calendar,
  AlertTriangle, CheckCircle, Plus, Trash2, Image as ImageIcon,
  Lock, Zap,
} from 'lucide-react-native';
import { useAuth } from '../src/hooks/useAuth';
import { useDocuments } from '../src/hooks/useDocuments';
import { useSubscription } from '../src/hooks/useSubscription';
import Button from '../src/components/ui/Button';
import Card from '../src/components/ui/Card';
import GradientIcon from '../src/components/ui/GradientIcon';
import LoadingSpinner from '../src/components/ui/LoadingSpinner';
import Badge from '../src/components/ui/Badge';
import ScanPreview from '../src/components/scanner/ScanPreview';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { spacing, borderRadius } from '../src/theme/spacing';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '../src/types/document';

type UploadTab = 'file' | 'scan' | 'url';

const CATEGORY_ICONS: Record<DocumentCategory, { emoji: string }> = {
  warranty: { emoji: '\u{1F6E1}' },
  insurance: { emoji: '\u{1F4CB}' },
  lease: { emoji: '\u{1F3E0}' },
  employment: { emoji: '\u{1F4BC}' },
  contract: { emoji: '\u{1F4DD}' },
  other: { emoji: '\u{1F4C1}' },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadScreen() {
  const { isAuthenticated } = useAuth();
  const { uploadDocuments } = useDocuments(isAuthenticated);
  const { subscription, loading: subLoading, canUploadDocument, incrementMonthlyUploads, documentCount, isStarterOrAbove } = useSubscription();
  const { showToast } = useToast();
  const [tab, setTab] = useState<UploadTab>('file');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('other');
  const [expirationDate, setExpirationDate] = useState('');
  const [loading, setLoading] = useState(false);

  // File-specific
  const [fileUri, setFileUri] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [mimeType, setMimeType] = useState('');

  // Scan-specific
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [scannedPages, setScannedPages] = useState<string[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [convertingPdf, setConvertingPdf] = useState(false);
  const [scanPdfUri, setScanPdfUri] = useState('');

  // URL-specific
  const [url, setUrl] = useState('');

  const isFree = subscription?.plan === 'free';

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'image/*',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setFileUri(asset.uri);
        setFileName(asset.name);
        setFileSize(asset.size || 0);
        setMimeType(asset.mimeType || 'application/octet-stream');
        if (!name) setName(asset.name.replace(/\.[^/.]+$/, ''));
      }
    } catch {
      showToast('Failed to pick file', 'error');
    }
  };

  const handleRemoveFile = () => {
    setFileUri('');
    setFileName('');
    setFileSize(0);
    setMimeType('');
  };

  // ---- Scan handlers ----

  const handleOpenCamera = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera access is needed to scan documents.');
        return;
      }
    }
    setShowCamera(true);
  };

  const handleCapturePage = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo) {
        setPreviewPhoto({ uri: photo.uri, width: photo.width, height: photo.height });
        setShowCamera(false);
      }
    } catch {
      showToast('Failed to capture photo', 'error');
    } finally {
      setCapturing(false);
    }
  };

  const handleCropConfirm = (croppedUri: string) => {
    setScannedPages(prev => [...prev, croppedUri]);
    setPreviewPhoto(null);
    if (scanPdfUri) setScanPdfUri('');
  };

  const handleRetake = () => {
    setPreviewPhoto(null);
    setShowCamera(true);
  };

  const handleRemovePage = (index: number) => {
    setScannedPages(prev => prev.filter((_, i) => i !== index));
    // Clear PDF if pages change
    if (scanPdfUri) setScanPdfUri('');
  };

  const handleConvertToPdf = useCallback(async () => {
    if (scannedPages.length === 0) return;
    setConvertingPdf(true);
    try {
      // Read each image as base64 and build HTML pages
      const imageHtmlParts = await Promise.all(
        scannedPages.map(async (uri) => {
          const base64 = await readAsStringAsync(uri, {
            encoding: EncodingType.Base64,
          });
          return `<div style="page-break-after: always; display: flex; justify-content: center; align-items: center; width: 100%; height: 100%;">
            <img src="data:image/jpeg;base64,${base64}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
          </div>`;
        }),
      );

      const html = `
        <html>
          <head>
            <style>
              @page { margin: 0; }
              body { margin: 0; padding: 0; }
              div { margin: 0; padding: 0; }
            </style>
          </head>
          <body>${imageHtmlParts.join('')}</body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      setScanPdfUri(uri);
      if (!name) setName(`Scan_${new Date().toISOString().slice(0, 10)}`);
    } catch {
      showToast('Failed to create PDF from scanned pages', 'error');
    } finally {
      setConvertingPdf(false);
    }
  }, [scannedPages, name]);

  const handleClearScan = () => {
    setScannedPages([]);
    setScanPdfUri('');
  };

  // ---- Upload handler ----

  const handleUpload = async () => {
    if (!name.trim()) {
      showToast('Please enter a document name', 'warning');
      return;
    }
    if (!canUploadDocument) {
      showToast('Upload limit reached. Please upgrade your plan.', 'warning');
      return;
    }

    setLoading(true);
    try {
      if (tab === 'file') {
        if (!fileUri) {
          showToast('Please select a file', 'warning');
          setLoading(false);
          return;
        }
        await uploadDocuments([{
          type: 'file', name: name.trim(), category, fileUri, fileName, mimeType,
          expirationDate: expirationDate || undefined,
        }]);
      } else if (tab === 'scan') {
        if (!scanPdfUri) {
          showToast('Please scan pages and create a PDF first', 'warning');
          setLoading(false);
          return;
        }
        await uploadDocuments([{
          type: 'file', name: name.trim(), category,
          fileUri: scanPdfUri,
          fileName: `${name.trim().replace(/\s+/g, '_')}.pdf`,
          mimeType: 'application/pdf',
          expirationDate: expirationDate || undefined,
        }]);
      } else if (tab === 'url') {
        if (!url.trim()) {
          showToast('Please enter a URL', 'warning');
          setLoading(false);
          return;
        }
        await uploadDocuments([{
          type: 'url', name: name.trim(), category, url: url.trim(),
          expirationDate: expirationDate || undefined,
        }]);
      }

      await incrementMonthlyUploads();
      showToast('Document uploaded successfully', 'success');
      goBack('/(tabs)/vault');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const tabs: { key: UploadTab; label: string; icon: (active: boolean) => React.ReactNode; locked: boolean }[] = [
    { key: 'file', label: 'File', icon: (a) => <FileText size={14} color={a ? colors.white : colors.slate[600]} />, locked: false },
    { key: 'scan', label: 'Scan', icon: (a) => <Camera size={14} color={a ? colors.white : colors.slate[600]} />, locked: !isStarterOrAbove },
    { key: 'url', label: 'URL', icon: (a) => <Link size={14} color={a ? colors.white : colors.slate[600]} />, locked: !isStarterOrAbove },
  ];

  const canSubmit =
    name.trim() &&
    ((tab === 'file' && fileUri) ||
      (tab === 'scan' && scanPdfUri) ||
      (tab === 'url' && url.trim()));

  // ---- Full-screen scan preview (crop adjustment) ----
  if (previewPhoto) {
    return (
      <>
        <Stack.Screen options={{ title: 'Adjust Scan', headerShown: true, presentation: 'modal' }} />
        <ScanPreview
          uri={previewPhoto.uri}
          imageWidth={previewPhoto.width}
          imageHeight={previewPhoto.height}
          onConfirm={handleCropConfirm}
          onRetake={handleRetake}
        />
      </>
    );
  }

  // ---- Full-screen camera overlay ----
  if (showCamera) {
    return (
      <>
        <Stack.Screen options={{ title: 'Scan Page', headerShown: true, presentation: 'modal' }} />
        <View style={styles.cameraContainer}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back">
            <View style={styles.cameraOverlay}>
              <View style={styles.scanFrame} />
              <Text style={styles.scanHintText}>
                Position the document within the frame
              </Text>
            </View>
          </CameraView>
          <View style={styles.cameraBottomBar}>
            <TouchableOpacity
              onPress={() => setShowCamera(false)}
              style={styles.cameraCancel}
            >
              <Text style={styles.cameraCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCapturePage}
              disabled={capturing}
              style={styles.captureButton}
              activeOpacity={0.7}
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
            <View style={styles.pageCountWrap}>
              <Badge
                label={`${scannedPages.length} page${scannedPages.length !== 1 ? 's' : ''}`}
                variant="default"
              />
            </View>
          </View>
        </View>
      </>
    );
  }

  if (subLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Upload Document', headerShown: true, presentation: 'modal' }} />
        <LoadingSpinner fullScreen />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Upload Document', headerShown: true, presentation: 'modal' }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <GradientIcon size={48}>
              <Upload size={24} color={colors.white} />
            </GradientIcon>
            <Text style={styles.headerTitle}>Upload Document</Text>
            <Text style={styles.headerSubtitle}>
              Add a new document to your vault
            </Text>
          </View>

          {/* Tab Switcher - Segmented Control */}
          <View style={styles.segmentedControl}>
            {tabs.map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key)}
                activeOpacity={0.7}
                style={[styles.segmentTab, tab === t.key && styles.segmentTabActive]}
              >
                {tab === t.key ? (
                  <LinearGradient
                    colors={[...colors.gradient.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.segmentGradient}
                  >
                    {t.icon(true)}
                    <Text style={styles.segmentTextActive}>{t.label}</Text>
                    {t.locked && <Lock size={10} color={colors.white} strokeWidth={2.5} />}
                  </LinearGradient>
                ) : (
                  <View style={styles.segmentInner}>
                    {t.icon(false)}
                    <Text style={styles.segmentText}>{t.label}</Text>
                    {t.locked && <Lock size={10} color={colors.slate[400]} strokeWidth={2.5} />}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Locked tab upgrade prompt */}
          {(tab === 'url' || tab === 'scan') && !isStarterOrAbove && (
            <Card style={styles.upgradeCard}>
              <View style={styles.upgradeCardContent}>
                <GradientIcon size={48}>
                  {tab === 'scan' ? <Camera size={24} color={colors.white} /> : <Link size={24} color={colors.white} />}
                </GradientIcon>
                <View style={styles.upgradeBadge}>
                  <Lock size={10} color={colors.white} strokeWidth={2.5} />
                  <Text style={styles.upgradeBadgeText}>STARTER FEATURE</Text>
                </View>
                <Text style={styles.upgradeTitle}>
                  {tab === 'scan' ? 'Document Scanning' : 'URL Ingestion'}
                </Text>
                <Text style={styles.upgradeDescription}>
                  {tab === 'scan'
                    ? 'Scan physical documents with your camera and convert them to searchable PDFs.'
                    : 'Import documents directly from web URLs. We\'ll fetch, process, and store the content for you.'}
                </Text>
                <Button
                  title="Upgrade to Starter"
                  onPress={() => router.push('/billing')}
                  variant="primary"
                  size="md"
                  fullWidth
                  icon={<Zap size={16} color={colors.white} />}
                />
                <Text style={styles.upgradePriceHint}>Starting at $7/mo · Cancel anytime</Text>
              </View>
            </Card>
          )}

          {/* File Tab */}
          {tab === 'file' && (
            <View>
              {!fileUri ? (
                <TouchableOpacity
                  onPress={handlePickFile}
                  activeOpacity={0.7}
                  style={styles.dropZone}
                >
                  <View style={styles.dropZoneIconWrap}>
                    <Upload size={28} color={colors.primary[400]} />
                  </View>
                  <Text style={styles.dropZoneTitle}>Tap to select a file</Text>
                  <Text style={styles.dropZoneHint}>
                    PDF, Word, Images, Text files
                  </Text>
                  <View style={styles.fileTypeRow}>
                    {['PDF', 'DOC', 'IMG', 'TXT'].map((ext) => (
                      <View key={ext} style={styles.fileTypeBadge}>
                        <Text style={styles.fileTypeBadgeText}>{ext}</Text>
                      </View>
                    ))}
                  </View>
                </TouchableOpacity>
              ) : (
                <Card style={styles.fileCard}>
                  <View style={styles.fileCardRow}>
                    <View style={styles.fileCardIconWrap}>
                      <FileText size={22} color={colors.primary[600]} />
                    </View>
                    <View style={styles.fileCardInfo}>
                      <Text style={styles.fileCardName} numberOfLines={1}>
                        {fileName}
                      </Text>
                      {fileSize > 0 && (
                        <Text style={styles.fileCardSize}>
                          {formatFileSize(fileSize)}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={handleRemoveFile}
                      style={styles.fileRemoveBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={18} color={colors.slate[400]} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.fileSuccessRow}>
                    <CheckCircle size={14} color={colors.success[600]} />
                    <Text style={styles.fileSuccessText}>File selected</Text>
                  </View>
                </Card>
              )}
            </View>
          )}

          {/* Scan Tab - Starter+ only */}
          {tab === 'scan' && isStarterOrAbove && (
            <View style={styles.scanSection}>
              {scannedPages.length === 0 && !scanPdfUri ? (
                /* Empty scan state */
                <TouchableOpacity
                  onPress={handleOpenCamera}
                  activeOpacity={0.7}
                  style={styles.dropZone}
                >
                  <View style={styles.dropZoneIconWrap}>
                    <Camera size={28} color={colors.primary[400]} />
                  </View>
                  <Text style={styles.dropZoneTitle}>Tap to scan a document</Text>
                  <Text style={styles.dropZoneHint}>
                    Capture multiple pages to create a PDF
                  </Text>
                </TouchableOpacity>
              ) : scanPdfUri ? (
                /* PDF created successfully */
                <Card style={[styles.fileCard, { borderColor: colors.success[200] }]}>
                  <View style={styles.fileCardRow}>
                    <View style={[styles.fileCardIconWrap, { backgroundColor: colors.success[50] }]}>
                      <FileText size={22} color={colors.success[600]} />
                    </View>
                    <View style={styles.fileCardInfo}>
                      <Text style={styles.fileCardName}>
                        Scanned Document
                      </Text>
                      <Text style={styles.fileCardSize}>
                        {scannedPages.length} page{scannedPages.length !== 1 ? 's' : ''} - PDF
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={handleClearScan}
                      style={styles.fileRemoveBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={18} color={colors.slate[400]} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.fileSuccessRow}>
                    <CheckCircle size={14} color={colors.success[600]} />
                    <Text style={styles.fileSuccessText}>PDF created from scanned pages</Text>
                  </View>
                </Card>
              ) : (
                /* Pages captured, not yet converted */
                <View style={styles.scanPagesSection}>
                  <View style={styles.scanPagesHeader}>
                    <Text style={styles.scanPagesTitle}>
                      Scanned Pages ({scannedPages.length})
                    </Text>
                    <TouchableOpacity onPress={handleClearScan}>
                      <Text style={styles.scanClearText}>Clear All</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Thumbnail grid */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.thumbnailScroll}
                  >
                    {scannedPages.map((uri, index) => (
                      <View key={`page-${index}`} style={styles.thumbnailWrap}>
                        <Image source={{ uri }} style={styles.thumbnailImage} />
                        <View style={styles.thumbnailPageBadge}>
                          <Text style={styles.thumbnailPageText}>{index + 1}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleRemovePage(index)}
                          style={styles.thumbnailRemove}
                          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        >
                          <Trash2 size={12} color={colors.white} />
                        </TouchableOpacity>
                      </View>
                    ))}

                    {/* Add page button */}
                    <TouchableOpacity
                      onPress={handleOpenCamera}
                      style={styles.addPageButton}
                      activeOpacity={0.7}
                    >
                      <Plus size={24} color={colors.primary[500]} />
                      <Text style={styles.addPageText}>Add Page</Text>
                    </TouchableOpacity>
                  </ScrollView>

                  {/* Convert to PDF button */}
                  <Button
                    title={convertingPdf ? 'Creating PDF...' : 'Create PDF'}
                    onPress={handleConvertToPdf}
                    loading={convertingPdf}
                    disabled={convertingPdf || scannedPages.length === 0}
                    variant="primary"
                    size="md"
                    fullWidth
                    icon={!convertingPdf ? <FileText size={18} color={colors.white} /> : undefined}
                  />
                </View>
              )}
            </View>
          )}

          {/* URL Tab - Starter+ only */}
          {tab === 'url' && isStarterOrAbove && (
            <Card>
              <Text style={styles.inputLabel}>Document URL</Text>
              <View style={styles.urlInputWrap}>
                <Link size={18} color={colors.slate[400]} />
                <TextInput
                  style={styles.urlInput}
                  value={url}
                  onChangeText={setUrl}
                  placeholder="Paste document URL..."
                  placeholderTextColor={colors.slate[400]}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <Text style={styles.urlHint}>
                Supports web pages, PDF links, and public documents
              </Text>
            </Card>
          )}

          {/* Document Details */}
          <Card>
            <Text style={styles.sectionTitle}>Document Details</Text>

            {/* Name */}
            <Text style={styles.inputLabel}>Document Name</Text>
            <View style={styles.nameInputWrap}>
              <FileText size={18} color={colors.slate[400]} />
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                placeholder="Enter document name"
                placeholderTextColor={colors.slate[400]}
              />
            </View>

            {/* Category Grid — compact 3×2 */}
            <Text style={[styles.inputLabel, { marginTop: spacing.lg }]}>Category</Text>
            <View style={styles.categoryGrid}>
              {DOCUMENT_CATEGORIES.map((c) => {
                const isSelected = category === c.value;
                const catColors = colors.category[c.value];
                return (
                  <TouchableOpacity
                    key={c.value}
                    onPress={() => setCategory(c.value)}
                    activeOpacity={0.7}
                    style={[
                      styles.categoryBtn,
                      {
                        backgroundColor: isSelected ? catColors.bg : colors.slate[50],
                        borderColor: isSelected ? catColors.border : colors.slate[200],
                      },
                    ]}
                  >
                    <Text style={styles.categoryEmoji}>
                      {CATEGORY_ICONS[c.value].emoji}
                    </Text>
                    <Text
                      style={[
                        styles.categoryText,
                        { color: isSelected ? catColors.text : colors.slate[600] },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Expiration Date */}
            <Text style={[styles.inputLabel, { marginTop: spacing.lg }]}>
              Expiration Date{' '}
              <Text style={styles.optionalTag}>(optional)</Text>
            </Text>
            <View style={styles.nameInputWrap}>
              <Calendar size={18} color={colors.slate[400]} />
              <TextInput
                style={styles.nameInput}
                value={expirationDate}
                onChangeText={setExpirationDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.slate[400]}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </Card>

          {/* Upload Limit Warning */}
          {isFree && !canUploadDocument && (
            <Card style={styles.warningCard}>
              <View style={styles.warningRow}>
                <View style={styles.warningIconWrap}>
                  <AlertTriangle size={20} color={colors.warning[600]} />
                </View>
                <View style={styles.warningContent}>
                  <Text style={styles.warningTitle}>Upload Limit Reached</Text>
                  <Text style={styles.warningText}>
                    Free plan allows {subscription?.document_limit ?? 3} documents and{' '}
                    {subscription?.monthly_upload_limit ?? 3} uploads/month. Upgrade to continue.
                  </Text>
                </View>
              </View>
              <Button
                title="Upgrade Plan"
                onPress={() => router.push('/billing')}
                variant="primary"
                size="sm"
                fullWidth
                style={{ marginTop: spacing.md }}
              />
            </Card>
          )}

          {/* Free tier usage indicator */}
          {isFree && canUploadDocument && (
            <View style={styles.usageRow}>
              <View style={styles.usageDot} />
              <Text style={styles.usageText}>
                {documentCount} / {subscription?.document_limit ?? 3} documents used
                {' \u2022 '}
                {subscription?.monthly_uploads_used ?? 0} / {subscription?.monthly_upload_limit ?? 3} uploads this month
              </Text>
            </View>
          )}

          {/* Submit Button */}
          <Button
            title="Upload Document"
            onPress={handleUpload}
            loading={loading}
            disabled={loading || !canSubmit || !canUploadDocument}
            size="lg"
            fullWidth
            icon={<Upload size={20} color={colors.white} />}
          />

          <View style={{ height: spacing['2xl'] }} />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const THUMBNAIL_SIZE = 100;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.slate[50],
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },

  // Header
  header: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    marginTop: spacing.sm,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
  },

  // Segmented Control
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.slate[100],
    borderRadius: borderRadius.lg,
    padding: 4,
    gap: 4,
  },
  segmentTab: {
    flex: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  segmentTabActive: {
    shadowColor: colors.primary[600],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  segmentGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  segmentInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 10,
  },
  segmentTextActive: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
  segmentText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[600],
  },

  // Drop Zone (shared by file + scan)
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary[300],
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primary[50],
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  dropZoneIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    shadowColor: colors.primary[600],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  dropZoneTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[700],
  },
  dropZoneHint: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
  },
  fileTypeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  fileTypeBadge: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.primary[200],
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  fileTypeBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
  },

  // File Card
  fileCard: {
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  fileCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  fileCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileCardInfo: {
    flex: 1,
  },
  fileCardName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
  },
  fileCardSize: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    marginTop: 2,
  },
  fileRemoveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileSuccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
  },
  fileSuccessText: {
    fontSize: typography.fontSize.xs,
    color: colors.success[600],
    fontWeight: typography.fontWeight.medium,
  },

  // Scan section
  scanSection: {
    gap: spacing.md,
  },
  scanPagesSection: {
    gap: spacing.md,
  },
  scanPagesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scanPagesTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
  },
  scanClearText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.error[600],
  },

  // Thumbnails
  thumbnailScroll: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  thumbnailWrap: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE * 1.3,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.slate[200],
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailPageBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  thumbnailPageText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  thumbnailRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPageButton: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE * 1.3,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary[300],
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addPageText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[600],
  },

  // Camera overlay
  cameraContainer: { flex: 1, backgroundColor: colors.black },
  camera: { flex: 1 },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  scanFrame: {
    width: '80%',
    aspectRatio: 0.7,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: borderRadius.lg,
  },
  scanHintText: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  cameraBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    paddingBottom: spacing['3xl'],
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  cameraCancel: {
    width: 70,
  },
  cameraCancelText: {
    fontSize: typography.fontSize.base,
    color: colors.white,
    fontWeight: typography.fontWeight.medium,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.white,
  },
  pageCountWrap: {
    width: 70,
    alignItems: 'flex-end',
  },

  // URL Input
  urlInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.slate[50],
    borderWidth: 1,
    borderColor: colors.slate[200],
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
  },
  urlInput: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.slate[900],
  },
  urlHint: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    marginTop: spacing.sm,
  },

  // Labels
  inputLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
    marginBottom: spacing.sm,
  },
  optionalTag: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.normal,
    color: colors.slate[400],
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    marginBottom: spacing.lg,
  },

  // Name Input
  nameInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.slate[50],
    borderWidth: 1,
    borderColor: colors.slate[200],
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
  },
  nameInput: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.slate[900],
  },

  // Category Grid
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryBtn: {
    flexBasis: '31%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
  },
  categoryEmoji: {
    fontSize: 16,
  },
  categoryText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },

  // Warning Card
  warningCard: {
    backgroundColor: colors.warning[50],
    borderWidth: 1,
    borderColor: colors.warning[200],
  },
  warningRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  warningIconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.warning[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.warning[800],
    marginBottom: 4,
  },
  warningText: {
    fontSize: typography.fontSize.xs,
    color: colors.warning[700],
    lineHeight: 18,
  },

  // Usage Row
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  usageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary[500],
  },
  usageText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
  },

  // Upgrade Card (inline for locked tabs)
  upgradeCard: {
    borderWidth: 1,
    borderColor: colors.primary[200],
    backgroundColor: colors.white,
  },
  upgradeCardContent: {
    alignItems: 'center' as const,
    gap: spacing.md,
  },
  upgradeBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: colors.primary[600],
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  upgradeBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1,
  },
  upgradeTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    textAlign: 'center' as const,
  },
  upgradeDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center' as const,
    lineHeight: 22,
    paddingHorizontal: spacing.sm,
  },
  upgradePriceHint: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
  },
});
