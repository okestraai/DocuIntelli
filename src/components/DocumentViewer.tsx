import React, { useState, useEffect } from 'react';
import { ArrowLeft, Download, FileText, Image, AlertCircle, Loader2 } from 'lucide-react';
import type { Document } from '../App';
import { supabase } from '../lib/supabase';
import { useFeedback } from '../hooks/useFeedback';

interface DocumentViewerProps {
  document: Document;
  onBack: () => void;
}

export function DocumentViewer({ document, onBack }: DocumentViewerProps) {
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const feedback = useFeedback();

  useEffect(() => {
    loadDocument();
  }, [document.id]);

  const loadDocument = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get the document from database to get file_path
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .select('file_path')
        .eq('id', document.id)
        .eq('user_id', user.id)
        .single();

      if (docError) {
        throw new Error('Document not found');
      }

      // Get signed URL for the document
      const { data: urlData, error: urlError } = await supabase.storage
        .from('documents')
        .createSignedUrl(docData.file_path, 3600); // 1 hour expiry

      if (urlError) {
        throw new Error('Failed to load document');
      }

      setDocumentUrl(urlData.signedUrl);
    } catch (err) {
      console.error('Error loading document:', err);
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!documentUrl) return;

    try {
      const loadingToastId = feedback.showLoading('Downloading document...', 'Please wait while we prepare your download');
      
      const response = await fetch(documentUrl);
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = document.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      feedback.removeToast(loadingToastId);
      feedback.showSuccess('Download started', 'Your document is being downloaded');
    } catch (error) {
      feedback.showError('Download failed', 'Unable to download the document');
    }
  };

  const getFileIcon = () => {
    if (document.type === 'PDF') return <FileText className="h-6 w-6 text-red-600" />;
    if (document.type === 'Image') return <Image className="h-6 w-6 text-blue-600" />;
    return <FileText className="h-6 w-6 text-gray-600" />;
  };

  const isImageFile = () => {
    return document.type === 'Image' || 
           document.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);
  };

  const isPDFFile = () => {
    return document.type === 'PDF' || document.name.toLowerCase().endsWith('.pdf');
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
              />
            )}

            {isImageFile() && (
              <div className="h-full flex items-center justify-center p-8">
                <img
                  src={documentUrl}
                  alt={document.name}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                />
              </div>
            )}

            {!isPDFFile() && !isImageFile() && (
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