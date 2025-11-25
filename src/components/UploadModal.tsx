import React, { useState, useRef } from 'react';
import { X, Upload, FileText, Trash2 } from 'lucide-react';
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

export function UploadModal({ isOpen, onClose, onUpload }: UploadModalProps) {
  const [documents, setDocuments] = useState<DocumentData[]>([]);
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
    const newDocuments = files.map(file => ({
      file,
      name: '',
      category: '',
      expirationDate: ''
    }));
    setDocuments(prev => [...prev, ...newDocuments]);
  };

  const updateDocument = (index: number, field: 'name' | 'category' | 'expirationDate', value: string) => {
    setDocuments(prev => prev.map((doc, i) => 
      i === index ? { ...doc, [field]: value } : doc
    ));
  };

  const removeDocument = (index: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const isFormValid = () => {
    return documents.length > 0 && documents.every(doc => doc.name.trim() && doc.category);
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;

    setIsUploading(true);
    try {
      // Convert to the format expected by onUpload
      const uploadData: DocumentUploadRequest[] = documents.map(doc => ({
        name: doc.name.trim(),
        category: doc.category,
        file: doc.file,
        expirationDate: doc.expirationDate || undefined
      }));

      await onUpload(uploadData);

      // Reset form and close modal on success
      setDocuments([]);
      onClose();
    } catch (error) {
      // Error handling is done in parent component
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setDocuments([]);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* File Upload Area */}
          {documents.length === 0 && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                isDragOver
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-slate-300 hover:border-slate-400'
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
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-6 py-2 rounded-lg font-medium transition-all shadow-md"
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

          {/* Document List */}
          {documents.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Documents to Upload ({documents.length})
                </h3>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
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
                        <FileText className="h-8 w-8 text-emerald-600 flex-shrink-0" strokeWidth={2} />
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
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
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
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 text-white px-6 py-2 rounded-lg font-medium transition-all shadow-md disabled:shadow-none flex items-center space-x-2"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Uploading...</span>
              </>
            ) : (
              <span>Upload {documents.length} Document{documents.length !== 1 ? 's' : ''}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}