import React, { useState, useRef } from 'react';
import { X, Upload, FileText, Trash2, Layers } from 'lucide-react';
import { DocumentUploadRequest } from '../hooks/useDocuments';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (documentsData: DocumentUploadRequest[]) => Promise<void>;
}

interface DocumentData {
  file: File;
  name: string;
  category: string;
  expirationDate: string;
}

interface MultiFileDocumentData {
  files: File[];
  name: string;
  category: string;
  expirationDate: string;
}

export function UploadModal({ isOpen, onClose, onUpload }: UploadModalProps) {
  const [uploadMode, setUploadMode] = useState<'separate' | 'combined'>('separate');
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [multiFileDoc, setMultiFileDoc] = useState<MultiFileDocumentData>({
    files: [],
    name: '',
    category: '',
    expirationDate: ''
  });
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = [
    { value: '', label: 'Select category...' },
    { value: 'warranty', label: 'Warranty' },
    { value: 'insurance', label: 'Insurance' },
    { value: 'lease', label: 'Lease Agreement' },
    { value: 'employment', label: 'Employment Contract' },
    { value: 'contract', label: 'Service Contract' },
    { value: 'other', label: 'Other' }
  ];

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      addFiles(files);
    }
  };

  const addFiles = (files: File[]) => {
    if (uploadMode === 'separate') {
      const newDocuments = files.map(file => ({
        file,
        name: '',
        category: '',
        expirationDate: ''
      }));
      setDocuments(prev => [...prev, ...newDocuments]);
    } else {
      setMultiFileDoc(prev => ({
        ...prev,
        files: [...prev.files, ...files]
      }));
    }
  };

  const updateDocument = (index: number, field: 'name' | 'category' | 'expirationDate', value: string) => {
    setDocuments(prev => prev.map((doc, i) =>
      i === index ? { ...doc, [field]: value } : doc
    ));
  };

  const updateMultiFileDoc = (field: 'name' | 'category' | 'expirationDate', value: string) => {
    setMultiFileDoc(prev => ({ ...prev, [field]: value }));
  };

  const removeDocument = (index: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const removeFileFromMultiDoc = (index: number) => {
    setMultiFileDoc(prev => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== index)
    }));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const isFormValid = () => {
    if (uploadMode === 'separate') {
      return documents.length > 0 && documents.every(doc => doc.name.trim() && doc.category);
    } else {
      return multiFileDoc.files.length > 0 && multiFileDoc.name.trim() && multiFileDoc.category;
    }
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;

    setIsUploading(true);
    try {
      if (uploadMode === 'separate') {
        const uploadData: DocumentUploadRequest[] = documents.map(doc => ({
          name: doc.name.trim(),
          category: doc.category,
          files: [doc.file],
          expirationDate: doc.expirationDate || undefined
        }));
        await onUpload(uploadData);
      } else {
        const uploadData: DocumentUploadRequest[] = [{
          name: multiFileDoc.name.trim(),
          category: multiFileDoc.category,
          files: multiFileDoc.files,
          expirationDate: multiFileDoc.expirationDate || undefined
        }];
        await onUpload(uploadData);
      }

      setDocuments([]);
      setMultiFileDoc({ files: [], name: '', category: '', expirationDate: '' });
      onClose();
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setDocuments([]);
      setMultiFileDoc({ files: [], name: '', category: '', expirationDate: '' });
      onClose();
    }
  };

  const handleModeChange = (mode: 'separate' | 'combined') => {
    if (mode === 'separate' && multiFileDoc.files.length > 0) {
      const newDocuments = multiFileDoc.files.map(file => ({
        file,
        name: multiFileDoc.name || '',
        category: multiFileDoc.category || '',
        expirationDate: multiFileDoc.expirationDate || ''
      }));
      setDocuments(newDocuments);
      setMultiFileDoc({ files: [], name: '', category: '', expirationDate: '' });
    } else if (mode === 'combined' && documents.length > 0) {
      const firstDoc = documents[0];
      setMultiFileDoc({
        files: documents.map(d => d.file),
        name: firstDoc.name || '',
        category: firstDoc.category || '',
        expirationDate: firstDoc.expirationDate || ''
      });
      setDocuments([]);
    }
    setUploadMode(mode);
  };

  const hasFiles = uploadMode === 'separate' ? documents.length > 0 : multiFileDoc.files.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Add Documents</h2>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!hasFiles && (
            <>
              <div className="mb-4 flex gap-2 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => handleModeChange('separate')}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                    uploadMode === 'separate'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Separate Documents
                </button>
                <button
                  onClick={() => handleModeChange('combined')}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                    uploadMode === 'combined'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Layers className="h-4 w-4" />
                  Multi-File Document
                </button>
              </div>

              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  {uploadMode === 'separate'
                    ? 'Each file will be uploaded as a separate document with its own details.'
                    : 'Multiple files will be uploaded as parts of a single document (e.g., multi-page contracts).'}
                </p>
              </div>
            </>
          )}

          {!hasFiles && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                isDragOver
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Upload Documents
              </h3>
              <p className="text-gray-600 mb-4">
                Drag and drop your files here, or click to browse
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Choose Files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff"
              />
              <p className="text-sm text-gray-500 mt-4">
                Supports PDF, Word, Text, and Image files with OCR (max 10MB each)
              </p>
            </div>
          )}

          {uploadMode === 'separate' && documents.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Documents to Upload ({documents.length})
                </h3>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Add More Files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff"
                />
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {documents.map((doc, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <FileText className="h-8 w-8 text-blue-600 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900">{doc.file.name}</p>
                          <p className="text-sm text-gray-500">{formatFileSize(doc.file.size)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeDocument(index)}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Document Name *
                        </label>
                        <input
                          type="text"
                          value={doc.name}
                          onChange={(e) => updateDocument(index, 'name', e.target.value)}
                          placeholder="Enter document name"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Category *
                          </label>
                          <select
                            value={doc.category}
                            onChange={(e) => updateDocument(index, 'category', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            {categories.map(cat => (
                              <option key={cat.value} value={cat.value}>{cat.label}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Expiration Date
                          </label>
                          <input
                            type="date"
                            value={doc.expirationDate}
                            onChange={(e) => updateDocument(index, 'expirationDate', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {uploadMode === 'combined' && multiFileDoc.files.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Files ({multiFileDoc.files.length})
                </h3>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Add More Files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff"
                />
              </div>

              <div className="bg-gray-50 rounded-lg p-4 max-h-40 overflow-y-auto space-y-2">
                {multiFileDoc.files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-white p-2 rounded">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{file.name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFileFromMultiDoc(index)}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-3 bg-gray-50 rounded-lg p-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Document Name *
                  </label>
                  <input
                    type="text"
                    value={multiFileDoc.name}
                    onChange={(e) => updateMultiFileDoc('name', e.target.value)}
                    placeholder="Enter document name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category *
                    </label>
                    <select
                      value={multiFileDoc.category}
                      onChange={(e) => updateMultiFileDoc('category', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {categories.map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Expiration Date
                    </label>
                    <input
                      type="date"
                      value={multiFileDoc.expirationDate}
                      onChange={(e) => updateMultiFileDoc('expirationDate', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-gray-200">
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="px-6 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={!isFormValid() || isUploading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Uploading...</span>
              </>
            ) : (
              <span>
                Upload {uploadMode === 'separate'
                  ? `${documents.length} Document${documents.length !== 1 ? 's' : ''}`
                  : `${multiFileDoc.files.length} File${multiFileDoc.files.length !== 1 ? 's' : ''}`}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
