import React, { useState, useEffect, useCallback } from 'react';
import { X, Folder, FileText, ChevronRight, Check, Cloud, Loader2, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { browseCloudFiles, importCloudFiles, CloudFile, ImportResult } from '../lib/cloudStorageApi';
import { CloudProviderIcon } from './CloudProviderIcon';

interface CloudFileBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: string;
  providerDisplayName: string;
  onImportComplete: () => void;
}

interface Breadcrumb {
  id: string | null;
  name: string;
}

const categories = [
  { value: '', label: 'Select category...' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'lease', label: 'Lease Agreement' },
  { value: 'employment', label: 'Employment Contract' },
  { value: 'contract', label: 'Service Contract' },
  { value: 'other', label: 'Other' },
];

export function CloudFileBrowserModal({
  isOpen,
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
    if (isOpen) {
      loadFiles(currentFolderId);
    }
  }, [isOpen, currentFolderId, loadFiles]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFiles(new Map());
      setBatchCategory('');
      setImportResults(null);
      setBreadcrumbs([{ id: null, name: 'My Drive' }]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const navigateToFolder = (folder: CloudFile) => {
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
    setSelectedFiles(new Map());
  };

  const navigateToBreadcrumb = (index: number) => {
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    setSelectedFiles(new Map());
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

  const getFileIcon = (file: CloudFile) => {
    if (file.isFolder) return <Folder className="h-5 w-5 text-amber-500" />;
    if (file.mimeType.includes('pdf')) return <FileText className="h-5 w-5 text-red-500" />;
    if (file.mimeType.includes('word') || file.mimeType.includes('document')) return <FileText className="h-5 w-5 text-blue-500" />;
    if (file.mimeType.includes('image')) return <FileText className="h-5 w-5 text-purple-500" />;
    return <FileText className="h-5 w-5 text-slate-400" />;
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

      // If all succeeded, notify parent to refresh documents
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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="bg-slate-100 p-2.5 rounded-xl">
              <CloudProviderIcon provider={provider} className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Import from {providerDisplayName}</h2>
              <p className="text-xs text-slate-500">Select files to extract, chunk, and analyze</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Import Results View */}
        {importResults && (
          <div className="flex-1 overflow-y-auto p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Import Results</h3>
            <div className="space-y-2">
              {importResults.map((result, i) => {
                const file = selectedFiles.get(result.fileId);
                return (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${
                    result.status === 'imported' ? 'bg-green-50 border-green-200' :
                    result.status === 'already_imported' ? 'bg-amber-50 border-amber-200' :
                    'bg-red-50 border-red-200'
                  }`}>
                    <span className="text-sm text-slate-700 truncate">{file?.name || result.fileId}</span>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      result.status === 'imported' ? 'bg-green-100 text-green-700' :
                      result.status === 'already_imported' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {result.status === 'imported' ? 'Imported' :
                       result.status === 'already_imported' ? 'Already exists' :
                       result.error || 'Failed'}
                    </span>
                  </div>
                );
              })}
            </div>
            <button
              onClick={onClose}
              className="mt-4 w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-2.5 rounded-xl font-medium"
            >
              Done
            </button>
          </div>
        )}

        {/* File Browser View */}
        {!importResults && (
          <>
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1 px-5 py-3 bg-slate-50 border-b border-slate-200 text-sm overflow-x-auto">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
                  <button
                    onClick={() => navigateToBreadcrumb(index)}
                    className={`whitespace-nowrap px-1.5 py-0.5 rounded hover:bg-slate-200 transition-colors ${
                      index === breadcrumbs.length - 1 ? 'font-medium text-slate-900' : 'text-slate-500'
                    }`}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
              <button
                onClick={() => loadFiles(currentFolderId)}
                className="ml-auto text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-200 flex-shrink-0"
                title="Refresh"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {error && (
                <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {loading && files.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 text-emerald-600 animate-spin" />
                  <span className="ml-2 text-sm text-slate-500">Loading files...</span>
                </div>
              ) : files.length === 0 && !loading ? (
                <div className="text-center py-16 text-sm text-slate-500">
                  <Folder className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  No supported files in this folder
                </div>
              ) : (
                <>
                  {/* Select All row */}
                  {selectableFiles.length > 0 && (
                    <div className="flex items-center px-5 py-2 border-b border-slate-100 bg-slate-50">
                      <button
                        onClick={toggleSelectAll}
                        className={`w-4.5 h-4.5 rounded border-2 flex items-center justify-center transition-colors mr-3 ${
                          allSelected
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-slate-300 hover:border-emerald-400'
                        }`}
                        style={{ width: '18px', height: '18px' }}
                      >
                        {allSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                      </button>
                      <span className="text-xs text-slate-500">
                        {selectedFiles.size > 0 ? `${selectedFiles.size} selected` : 'Select all'}
                      </span>
                    </div>
                  )}

                  {files.map(file => (
                    <div
                      key={file.id}
                      onClick={() => file.isFolder ? navigateToFolder(file) : toggleFileSelection(file)}
                      className={`flex items-center px-5 py-3 border-b border-slate-100 cursor-pointer transition-colors ${
                        selectedFiles.has(file.id) ? 'bg-emerald-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Checkbox for files, nothing for folders */}
                      <div className="w-6 mr-3 flex-shrink-0">
                        {!file.isFolder && (
                          <div
                            className={`w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-colors ${
                              selectedFiles.has(file.id)
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-slate-300'
                            }`}
                          >
                            {selectedFiles.has(file.id) && <Check className="h-3 w-3" strokeWidth={3} />}
                          </div>
                        )}
                      </div>

                      {/* Icon */}
                      <div className="mr-3 flex-shrink-0">{getFileIcon(file)}</div>

                      {/* Name + meta */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                        <p className="text-xs text-slate-400">
                          {file.isFolder ? 'Folder' : [formatFileSize(file.size), formatDate(file.modifiedTime)].filter(Boolean).join(' \u00b7 ')}
                        </p>
                      </div>

                      {/* Folder arrow */}
                      {file.isFolder && (
                        <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      )}
                    </div>
                  ))}

                  {/* Load More */}
                  {nextPageToken && (
                    <div className="p-4 text-center">
                      <button
                        onClick={() => loadFiles(currentFolderId, nextPageToken)}
                        disabled={loading}
                        className="text-sm text-emerald-600 hover:text-emerald-700 font-medium inline-flex items-center gap-1"
                      >
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Load More
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer — Category + Import */}
            {selectedFiles.size > 0 && (
              <div className="border-t border-slate-200 p-4 bg-slate-50">
                <div className="flex items-center gap-3">
                  <select
                    value={batchCategory}
                    onChange={e => setBatchCategory(e.target.value)}
                    className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    {categories.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleImport}
                    disabled={importing || !batchCategory}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg font-medium text-sm transition-all inline-flex items-center gap-2 shadow-sm"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Cloud className="h-4 w-4" />
                        Import {selectedFiles.size} {selectedFiles.size === 1 ? 'File' : 'Files'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
