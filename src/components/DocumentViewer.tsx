import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Download, FileText, Image, AlertCircle, Loader2 } from 'lucide-react';
import type { Document } from '../App';
import { useFeedback } from '../hooks/useFeedback';
import { supabase } from '../lib/supabase';

interface DocumentViewerProps {
  document: Document;
  onBack: () => void;
}

export function DocumentViewer({ document, onBack }: DocumentViewerProps) {
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const feedback = useFeedback();

  const loadDocument = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('Loading document:', document);

      // Check if this is a multi-file document
      const { data: files, error: filesError } = await supabase
        .from('document_files')
        .select('file_path')
        .eq('document_id', document.id)
        .order('file_order', { ascending: true })
        .limit(1);

      if (filesError) {
        console.error('Error checking document files:', filesError);
        throw new Error('Failed to load document files');
      }

      let filePath: string;

      if (files && files.length > 0) {
        // Multi-file document - use first file from document_files table
        filePath = files[0].file_path;
        console.log('Multi-file document, using file_path:', filePath);
      } else {
        // Single file document - use file_path from documents table
        const { data: docData, error: docError } = await supabase
          .from('documents')
          .select('file_path')
          .eq('id', document.id)
          .single();

        if (docError || !docData) {
          console.error('Error getting document file_path:', docError);
          throw new Error('Failed to get document file path');
        }

        filePath = docData.file_path;
        console.log('Single file document, using file_path:', filePath);
      }

      // Create static storage URL
      const storageUrl = `https://caygpjhiakabaxtklnlw.supabase.co/storage/v1/object/public/documents/${filePath}`;
      console.log('=== DOCUMENT VIEWER DEBUG ===');
      console.log('Document ID:', document.id);
      console.log('Document Name:', document.name);
      console.log('Document Type (MIME):', document.type);
      console.log('File Path:', filePath);
      console.log('Complete Storage URL:', storageUrl);
      console.log('=== END DEBUG ===');
      setDocumentUrl(storageUrl);
    } catch (err) {
      console.error('Error loading document:', err);
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setIsLoading(false);
    }
  }, [document]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  const handleDownload = async () => {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      console.warn('Download function called outside browser environment');
      return;
    }

    if (!documentUrl) {
      feedback.showError('Download failed', 'Document URL not available');
      return;
    }

    try {
      const loadingToastId = feedback.showLoading('Downloading document...', 'Please wait while we prepare your download');

      // Fetch the file from the static URL
      const response = await fetch(documentUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch document for download');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      try {
        // Create download link using blob URL
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = document.name;
        link.style.display = 'none';

        // Add to DOM, click, and remove
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } finally {
        // Always revoke the object URL to free memory
        URL.revokeObjectURL(objectUrl);
      }

      feedback.removeToast(loadingToastId);
      feedback.showSuccess('Download started', 'Your document is being downloaded');
    } catch (error) {
      console.error('Download error:', error);
      feedback.showError('Download failed', error instanceof Error ? error.message : 'Unable to download the document');
    }
  };

  const getFileIcon = () => {
    if (isPDFFile()) return <FileText className="h-6 w-6 text-red-600" />;
    if (isImageFile()) return <Image className="h-6 w-6 text-blue-600" />;
    return <FileText className="h-6 w-6 text-gray-600" />;
  };

  const isImageFile = () => {
    const mimeType = document.type?.toLowerCase() || '';
    const fileName = document.name.toLowerCase();
    return mimeType.startsWith('image/') ||
           fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff)$/);
  };

  const isPDFFile = () => {
    const mimeType = document.type?.toLowerCase() || '';
    const fileName = document.name.toLowerCase();
    return mimeType === 'application/pdf' || fileName.endsWith('.pdf');
  };

  const isWordFile = () => {
    const mimeType = document.type?.toLowerCase() || '';
    const fileName = document.name.toLowerCase();
    return mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
           mimeType === 'application/msword' ||
           fileName.match(/\.(doc|docx)$/);
  };

  const isExcelFile = () => {
    const mimeType = document.type?.toLowerCase() || '';
    const fileName = document.name.toLowerCase();
    return mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
           mimeType === 'application/vnd.ms-excel' ||
           fileName.match(/\.(xls|xlsx)$/);
  };

  const isPowerPointFile = () => {
    const mimeType = document.type?.toLowerCase() || '';
    const fileName = document.name.toLowerCase();
    return mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
           mimeType === 'application/vnd.ms-powerpoint' ||
           fileName.match(/\.(ppt|pptx)$/);
  };

  const isOfficeFile = () => {
    return isWordFile() || isExcelFile() || isPowerPointFile();
  };

  const isTextFile = () => {
    const mimeType = document.type?.toLowerCase() || '';
    const fileName = document.name.toLowerCase();
    return mimeType === 'text/plain' || fileName.endsWith('.txt');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-screen flex flex-col">
      {/* Header */}
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
              {getFileIcon()}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{document.name}</h1>
              <p className="text-sm text-gray-500 capitalize">
                {document.category} • {document.type} • {document.size}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleDownload}
          disabled={!documentUrl}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <Download className="h-4 w-4" />
          <span>Download</span>
        </button>
      </div>

      {/* Document Viewer */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Loading document...</p>
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
                onClick={loadDocument}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {documentUrl && !isLoading && !error && (
          <div className="h-full">
            {isPDFFile() && (
              <div className="h-full flex flex-col">
                <div className="flex-1 overflow-auto">
                  <embed
                    src={`${documentUrl}#toolbar=1&navpanes=1&scrollbar=1`}
                    type="application/pdf"
                    className="w-full h-full"
                    title={document.name}
                  />
                </div>
                <div className="p-2 bg-gray-50 border-t text-center text-xs text-gray-600">
                  If PDF doesn't display, <button onClick={handleDownload} className="text-blue-600 hover:underline">download it here</button>
                </div>
              </div>
            )}

            {isImageFile() && (
              <div className="h-full flex flex-col">
                <div className="flex-1 flex items-center justify-center p-8 overflow-auto bg-gray-50">
                  <img
                    src={documentUrl}
                    alt={document.name}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                    onLoad={() => console.log('Image loaded successfully')}
                    onError={(e) => {
                      console.error('Image load error:', e);
                      setError(`Failed to load image. URL: ${documentUrl}`);
                    }}
                  />
                </div>
              </div>
            )}

            {isOfficeFile() && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <FileText className="h-20 w-20 text-blue-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{document.name}</h3>
                  <p className="text-gray-600 mb-4">
                    {isWordFile() && 'Microsoft Word Document'}
                    {isExcelFile() && 'Microsoft Excel Spreadsheet'}
                    {isPowerPointFile() && 'Microsoft PowerPoint Presentation'}
                  </p>
                  <p className="text-sm text-gray-500 mb-6">
                    Office documents cannot be previewed directly in the browser. Download the file to view it in Microsoft Office, Google Docs, or a compatible application.
                  </p>
                  <button
                    onClick={handleDownload}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors inline-flex items-center space-x-2"
                  >
                    <Download className="h-5 w-5" />
                    <span>Download Document</span>
                  </button>
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-800">
                      <strong>Direct URL:</strong>
                    </p>
                    <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline break-all">
                      {documentUrl}
                    </a>
                  </div>
                </div>
              </div>
            )}

            {isTextFile() && (
              <iframe
                src={documentUrl}
                className="w-full h-full border-0 bg-white p-4"
                title={document.name}
                onLoad={() => console.log('Text file loaded successfully')}
                onError={(e) => {
                  console.error('Text file load error:', e);
                  setError('Failed to load text file');
                }}
              />
            )}

            {!isPDFFile() && !isImageFile() && !isOfficeFile() && !isTextFile() && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Preview not available</h3>
                  <p className="text-gray-600 mb-4">
                    This file type ({document.type || 'Unknown'}) cannot be previewed in the browser.
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    Supported preview formats: PDF, Images (JPG, PNG, GIF, WebP, BMP, SVG), Office Documents (Word, Excel, PowerPoint), Text files
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
  );
}