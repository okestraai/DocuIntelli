import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Modal as RNModal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  X,
  Folder,
  FileText,
  ChevronRight,
  Check,
  Cloud,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
} from 'lucide-react-native';
import { CloudProviderIcon } from './CloudProviderIcon';
import {
  browseCloudFiles,
  importCloudFiles,
  CloudFile,
  ImportResult,
} from '../lib/cloudStorageApi';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

interface CloudFileBrowserModalProps {
  visible: boolean;
  onClose: () => void;
  provider: string;
  providerDisplayName: string;
  onImportComplete: () => void;
}

interface Breadcrumb {
  id: string | null;
  name: string;
}

const CATEGORIES = [
  { value: '', label: 'Select category...' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'lease', label: 'Lease Agreement' },
  { value: 'employment', label: 'Employment' },
  { value: 'contract', label: 'Contract' },
  { value: 'other', label: 'Other' },
];

export function CloudFileBrowserModal({
  visible,
  onClose,
  provider,
  providerDisplayName,
  onImportComplete,
}: CloudFileBrowserModalProps) {
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: 'My Drive' }]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [selectedFiles, setSelectedFiles] = useState<Map<string, CloudFile>>(new Map());
  const [batchCategory, setBatchCategory] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);

  const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id;

  const loadFiles = useCallback(async (folderId: string | null, pageToken?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await browseCloudFiles(provider, folderId || undefined, pageToken);
      if (pageToken) {
        setFiles(prev => [...prev, ...result.files]);
      } else {
        setFiles(result.files);
      }
      setNextPageToken(result.nextPageToken);
    } catch (err: any) {
      setError(err.message || 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    if (visible) {
      loadFiles(currentFolderId);
    }
  }, [visible, currentFolderId, loadFiles]);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedFiles(new Map());
      setBatchCategory('');
      setImportResults(null);
      setBreadcrumbs([{ id: null, name: 'My Drive' }]);
    }
  }, [visible]);

  if (!visible) return null;

  const navigateToFolder = (folder: CloudFile) => {
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
    setSelectedFiles(new Map());
  };

  const navigateBack = () => {
    if (breadcrumbs.length > 1) {
      setBreadcrumbs(prev => prev.slice(0, -1));
      setSelectedFiles(new Map());
    }
  };

  const toggleFileSelection = (file: CloudFile) => {
    setSelectedFiles(prev => {
      const next = new Map(prev);
      if (next.has(file.id)) {
        next.delete(file.id);
      } else {
        next.set(file.id, file);
      }
      return next;
    });
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  };

  const getFileIconColor = (file: CloudFile) => {
    if (file.isFolder) return colors.warning[500];
    if (file.mimeType.includes('pdf')) return colors.error[500];
    if (file.mimeType.includes('word') || file.mimeType.includes('document')) return colors.info[500];
    if (file.mimeType.includes('image')) return '#a855f7';
    return colors.slate[400];
  };

  const handleImport = async () => {
    if (selectedFiles.size === 0 || !batchCategory) return;

    setImporting(true);
    setImportResults(null);
    try {
      const filesToImport = Array.from(selectedFiles.values()).map(f => ({
        fileId: f.id,
        name: f.name,
        category: batchCategory,
      }));

      const results = await importCloudFiles(provider, filesToImport);
      setImportResults(results);

      const anyImported = results.some(r => r.status === 'imported');
      if (anyImported) {
        onImportComplete();
      }
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const selectableFiles = files.filter(f => !f.isFolder);
  const allSelected = selectableFiles.length > 0 && selectableFiles.every(f => selectedFiles.has(f.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedFiles(new Map());
    } else {
      const next = new Map(selectedFiles);
      selectableFiles.forEach(f => next.set(f.id, f));
      setSelectedFiles(next);
    }
  };

  const selectedCategoryLabel = CATEGORIES.find(c => c.value === batchCategory)?.label || 'Select category...';

  // ── Import Results View ──────────────────────────────────────────────
  const renderResults = () => (
    <View style={styles.resultsContainer}>
      <Text style={styles.resultsTitle}>Import Results</Text>
      {importResults!.map((result, i) => {
        const file = selectedFiles.get(result.fileId);
        const isSuccess = result.status === 'imported';
        const isExisting = result.status === 'already_imported';
        return (
          <View key={i} style={[styles.resultRow, {
            backgroundColor: isSuccess ? colors.success[50] : isExisting ? colors.warning[50] : colors.error[50],
            borderColor: isSuccess ? colors.success[200] : isExisting ? colors.warning[200] : colors.error[200],
          }]}>
            <Text style={styles.resultName} numberOfLines={1}>{file?.name || result.fileId}</Text>
            <View style={[styles.resultBadge, {
              backgroundColor: isSuccess ? colors.success[100] : isExisting ? colors.warning[100] : colors.error[100],
            }]}>
              <Text style={[styles.resultBadgeText, {
                color: isSuccess ? colors.success[700] : isExisting ? colors.warning[700] : colors.error[700],
              }]}>
                {isSuccess ? 'Imported' : isExisting ? 'Already exists' : result.error || 'Failed'}
              </Text>
            </View>
          </View>
        );
      })}
      <TouchableOpacity style={styles.doneButton} onPress={onClose} activeOpacity={0.8}>
        <Text style={styles.doneButtonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  // ── File Row ─────────────────────────────────────────────────────────
  const renderFileRow = ({ item }: { item: CloudFile }) => {
    const isSelected = selectedFiles.has(item.id);
    const iconColor = getFileIconColor(item);
    const FileIcon = item.isFolder ? Folder : FileText;

    return (
      <TouchableOpacity
        style={[styles.fileRow, isSelected && styles.fileRowSelected]}
        onPress={() => item.isFolder ? navigateToFolder(item) : toggleFileSelection(item)}
        activeOpacity={0.7}
      >
        {/* Checkbox for files */}
        <View style={styles.checkboxArea}>
          {!item.isFolder && (
            <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
              {isSelected && <Check size={12} color={colors.white} strokeWidth={3} />}
            </View>
          )}
        </View>

        {/* Icon */}
        <FileIcon size={20} color={iconColor} />

        {/* Name + meta */}
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.fileMeta}>
            {item.isFolder ? 'Folder' : [formatFileSize(item.size), formatDate(item.modifiedTime)].filter(Boolean).join(' · ')}
          </Text>
        </View>

        {/* Folder arrow */}
        {item.isFolder && <ChevronRight size={16} color={colors.slate[400]} />}
      </TouchableOpacity>
    );
  };

  // ── Category Picker ──────────────────────────────────────────────────
  const renderCategoryPicker = () => (
    <RNModal visible={showCategoryPicker} transparent animationType="fade" onRequestClose={() => setShowCategoryPicker(false)}>
      <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowCategoryPicker(false)}>
        <View style={styles.pickerSheet}>
          <Text style={styles.pickerTitle}>Select Category</Text>
          {CATEGORIES.filter(c => c.value !== '').map(cat => (
            <TouchableOpacity
              key={cat.value}
              style={[styles.pickerOption, batchCategory === cat.value && styles.pickerOptionActive]}
              onPress={() => { setBatchCategory(cat.value); setShowCategoryPicker(false); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.pickerOptionText, batchCategory === cat.value && styles.pickerOptionTextActive]}>
                {cat.label}
              </Text>
              {batchCategory === cat.value && <Check size={16} color={colors.primary[600]} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </RNModal>
  );

  return (
    <RNModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.providerIconBox}>
                <CloudProviderIcon provider={provider} size={20} />
              </View>
              <View>
                <Text style={styles.headerTitle}>Import from {providerDisplayName}</Text>
                <Text style={styles.headerSubtitle}>Select files to extract and analyze</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={8}>
              <X size={20} color={colors.slate[400]} />
            </TouchableOpacity>
          </View>

          {importResults ? renderResults() : (
            <>
              {/* Breadcrumbs / Navigation */}
              <View style={styles.breadcrumbBar}>
                {breadcrumbs.length > 1 && (
                  <TouchableOpacity onPress={navigateBack} style={styles.backButton} hitSlop={8}>
                    <ChevronLeft size={18} color={colors.slate[600]} />
                  </TouchableOpacity>
                )}
                <Text style={styles.breadcrumbText} numberOfLines={1}>
                  {breadcrumbs[breadcrumbs.length - 1].name}
                </Text>
                <TouchableOpacity
                  onPress={() => loadFiles(currentFolderId)}
                  style={styles.refreshButton}
                  hitSlop={8}
                >
                  <RefreshCw size={14} color={colors.slate[400]} />
                </TouchableOpacity>
              </View>

              {/* Error */}
              {error && (
                <View style={styles.errorBar}>
                  <AlertCircle size={14} color={colors.error[600]} />
                  <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
                </View>
              )}

              {/* File List */}
              {loading && files.length === 0 ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={colors.primary[600]} />
                  <Text style={styles.loadingText}>Loading files...</Text>
                </View>
              ) : files.length === 0 && !loading ? (
                <View style={styles.emptyContainer}>
                  <Folder size={40} color={colors.slate[300]} />
                  <Text style={styles.emptyText}>No supported files in this folder</Text>
                </View>
              ) : (
                <FlatList
                  data={files}
                  keyExtractor={item => item.id}
                  renderItem={renderFileRow}
                  style={styles.fileList}
                  ListHeaderComponent={selectableFiles.length > 0 ? (
                    <TouchableOpacity style={styles.selectAllRow} onPress={toggleSelectAll} activeOpacity={0.7}>
                      <View style={[styles.checkbox, allSelected && styles.checkboxChecked]}>
                        {allSelected && <Check size={12} color={colors.white} strokeWidth={3} />}
                      </View>
                      <Text style={styles.selectAllText}>
                        {selectedFiles.size > 0 ? `${selectedFiles.size} selected` : 'Select all'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  ListFooterComponent={nextPageToken ? (
                    <TouchableOpacity
                      style={styles.loadMoreButton}
                      onPress={() => loadFiles(currentFolderId, nextPageToken)}
                      disabled={loading}
                      activeOpacity={0.7}
                    >
                      {loading && <ActivityIndicator size="small" color={colors.primary[600]} />}
                      <Text style={styles.loadMoreText}>Load More</Text>
                    </TouchableOpacity>
                  ) : null}
                />
              )}

              {/* Footer — Category + Import */}
              {selectedFiles.size > 0 && (
                <View style={styles.footer}>
                  <TouchableOpacity
                    style={styles.categorySelect}
                    onPress={() => setShowCategoryPicker(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.categorySelectText, !batchCategory && styles.categorySelectPlaceholder]}>
                      {selectedCategoryLabel}
                    </Text>
                    <ChevronRight size={14} color={colors.slate[400]} style={{ transform: [{ rotate: '90deg' }] }} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.importButton, (!batchCategory || importing) && styles.importButtonDisabled]}
                    onPress={handleImport}
                    disabled={importing || !batchCategory}
                    activeOpacity={0.8}
                  >
                    {importing ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Cloud size={16} color={colors.white} />
                    )}
                    <Text style={styles.importButtonText}>
                      {importing ? 'Importing...' : `Import ${selectedFiles.size}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
      {renderCategoryPicker()}
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  container: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    maxHeight: '90%',
    minHeight: '50%',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[200],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  providerIconBox: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  headerSubtitle: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    marginTop: 1,
  },
  closeButton: {
    padding: spacing.xs,
  },

  // Breadcrumbs
  breadcrumbBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.slate[50],
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[200],
  },
  backButton: {
    marginRight: spacing.sm,
  },
  breadcrumbText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[900],
  },
  refreshButton: {
    padding: spacing.xs,
  },

  // Error
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.error[50],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.error[200],
  },
  errorText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.error[700],
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['5xl'],
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
  },

  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['5xl'],
  },
  emptyText: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
  },

  // File List
  fileList: {
    flex: 1,
  },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.slate[50],
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
    gap: spacing.md,
  },
  selectAllText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
    gap: spacing.md,
  },
  fileRowSelected: {
    backgroundColor: colors.primary[50],
  },
  checkboxArea: {
    width: 22,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.slate[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[800],
  },
  fileMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    marginTop: 2,
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  loadMoreText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[600],
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.slate[200],
    backgroundColor: colors.slate[50],
  },
  categorySelect: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.slate[300],
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.white,
  },
  categorySelectText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[700],
  },
  categorySelectPlaceholder: {
    color: colors.slate[400],
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.lg,
  },
  importButtonDisabled: {
    opacity: 0.5,
  },
  importButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.white,
  },

  // Category Picker Modal
  pickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  pickerSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  pickerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    marginBottom: spacing.lg,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
  },
  pickerOptionActive: {
    backgroundColor: colors.primary[50],
  },
  pickerOptionText: {
    fontSize: typography.fontSize.base,
    color: colors.slate[700],
  },
  pickerOptionTextActive: {
    color: colors.primary[700],
    fontWeight: typography.fontWeight.medium,
  },

  // Results
  resultsContainer: {
    padding: spacing.xl,
  },
  resultsTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    marginBottom: spacing.md,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  resultName: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.slate[700],
    marginRight: spacing.sm,
  },
  resultBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  resultBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  doneButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary[600],
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.white,
  },
});
