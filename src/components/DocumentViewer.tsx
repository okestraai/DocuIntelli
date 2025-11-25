import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Download, FileText, Image, AlertCircle, Loader2, Search, X } from 'lucide-react';
import type { Document } from '../App';
import { useFeedback } from '../hooks/useFeedback';
import { supabase } from '../lib/supabase';

interface SearchResult {
  chunk_id: string;
  chunk_index: number;
  chunk_text: string;
  similarity: number;
}

interface DocumentViewerProps {
  document: Document;
  onBack: () => void;
}

export function DocumentViewer({ document, onBack }: DocumentViewerProps) {
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isConvertedDoc, setIsConvertedDoc] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [highlightedChunkId, setHighlightedChunkId] = useState<string | null>(null);
  const [documentChunks, setDocumentChunks] = useState<Array<{id: string, chunk_text: string, chunk_index: number}>>([]);
  const [iframeRef, setIframeRef] = useState<HTMLIFrameElement | null>(null);
  const [showHtmlView, setShowHtmlView] = useState(false);
  const [htmlBlobUrl, setHtmlBlobUrl] = useState<string | null>(null);
  const [isLoadingHtml, setIsLoadingHtml] = useState(false);
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

      // Fetch the file as a blob and create an object URL
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

  const loadHtmlVersion = async () => {
    if (htmlBlobUrl) {
      // Already loaded
      setShowHtmlView(true);
      return;
    }

    setIsLoadingHtml(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Get file path
      const { data: files, error: filesError } = await supabase
        .from('document_files')
        .select('file_path')
        .eq('document_id', document.id)
        .order('file_order', { ascending: true })
        .limit(1);

      let filePath: string;
      if (files && files.length > 0) {
        filePath = files[0].file_path;
      } else {
        const { data: docData, error: docError } = await supabase
          .from('documents')
          .select('file_path')
          .eq('id', document.id)
          .single();

        if (docError || !docData?.file_path) {
          throw new Error('Failed to get document file path');
        }
        filePath = docData.file_path;
      }

      const conversionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/convert-to-html`;

      const conversionResponse = await fetch(conversionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath,
          documentId: document.id
        }),
      });

      if (!conversionResponse.ok) {
        const errorData = await conversionResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to convert document');
      }

      const htmlContent = await conversionResponse.text();
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const objectURL = URL.createObjectURL(htmlBlob);

      setHtmlBlobUrl(objectURL);
      setShowHtmlView(true);
      feedback.showSuccess('HTML View Ready', 'Document converted for highlighting');
    } catch (error) {
      console.error('HTML conversion error:', error);
      feedback.showError('Conversion failed', error instanceof Error ? error.message : 'Failed to convert to HTML');
    } finally {
      setIsLoadingHtml(false);
    }
  };

  const loadDocumentChunks = useCallback(async () => {
    try {
      const { data: chunks, error: chunksError } = await supabase
        .from('document_chunks')
        .select('id, chunk_text, chunk_index')
        .eq('document_id', document.id)
        .order('chunk_index', { ascending: true });

      if (chunksError) {
        console.error('Error loading document chunks:', chunksError);
        return;
      }

      if (chunks && chunks.length > 0) {
        setDocumentChunks(chunks);
        console.log(`Loaded ${chunks.length} chunks for highlighting`);
      }
    } catch (error) {
      console.error('Failed to load document chunks:', error);
    }
  }, [document.id]);

  useEffect(() => {
    loadDocumentChunks();
  }, [loadDocumentChunks]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      feedback.showError('Search error', 'Please enter a search query');
      return;
    }

    setIsSearching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const searchUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-document-chunks`;

      const response = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_id: document.id,
          query: searchQuery,
          match_threshold: 0.6,
          match_count: 10,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Search failed');
      }

      const data = await response.json();
      setSearchResults(data.results || []);
      setShowSearchPanel(true);

      if (data.results && data.results.length > 0) {
        feedback.showSuccess('Search complete', `Found ${data.results.length} matching sections`);
      } else {
        feedback.showInfo('No results', 'No matching sections found for your query');
      }
    } catch (error) {
      console.error('Search error:', error);
      feedback.showError('Search failed', error instanceof Error ? error.message : 'Failed to search document');
    } finally {
      setIsSearching(false);
    }
  };

  const handleHighlight = (chunkId: string) => {
    setHighlightedChunkId(chunkId);

    // Send highlight message to iframe
    if (iframeRef && iframeRef.contentWindow) {
      const matchIds = searchResults.map(r => r.chunk_id);
      iframeRef.contentWindow.postMessage({
        type: 'highlight',
        currentId: chunkId,
        matchIds: matchIds,
        searchText: searchQuery
      }, '*');
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchPanel(false);
    setHighlightedChunkId(null);

    // Clear highlights in iframe
    if (iframeRef && iframeRef.contentWindow) {
      iframeRef.contentWindow.postMessage({
        type: 'highlight',
        currentId: null,
        matchIds: [],
        searchText: ''
      }, '*');
    }
  };

  // Update highlights when search results change
  useEffect(() => {
    if (searchResults.length > 0 && iframeRef && iframeRef.contentWindow && showHtmlView) {
      const matchIds = searchResults.map(r => r.chunk_id);
      iframeRef.contentWindow.postMessage({
        type: 'highlight',
        currentId: highlightedChunkId,
        matchIds: matchIds,
        searchText: searchQuery
      }, '*');
    }
  }, [searchResults, highlightedChunkId, iframeRef, searchQuery, showHtmlView]);

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
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between">
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

          <div className="flex items-center gap-3">
            {documentChunks.length > 0 && !showHtmlView && (
              <button
                onClick={loadHtmlVersion}
                disabled={isLoadingHtml}
                className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-300 disabled:to-slate-300 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-md disabled:shadow-none"
              >
                {isLoadingHtml ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Converting...</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    <span>HTML View</span>
                  </>
                )}
              </button>
            )}
            {showHtmlView && (
              <button
                onClick={() => setShowHtmlView(false)}
                className="flex items-center space-x-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-md"
              >
                <FileText className="h-4 w-4" />
                <span>PDF View</span>
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

        {/* Search Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 bg-slate-50 rounded-lg px-4 py-2 border border-slate-200 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-200">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Semantic search in document..."
                className="flex-1 bg-transparent outline-none text-slate-900 placeholder-slate-400"
                disabled={isSearching}
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 text-white px-6 py-2 rounded-lg font-medium transition-all shadow-md disabled:shadow-none"
            >
              {isSearching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  <span>Search</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Document Viewer and Search Results */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Search Results Panel */}
        {showSearchPanel && (
          <div className="w-96 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">Search Results</h3>
                <p className="text-sm text-slate-500">{searchResults.length} sections found</p>
              </div>
              <button
                onClick={clearSearch}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {searchResults.map((result, index) => (
                <div
                  key={result.chunk_id}
                  className={`p-3 rounded-lg border transition-all cursor-pointer ${
                    highlightedChunkId === result.chunk_id
                      ? 'bg-emerald-50 border-emerald-300 shadow-sm'
                      : 'bg-slate-50 border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/50'
                  }`}
                  onClick={() => handleHighlight(result.chunk_id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">
                      {(result.similarity * 100).toFixed(0)}% match
                    </span>
                    <span className="text-xs text-slate-500">Section {result.chunk_index + 1}</span>
                  </div>
                  <p className="text-sm text-slate-700 line-clamp-4">{result.chunk_text}</p>
                  {highlightedChunkId === result.chunk_id && (
                    <div className="mt-2 text-xs text-emerald-600 font-medium flex items-center gap-1">
                      <div className="w-2 h-2 bg-emerald-600 rounded-full animate-pulse"></div>
                      Currently highlighted
                    </div>
                  )}
                </div>
              ))}
              {searchResults.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <Search className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p className="text-sm">No results found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Document Viewer */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
            {showHtmlView && htmlBlobUrl ? (
              <div className="h-full flex flex-col">
                <div className="flex-1 overflow-auto">
                  <iframe
                    ref={(ref) => setIframeRef(ref)}
                    src={htmlBlobUrl}
                    className="w-full h-full border-0"
                    title={`${document.name} (HTML View)`}
                    sandbox="allow-same-origin allow-scripts"
                    onLoad={() => {
                      console.log('HTML view loaded successfully');
                      if (searchResults.length > 0 && iframeRef && iframeRef.contentWindow) {
                        const matchIds = searchResults.map(r => r.chunk_id);
                        iframeRef.contentWindow.postMessage({
                          type: 'highlight',
                          currentId: highlightedChunkId,
                          matchIds: matchIds,
                          searchText: searchQuery
                        }, '*');
                      }
                    }}
                    onError={(e) => {
                      console.error('HTML view load error:', e);
                      setError('Failed to load HTML view');
                    }}
                  />
                </div>
                <div className="p-2 bg-blue-50 border-t text-center text-xs text-blue-900 flex items-center justify-center gap-2">
                  <span className="font-medium">HTML View - Highlighting Enabled</span>
                  <span>•</span>
                  <span>Search results will be highlighted in this view</span>
                </div>
              </div>
            ) : isPDFFile() ? (
              <div className="h-full flex flex-col">
                <div className="flex-1 overflow-auto">
                  <embed
                    src={blobUrl}
                    type="application/pdf"
                    className="w-full h-full"
                    title={document.name}
                  />
                </div>
                <div className="p-2 bg-gray-50 border-t text-center text-xs text-gray-600 flex items-center justify-center gap-2">
                  <span>PDF View</span>
                  <span>•</span>
                  <span>Click "HTML View" to enable semantic highlighting</span>
                  <span>•</span>
                  <button onClick={handleDownload} className="text-emerald-600 hover:text-emerald-700 hover:underline font-medium">
                    Download
                  </button>
                </div>
              </div>
            ) : isImageFile() ? (
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
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Preview not available</h3>
                  <p className="text-gray-600 mb-4">
                    This file type cannot be previewed. Use HTML View for text-based documents.
                  </p>
                  <button
                    onClick={handleDownload}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors inline-flex items-center space-x-2"
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

    </div>
  );
}