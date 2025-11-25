import React, { useState } from 'react';
import { FileText, Search, Filter, Calendar, Eye, Plus, Trash2 } from 'lucide-react';
import type { Document } from '../App';
import { UploadModal } from './UploadModal';
import { DocumentUploadRequest } from '../hooks/useDocuments';
import { formatUTCDate } from '../lib/dateUtils';

interface DocumentVaultProps {
  documents: Document[];
  onDocumentSelect: (doc: Document) => void;
  onDocumentView: (doc: Document) => void;
  onDocumentUpload?: (documentsData: DocumentUploadRequest[]) => Promise<void>;
  onDocumentDelete?: (documentId: string) => Promise<void>;
}


export function DocumentVault({ documents, onDocumentSelect, onDocumentView, onDocumentUpload, onDocumentDelete }: DocumentVaultProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const categories = [
    { value: 'all', label: 'All Documents' },
    { value: 'warranty', label: 'Warranties' },
    { value: 'insurance', label: 'Insurance' },
    { value: 'lease', label: 'Leases' },
    { value: 'employment', label: 'Employment' },
    { value: 'contract', label: 'Contracts' },
    { value: 'other', label: 'Other' }
  ];

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleDocumentUploadNew = async (documentsData: DocumentUploadRequest[]) => {
    try {
      if (onDocumentUpload) {
        await onDocumentUpload(documentsData);
        setShowUploadModal(false);
      }
    } catch (error) {
      console.error('Upload handler error:', error);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!onDocumentDelete) return;
    
    setDeletingDocId(documentId);
    try {
      await onDocumentDelete(documentId);
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Delete handler error:', error);
    } finally {
      setDeletingDocId(null);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'insurance': return 'bg-blue-100 text-blue-800';
      case 'warranty': return 'bg-green-100 text-green-800';
      case 'lease': return 'bg-purple-100 text-purple-800';
      case 'employment': return 'bg-yellow-100 text-yellow-800';
      case 'contract': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'expiring': return 'bg-orange-100 text-orange-800';
      case 'expired': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2 tracking-tight">Document Vault</h1>
        <p className="text-sm sm:text-base text-slate-600">Securely store and organize all your legal and financial documents.</p>
      </div>

      {/* Upload Area */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-xl sm:rounded-2xl p-6 sm:p-8 mb-6 sm:mb-8 text-center">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-600 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <Plus className="h-7 w-7 sm:h-8 sm:w-8 text-white" strokeWidth={2.5} />
        </div>
        <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">Add New Document</h3>
        <p className="text-sm sm:text-base text-slate-600 mb-6 max-w-md mx-auto">
          Upload your legal and financial documents to start organizing and getting AI-powered insights.
        </p>
        <button
          onClick={() => setShowUploadModal(true)}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl font-medium transition-all inline-flex items-center gap-2 shadow-lg hover:shadow-xl text-sm sm:text-base"
        >
          <Plus className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2} />
          <span>Add Document</span>
        </button>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4 sm:h-5 sm:w-5" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base transition-all"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4 sm:h-5 sm:w-5" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="pl-9 sm:pl-10 pr-8 py-2 sm:py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 appearance-none bg-white text-sm sm:text-base transition-all w-full sm:w-auto"
            >
              {categories.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Documents Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {filteredDocuments.map((doc) => (
          <div
            key={doc.id}
            className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 hover:shadow-lg hover:border-emerald-200 transition-all overflow-hidden"
          >
            <div className="p-4 sm:p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 w-11 h-11 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center">
                  <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-slate-600" strokeWidth={2} />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onDocumentView(doc)}
                    className="text-slate-400 hover:text-emerald-600 transition-colors p-1 hover:bg-emerald-50 rounded-lg"
                    title="View document"
                  >
                    <Eye className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(doc.id)}
                    className="text-slate-400 hover:text-red-600 transition-colors p-1 hover:bg-red-50 rounded-lg"
                    title="Delete document"
                  >
                    <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2} />
                  </button>
                </div>
              </div>

              <h3 className="font-semibold text-slate-900 mb-2 line-clamp-2 text-sm sm:text-base">{doc.name}</h3>
              <p className="text-xs sm:text-sm text-slate-500 mb-3">{doc.type} • {doc.size}</p>

              <div className="flex items-center justify-between mb-3">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(doc.category)}`}>
                  {doc.category}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(doc.status)}`}>
                  {doc.status}
                </span>
              </div>

              {doc.expirationDate && (
                <div className="flex items-center text-sm text-gray-500 mb-3">
                  <Calendar className="h-4 w-4 mr-1" />
                  <span>Expires: {formatUTCDate(doc.expirationDate)}</span>
                </div>
              )}

              {doc.tags && doc.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {doc.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={() => onDocumentSelect(doc)}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white py-2 px-4 rounded-lg font-medium transition-all shadow-sm hover:shadow-md text-sm sm:text-base"
              >
                Chat with Document
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredDocuments.length === 0 && (
        <div className="text-center py-12">
          <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No documents found</h3>
          <p className="text-gray-600">
            {searchTerm || selectedCategory !== 'all'
              ? 'Try adjusting your search or filter criteria.'
              : 'Upload your first document to get started.'}
          </p>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="bg-red-100 w-12 h-12 rounded-full flex items-center justify-center">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Delete Document</h3>
                <p className="text-sm text-gray-600">This action cannot be undone</p>
              </div>
            </div>
            
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete "{documents.find(d => d.id === showDeleteConfirm)?.name}"? 
              This will permanently remove the document and all associated data.
            </p>
            
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                disabled={deletingDocId === showDeleteConfirm}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteDocument(showDeleteConfirm)}
                disabled={deletingDocId === showDeleteConfirm}
                className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
              >
                {deletingDocId === showDeleteConfirm ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleDocumentUploadNew}
      />
    </div>
  );
}