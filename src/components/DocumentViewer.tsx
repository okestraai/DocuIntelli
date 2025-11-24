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

      // Get file_path from database
      const { data, error: dbError } = await supabase
        .from('documents')
        .select('file_path')
        .eq('id', document.id)
        .single();

      if (dbError || !data?.file_path) {
        throw new Error('Failed to get document file path');
      }

      // Construct static URL with file_path
      const baseUrl = 'https://caygpjhiakabaxtklnlw.supabase.co/storage/v1/object/public/documents';
      const fileUrl = `${baseUrl}/${data.file_path}`;
      console.log('Generated file URL:', fileUrl);
      setDocumentUrl(fileUrl);
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
    if (document.type === 'PDF') return <FileText className="h-6 w-6 text-red-600" />;
    if (document.type === 'Image') return <Image className="h-6 w-6 text-blue-600" />;
    return <FileText className="h-6 w-6 text-gray-600" />;
  };

  const isImageFile = () => {
    return document.type === 'Image' ||
           document.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp|tiff)$/);
  };

  const isPDFFile = () => {
    return document.type === 'PDF' || document.name.toLowerCase().endsWith('.pdf');
  };

  const isDocxFile = () => {
    return document.name.toLowerCase().match(/\.(doc|docx)$/);
  };

  const isTxtFile = () => {
    return document.name.toLowerCase().endsWith('.txt');
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
              <iframe
                src={documentUrl}
                className="w-full h-full border-0"
                title={document.name}
                onLoad={() => console.log('PDF loaded successfully')}
                onError={(e) => {
                  console.error('PDF load error:', e);
                  setError('Failed to load PDF document');
                }}
              />
            )}

            {isImageFile() && (
              <div className="h-full flex items-center justify-center p-8">
                <img
                  src={documentUrl}
                  alt={document.name}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                  onLoad={() => console.log('Image loaded successfully')}
                  onError={(e) => {
                    console.error('Image load error:', e);
                    setError('Failed to load image');
                  }}
                />
              </div>
            )}

            {isDocxFile() && (
              <iframe
                src={`https://docs.google.com/gview?url=${encodeURIComponent(documentUrl)}&embedded=true`}
                className="w-full h-full border-0"
                title={document.name}
                onLoad={() => console.log('DOCX loaded successfully')}
                onError={(e) => {
                  console.error('DOCX load error:', e);
                  setError('Failed to load Word document');
                }}
              />
            )}

            {isTxtFile() && (
              <iframe
                src={documentUrl}
                className="w-full h-full border-0 bg-white p-4"
                title={document.name}
                onLoad={() => console.log('TXT loaded successfully')}
                onError={(e) => {
                  console.error('TXT load error:', e);
                  setError('Failed to load text document');
                }}
              />
            )}

            {!isPDFFile() && !isImageFile() && !isDocxFile() && !isTxtFile() && (
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
  );
}