import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Download, FileText, Image, AlertCircle, Loader2, PanelRightOpen, PanelRightClose, Crown, RefreshCw, MessageSquare } from 'lucide-react';
import type { Document } from '../App';
import { useFeedback } from '../hooks/useFeedback';
import { supabase } from '../lib/supabase';
import { fetchDocumentRelationships } from '../lib/engagementApi';
import { DocumentHealthPanel } from './DocumentHealthPanel';

interface DocumentViewerProps {
  document: Document;
  onBack: () => void;
  onChatWithDocument?: () => void;
  currentPlan?: 'free' | 'starter' | 'pro';
  onUpgrade?: () => void;
  onUploadRenewal?: (doc: Document) => void;
  onNavigateToDocument?: (documentId: string) => void;
}

export function DocumentViewer({ document, onBack, onChatWithDocument, currentPlan, onUpgrade, onUploadRenewal, onNavigateToDocument }: DocumentViewerProps) {
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isConvertedDoc, setIsConvertedDoc] = useState(false);
  const isPro = currentPlan === 'pro';
  const [showHealthPanel, setShowHealthPanel] = useState(isPro);
  const [olderVersion, setOlderVersion] = useState<{ id: string; name: string } | null>(null);
  const [newerVersion, setNewerVersion] = useState<{ id: string; name: string } | null>(null);
  const feedback = useFeedback();

  // Fetch renewal chain relationships
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { outgoing, incoming } = await fetchDocumentRelationships(document.id);
        if (cancelled) return;
        // Outgoing supersedes = this doc replaced an older one
        const older = outgoing?.find((r: any) => r.relationship_type === 'supersedes');
        // Incoming supersedes = another doc replaced this one
        const newer = incoming?.find((r: any) => r.relationship_type === 'supersedes');
        setOlderVersion(older ? { id: older.related_document_id, name: older.documentName || 'Previous version' } : null);
        setNewerVersion(newer ? { id: newer.source_document_id, name: newer.documentName || 'Newer version' } : null);
      } catch {
        // Non-critical — just don't show version nav
        setOlderVersion(null);
        setNewerVersion(null);
      }
    })();
    return () => { cancelled = true; };
  }, [document.id]);

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

        if (docError || !docData?.file_path) {
          console.error('Error getting document file_path:', docError);
          throw new Error('Failed to get document file path');
        }

        filePath = docData.file_path;
        console.log('Single file document, using file_path:', filePath);
      }

      console.log('=== DOCUMENT VIEWER DEBUG ===');
      console.log('Document ID:', document.id);
      console.log('Document Name:', document.name);
      console.log('Document Type (MIME):', document.type);
      console.log('File Path:', filePath);

      let fetchUrl: string;

      // Try to create a signed URL first
      const { data: signedUrlData, error: signedUrlError } = await supabase
        .storage
        .from('documents')
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (signedUrlError || !signedUrlData) {
        console.warn('Signed URL creation failed:', signedUrlError);
        console.log('Falling back to public URL...');

        // Fallback to public URL
        const { data: publicUrlData } = supabase
          .storage
          .from('documents')
          .getPublicUrl(filePath);

        fetchUrl = publicUrlData.publicUrl;
        console.log('Using public URL:', fetchUrl);
      } else {
        fetchUrl = signedUrlData.signedUrl;
        console.log('Using signed URL:', fetchUrl);
      }

      setDocumentUrl(fetchUrl);

      // Check if this is a Word document that needs conversion
      const isWordDoc = document.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                        document.type === 'application/msword' ||
                        document.name.toLowerCase().endsWith('.docx') ||
                        document.name.toLowerCase().endsWith('.doc');

      if (isWordDoc) {
        console.log('Word document detected, converting to HTML...');
        setIsConverting(true);

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            throw new Error('Not authenticated');
          }

          const conversionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/convert-to-pdf`;

          const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
          const conversionResponse = await fetch(conversionUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'apikey': supabaseAnonKey,
            },
            body: JSON.stringify({ filePath }),
          });

          if (!conversionResponse.ok) {
            const errorData = await conversionResponse.json().catch(() => ({}));
            console.error('Conversion failed:', errorData);
            throw new Error(errorData.error || 'Failed to convert document');
          }

          const htmlContent = await conversionResponse.text();
          console.log('HTML conversion complete, length:', htmlContent.length);

          // Create a blob URL from the HTML content
          const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
          const objectURL = URL.createObjectURL(htmlBlob);
          console.log('Object URL created from converted HTML:', objectURL);
          setBlobUrl(objectURL);
          setIsConvertedDoc(true);
        } catch (conversionError) {
          console.error('Conversion error:', conversionError);
          throw new Error(conversionError instanceof Error ? conversionError.message : 'Failed to convert document');
        } finally {
          setIsConverting(false);
        }
      } else {
        // Fetch the file as a blob and create an object URL for non-Word docs
        console.log('Fetching document as blob...');
        const response = await fetch(fetchUrl);

        if (!response.ok) {
          console.error('Fetch failed:', response.status, response.statusText);
          throw new Error(`Failed to fetch document: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        console.log('Blob created, size:', blob.size, 'type:', blob.type);

        const objectURL = URL.createObjectURL(blob);
        console.log('Object URL created:', objectURL);
        setBlobUrl(objectURL);
      }

      console.log('=== END DEBUG ===');
    } catch (err) {
      console.error('Error loading document:', err);
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setIsLoading(false);
    }
  }, [document]);

  useEffect(() => {
    console.log('DocumentViewer mounted or document changed');
    loadDocument();
  }, [loadDocument]);

  // Separate effect for cleanup
  useEffect(() => {
    return () => {
      if (blobUrl) {
        console.log('Revoking object URL:', blobUrl);
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  const handleDownload = async () => {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      console.warn('Download function called outside browser environment');
      return;
    }

    if (!blobUrl && !documentUrl) {
      feedback.showError('Download failed', 'Document not available');
      return;
    }

    try {
      const loadingToastId = feedback.showLoading('Downloading document...', 'Please wait while we prepare your download');

      // Use the blob URL if available, otherwise fetch from signed URL
      let downloadUrl = blobUrl;

      if (!downloadUrl && documentUrl) {
        // Fetch the file from the signed URL
        const response = await fetch(documentUrl);
        if (!response.ok) {
          throw new Error('Failed to fetch document for download');
        }
        const blob = await response.blob();
        downloadUrl = URL.createObjectURL(blob);
      }

      if (!downloadUrl) {
        throw new Error('No download URL available');
      }

      // Create download link
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = document.name;
      link.style.display = 'none';

      // Add to DOM, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Only revoke if we created a new URL (not the existing blobUrl)
      if (downloadUrl !== blobUrl) {
        URL.revokeObjectURL(downloadUrl);
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
    if (isImageFile()) return <Image className="h-6 w-6 text-emerald-600" strokeWidth={2} />;
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

        <div className="flex items-center gap-2">
          <button
            onClick={() => isPro ? setShowHealthPanel(!showHealthPanel) : onUpgrade?.()}
            className={`relative flex items-center space-x-2 px-3 py-2 rounded-lg font-medium text-sm transition-all border ${
              showHealthPanel && isPro
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-200'
            }`}
            title={isPro ? (showHealthPanel ? 'Hide health panel' : 'Show health panel') : 'Upgrade to Pro to access Document Health'}
          >
            {showHealthPanel && isPro ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            <span className="hidden sm:inline">Health</span>
            {!isPro && (
              <span className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full leading-none shadow-sm">
                <Crown className="h-2 w-2" />
                PRO
              </span>
            )}
          </button>
          {onChatWithDocument && (
            <button
              onClick={onChatWithDocument}
              className="flex items-center space-x-2 bg-white text-slate-700 border border-slate-200 hover:border-teal-300 hover:bg-teal-50 px-3 py-2 rounded-lg font-medium text-sm transition-all"
              title="Chat with this document"
            >
              <MessageSquare className="h-4 w-4 text-teal-600" />
              <span className="hidden sm:inline">Chat</span>
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={!blobUrl && !documentUrl}
            className="flex items-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-md disabled:shadow-none"
          >
            <Download className="h-4 w-4" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Newer Version Banner — prominent when viewing an outdated doc */}
      {newerVersion && onNavigateToDocument && (
        <div className="mb-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-xl p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
                <RefreshCw className="h-4.5 w-4.5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-900">A newer version is available</p>
                <p className="text-xs text-emerald-700 truncate">{newerVersion.name}</p>
              </div>
            </div>
            <button
              onClick={() => onNavigateToDocument(newerVersion.id)}
              className="flex-shrink-0 flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all shadow-sm"
            >
              View Latest
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Previous Version Link — subtle when viewing the latest doc */}
      {olderVersion && onNavigateToDocument && (
        <div className="mb-4 flex items-center gap-2 px-1">
          <button
            onClick={() => onNavigateToDocument(olderVersion.id)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-600 font-medium transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Previous version: <span className="truncate max-w-[200px]">{olderVersion.name}</span>
          </button>
        </div>
      )}

      {/* Document Viewer + Health Panel */}
      <div className={`flex-1 flex gap-4 overflow-hidden ${showHealthPanel ? '' : ''}`}>
      <div className={`${showHealthPanel ? 'flex-1 min-w-0' : 'w-full'} bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden`}>
        {(isLoading || isConverting) && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="h-12 w-12 text-emerald-600 animate-spin mx-auto mb-4" strokeWidth={2} />
              <p className="text-gray-600">
                {isConverting ? 'Converting Word document...' : 'Loading document...'}
              </p>
              {isConverting && (
                <p className="text-sm text-gray-500 mt-2">This may take a few moments</p>
              )}
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
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-md"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {blobUrl && !isLoading && !error && (
          <div className="h-full">
            {isPDFFile() && (
              <div className="h-full flex flex-col">
                <div className="flex-1 overflow-auto">
                  <embed
                    src={blobUrl}
                    type="application/pdf"
                    className="w-full h-full"
                    title={document.name}
                  />
                </div>
                <div className="p-2 bg-gray-50 border-t text-center text-xs text-gray-600">
                  PDF loaded successfully • <button onClick={handleDownload} className="text-emerald-600 hover:text-emerald-700 hover:underline">Download</button>
                </div>
              </div>
            )}

            {isImageFile() && (
              <div className="h-full flex flex-col">
                <div className="flex-1 flex items-center justify-center p-8 overflow-auto bg-gray-50">
                  <img
                    src={blobUrl}
                    alt={document.name}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                    onLoad={() => console.log('Image loaded successfully from blob URL')}
                    onError={(e) => {
                      console.error('Image load error:', e);
                      setError('Failed to load image from blob');
                    }}
                  />
                </div>
              </div>
            )}

            {isConvertedDoc && (
              <div className="h-full flex flex-col">
                <div className="flex-1 overflow-auto">
                  <iframe
                    src={blobUrl}
                    className="w-full h-full border-0"
                    title={document.name}
                    sandbox="allow-same-origin"
                    onLoad={() => console.log('Converted document loaded successfully')}
                    onError={(e) => {
                      console.error('Converted document load error:', e);
                      setError('Failed to load converted document');
                    }}
                  />
                </div>
                <div className="p-2 bg-gray-50 border-t text-center text-xs text-gray-600">
                  Document converted and displayed • <button onClick={handleDownload} className="text-emerald-600 hover:text-emerald-700 hover:underline">Download original</button>
                </div>
              </div>
            )}

            {isOfficeFile() && !isConvertedDoc && (
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
                    <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 hover:text-emerald-700 hover:underline break-all">
                      {documentUrl}
                    </a>
                  </div>
                </div>
              </div>
            )}

            {isTextFile() && (
              <iframe
                src={blobUrl}
                className="w-full h-full border-0 bg-white p-4"
                title={document.name}
                sandbox="allow-same-origin"
                onLoad={() => console.log('Text file loaded successfully from blob URL')}
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

      {/* Health Panel Sidebar — Pro only */}
      {showHealthPanel && isPro && (
        <div className="w-80 flex-shrink-0 overflow-y-auto hidden lg:block">
          <DocumentHealthPanel
            documentId={document.id}
            documentName={document.name}
            documentCategory={document.category}
            documentStatus={document.status}
            onChatWithDocument={onChatWithDocument}
            onUploadRenewal={() => onUploadRenewal?.(document)}
          />
        </div>
      )}
      </div>
    </div>
  );
}