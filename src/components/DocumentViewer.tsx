import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Download, FileText, Image, AlertCircle, Loader2, ChevronRight, Plus } from 'lucide-react';
import type { Document } from '../App';
import { useFeedback } from '../hooks/useFeedback';
import { getDocumentFiles, getFileUrl, addFilesToDocument } from '../lib/api';
import { AddFilesModal } from './AddFilesModal';

interface DocumentViewerProps {
  document: Document;
  onBack: () => void;
}

interface DocumentFile {
  id: string;
  document_id: string;
  file_path: string;
  original_name: string;
  file_order: number;
  size: number;
  type: string;
  processed: boolean;
  created_at: string;
}

export function DocumentViewer({ document, onBack }: DocumentViewerProps) {
  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddFilesModal, setShowAddFilesModal] = useState(false);
  const feedback = useFeedback();

  const loadDocumentFiles = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('📂 Loading document files for:', document.id);

      // Clean up previous blob URL if it exists
      if (documentUrl && documentUrl.startsWith('blob:')) {
        console.log('🧹 Cleaning up previous blob URL');
        URL.revokeObjectURL(documentUrl);
      }

      const documentFiles = await getDocumentFiles(document.id);
      console.log('📄 Found files:', documentFiles.length);
      console.log('📋 File details:', documentFiles.map(f => ({
        name: f.original_name,
        type: f.type,
        size: f.size,
        path: f.file_path
      })));

      if (documentFiles.length === 0) {
        setError('No files found for this document');
        return;
      }

      setFiles(documentFiles);

      console.log('🔗 Generating URL for:', documentFiles[0].file_path);
      console.log('📝 File type:', documentFiles[0].type);

      const fileUrl = await getFileUrl(documentFiles[0].file_path);
      console.log('✅ File URL generated:', fileUrl.substring(0, 80) + '...');

      setDocumentUrl(fileUrl);
    } catch (err) {
      console.error('❌ Error loading document files:', err);
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setIsLoading(false);
    }
  }, [document.id, documentUrl]);

  useEffect(() => {
    loadDocumentFiles();
  }, [loadDocumentFiles]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (documentUrl && documentUrl.startsWith('blob:')) {
        console.log('🧹 Cleaning up blob URL on unmount');
        URL.revokeObjectURL(documentUrl);
      }
    };
  }, [documentUrl]);

  const handleFileChange = async (index: number) => {
    if (index === currentFileIndex || !files[index]) return;

    try {
      setIsLoading(true);

      // Clean up previous blob URL
      if (documentUrl && documentUrl.startsWith('blob:')) {
        console.log('🧹 Cleaning up previous blob URL before switching files');
        URL.revokeObjectURL(documentUrl);
      }

      setCurrentFileIndex(index);
      const fileUrl = await getFileUrl(files[index].file_path);
      setDocumentUrl(fileUrl);
    } catch (err) {
      console.error('Error loading file:', err);
      feedback.showError('Failed to load file', err instanceof Error ? err.message : 'Unable to load the selected file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      console.warn('Download function called outside browser environment');
      return;
    }

    if (!documentUrl || files.length === 0) {
      feedback.showError('Download failed', 'File URL not available');
      return;
    }

    try {
      const currentFile = files[currentFileIndex];
      const loadingToastId = feedback.showLoading('Downloading file...', 'Please wait while we prepare your download');

      const response = await fetch(documentUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch file for download');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      try {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = currentFile.original_name;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }

      feedback.removeToast(loadingToastId);
      feedback.showSuccess('Download started', 'Your file is being downloaded');
    } catch (error) {
      console.error('Download error:', error);
      feedback.showError('Download failed', error instanceof Error ? error.message : 'Unable to download the file');
    }
  };

  const handleDownloadAll = async () => {
    if (files.length === 1) {
      handleDownload();
      return;
    }

    try {
      const loadingToastId = feedback.showLoading('Downloading files...', `Preparing ${files.length} files for download`);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileUrl = await getFileUrl(file.file_path);
        const response = await fetch(fileUrl);
        if (!response.ok) continue;

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        try {
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = file.original_name;
          link.style.display = 'none';

          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      feedback.removeToast(loadingToastId);
      feedback.showSuccess('Downloads started', `${files.length} files are being downloaded`);
    } catch (error) {
      console.error('Download all error:', error);
      feedback.showError('Download failed', error instanceof Error ? error.message : 'Unable to download files');
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) return <FileText className="h-5 w-5 text-red-600" />;
    if (fileType.includes('image')) return <Image className="h-5 w-5 text-blue-600" />;
    return <FileText className="h-5 w-5 text-gray-600" />;
  };

  const isImageFile = (fileType: string | null | undefined) => {
    if (!fileType) return false;
    return fileType.toLowerCase().includes('image');
  };

  const isPDFFile = (fileType: string | null | undefined) => {
    if (!fileType) return false;
    return fileType.toLowerCase().includes('pdf');
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleAddFiles = async (newFiles: File[], updateExpiration: boolean, newExpirationDate?: string) => {
    try {
      const loadingToastId = feedback.showLoading('Adding files...', 'Processing and uploading your files');

      const result = await addFilesToDocument(
        document.id,
        newFiles,
        updateExpiration,
        newExpirationDate
      );

      feedback.removeToast(loadingToastId);

      if (result.success) {
        feedback.showSuccess('Files added successfully', `${newFiles.length} file${newFiles.length !== 1 ? 's' : ''} added to the document`);
        await loadDocumentFiles();
      } else {
        throw new Error(result.error || 'Failed to add files');
      }
    } catch (error) {
      console.error('Error adding files:', error);
      feedback.showError('Failed to add files', error instanceof Error ? error.message : 'Unable to add files to the document');
      throw error;
    }
  };

  const currentFile = files[currentFileIndex];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-screen flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center space-x-3">
            <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center">
              {currentFile && getFileIcon(currentFile.type)}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{document.name}</h1>
              <p className="text-sm text-gray-500 capitalize">
                {document.category} • {files.length} file{files.length !== 1 ? 's' : ''} • {document.size}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddFilesModal(true)}
            className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Add Files</span>
          </button>
          {files.length > 1 && (
            <button
              onClick={handleDownloadAll}
              className="flex items-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Download All</span>
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={!documentUrl}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Download</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden">
        {files.length > 1 && (
          <div className="w-64 bg-white rounded-xl shadow-sm border border-gray-200 overflow-y-auto">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Files ({files.length})</h3>
            </div>
            <div className="p-2 space-y-1">
              {files.map((file, index) => (
                <button
                  key={file.id}
                  onClick={() => handleFileChange(index)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
                    currentFileIndex === index
                      ? 'bg-blue-50 border-2 border-blue-500'
                      : 'hover:bg-gray-50 border-2 border-transparent'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {getFileIcon(file.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      currentFileIndex === index ? 'text-blue-900' : 'text-gray-900'
                    }`}>
                      {file.original_name}
                    </p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                  {currentFileIndex === index && (
                    <ChevronRight className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Loading file...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Unable to load document</h3>
                <p className="text-gray-600 mb-4">{error}</p>
                <button
                  onClick={loadDocumentFiles}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {documentUrl && !isLoading && !error && currentFile && (
            <div className="h-full">
              {isPDFFile(currentFile.type) && (
                <iframe
                  src={documentUrl}
                  className="w-full h-full border-0"
                  title={currentFile.original_name}
                  onLoad={() => console.log('PDF loaded successfully')}
                  onError={(e) => {
                    console.error('PDF load error:', e);
                    setError('Failed to load PDF document');
                  }}
                />
              )}

              {isImageFile(currentFile.type) && (
                <div className="h-full flex items-center justify-center p-8">
                  <img
                    src={documentUrl}
                    alt={currentFile.original_name}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                    onLoad={() => console.log('Image loaded successfully')}
                    onError={(e) => {
                      console.error('Image load error:', e);
                      setError('Failed to load image');
                    }}
                  />
                </div>
              )}

              {!isPDFFile(currentFile.type) && !isImageFile(currentFile.type) && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Preview not available</h3>
                    <p className="text-gray-600 mb-4">
                      This file type cannot be previewed in the browser.
                    </p>
                    <button
                      onClick={handleDownload}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors inline-flex items-center space-x-2"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download to View</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AddFilesModal
        isOpen={showAddFilesModal}
        onClose={() => setShowAddFilesModal(false)}
        document={document}
        onAddFiles={handleAddFiles}
      />
    </div>
  );
}
