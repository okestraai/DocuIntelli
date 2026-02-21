import React, { useState, useMemo } from 'react';
import { FileText, Search, Filter, Calendar, Eye, Plus, Trash2, FolderOpen, Shield, Sparkles, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'expiring' | 'expired'>('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 9;

  const categories = [
    { value: 'all', label: 'All Documents' },
    { value: 'warranty', label: 'Warranties' },
    { value: 'insurance', label: 'Insurance' },
    { value: 'lease', label: 'Leases' },
    { value: 'employment', label: 'Employment' },
    { value: 'contract', label: 'Contracts' },
    { value: 'other', label: 'Other' }
  ];

  // Expiration stats
  const expirationStats = useMemo(() => {
    const active = documents.filter(d => d.status === 'active').length;
    const expiring = documents.filter(d => d.status === 'expiring').length;
    const expired = documents.filter(d => d.status === 'expired').length;
    return { active, expiring, expired };
  }, [documents]);

  const getDaysUntilExpiration = (expirationDate: string): number => {
    const today = new Date();
    const expDate = new Date(expirationDate);
    return Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const totalPages = Math.ceil(filteredDocuments.length / ITEMS_PER_PAGE);
  const paginatedDocuments = filteredDocuments.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, statusFilter]);

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
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-600 p-2.5 rounded-xl shadow-md">
            <Shield className="h-6 w-6 text-white" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Document Vault</h1>
            <p className="text-sm sm:text-base text-slate-600">Securely store and organize all your legal and financial documents.</p>
          </div>
        </div>
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

      {/* Expiration Stats */}
      {(expirationStats.expiring > 0 || expirationStats.expired > 0) && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
          <button
            onClick={() => setStatusFilter(statusFilter === 'all' ? 'all' : 'all')}
            className={`border-2 rounded-xl p-3 sm:p-4 text-center transition-all ${
              statusFilter === 'all' ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-200'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-xl sm:text-2xl font-bold text-green-700">{expirationStats.active}</span>
            </div>
            <span className="text-xs font-medium text-green-600">Active</span>
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'expiring' ? 'all' : 'expiring')}
            className={`border-2 rounded-xl p-3 sm:p-4 text-center transition-all ${
              statusFilter === 'expiring' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-200'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-xl sm:text-2xl font-bold text-amber-700">{expirationStats.expiring}</span>
            </div>
            <span className="text-xs font-medium text-amber-600">Expiring</span>
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'expired' ? 'all' : 'expired')}
            className={`border-2 rounded-xl p-3 sm:p-4 text-center transition-all ${
              statusFilter === 'expired' ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-red-200'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-xl sm:text-2xl font-bold text-red-700">{expirationStats.expired}</span>
            </div>
            <span className="text-xs font-medium text-red-600">Expired</span>
          </button>
        </div>
      )}

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
        {statusFilter !== 'all' && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-slate-500">Filtered by:</span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
              statusFilter === 'expiring' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
            }`}>
              {statusFilter === 'expiring' ? 'Expiring Soon' : 'Expired'}
              <button onClick={() => setStatusFilter('all')} className="ml-1 hover:opacity-70">&times;</button>
            </span>
          </div>
        )}
      </div>

      {/* Documents Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {paginatedDocuments.map((doc) => (
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
                  <Calendar className="h-4 w-4 mr-1 flex-shrink-0" />
                  <span>
                    {formatUTCDate(doc.expirationDate)}
                    {(() => {
                      const days = getDaysUntilExpiration(doc.expirationDate);
                      if (days < 0) return <span className="text-red-600 font-medium"> ({Math.abs(days)}d ago)</span>;
                      if (days === 0) return <span className="text-red-600 font-medium"> (today)</span>;
                      if (days <= 30) return <span className="text-amber-600 font-medium"> ({days}d left)</span>;
                      return null;
                    })()}
                  </span>
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
        documents.length === 0 ? (
          /* True empty state — no documents at all */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-12">
            <div className="max-w-md mx-auto text-center">
              {/* Illustrative icon cluster */}
              <div className="relative w-24 h-24 mx-auto mb-6">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl rotate-6" />
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl -rotate-3" />
                <div className="relative bg-white rounded-2xl shadow-sm border border-emerald-200 w-full h-full flex items-center justify-center">
                  <FolderOpen className="h-10 w-10 text-emerald-600" strokeWidth={1.5} />
                </div>
              </div>

              <h3 className="text-xl font-bold text-slate-900 mb-2">Your vault is empty</h3>
              <p className="text-slate-500 mb-6 leading-relaxed">
                Upload your important documents to organize them, chat with AI about their contents, and track key dates — all in one secure place.
              </p>

              <button
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <Plus className="h-5 w-5" />
                Upload Your First Document
              </button>

              {/* Trust badges */}
              <div className="flex items-center justify-center gap-6 mt-8 pt-6 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Shield className="h-3.5 w-3.5" />
                  <span>Encrypted storage</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>AI-powered insights</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Expiration tracking</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Filtered empty — documents exist but none match */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-12">
            <div className="max-w-sm mx-auto text-center">
              <div className="bg-slate-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Search className="h-8 w-8 text-slate-400" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No matching documents</h3>
              <p className="text-slate-500 mb-5">
                No documents match your current search or filter. Try adjusting your criteria.
              </p>
              <button
                onClick={() => { setSearchTerm(''); setSelectedCategory('all'); setStatusFilter('all'); }}
                className="text-emerald-600 hover:text-emerald-700 font-medium text-sm inline-flex items-center gap-1 hover:gap-2 transition-all"
              >
                Clear all filters
                <span>&rarr;</span>
              </button>
            </div>
          </div>
        )
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`w-9 h-9 text-sm font-medium rounded-lg transition-colors ${
                currentPage === page
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 bg-white border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
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