import React, { useState } from 'react';
import { FileText, Calendar, AlertTriangle, TrendingUp, Upload, MessageSquare, Trash2 } from 'lucide-react';
import type { Document, Page } from '../App';
import { ConfirmDialog } from './ConfirmDialog';

interface DashboardProps {
  documents?: Document[];
  onNavigate: (page: Page) => void;
  onAddDocument: () => void;
  onDocumentDelete?: (documentId: string) => Promise<void>;
}

export function Dashboard({ documents, onNavigate, onAddDocument, onDocumentDelete }: DashboardProps) {
  // Ensure documents is always an array to prevent crashes
  const safeDocuments = documents ?? [];
  
  // Safe calculations with fallback to 0
  const totalDocuments = safeDocuments.length;
  const expiringDocuments = safeDocuments.filter(doc => doc?.status === 'expiring').length;
  const expiredDocuments = safeDocuments.filter(doc => doc?.status === 'expired').length;
  const activeDocuments = safeDocuments.filter(doc => doc?.status === 'active').length;

  const recentDocuments = safeDocuments.slice(0, 3);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const handleDeleteDocument = async (documentId: string) => {
    if (!onDocumentDelete) return;
    
    setDeletingDocId(documentId);
    try {
      await onDocumentDelete(documentId);
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Dashboard delete error:', error);
    } finally {
      setDeletingDocId(null);
    }
  };

  // Show loading state if documents is undefined (still loading)
  if (documents === undefined) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-600">Welcome back! Here's an overview of your documents and important dates.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Documents</p>
              <p className="text-3xl font-bold text-gray-900">{totalDocuments}</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Documents</p>
              <p className="text-3xl font-bold text-green-600">{activeDocuments}</p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Expiring Soon</p>
              <p className="text-3xl font-bold text-orange-600">{expiringDocuments}</p>
            </div>
            <div className="bg-orange-100 p-3 rounded-lg">
              <Calendar className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Expired</p>
              <p className="text-3xl font-bold text-red-600">{expiredDocuments}</p>
            </div>
            <div className="bg-red-100 p-3 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Recent Documents */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Recent Documents</h2>
              <button
                onClick={() => onNavigate('vault')}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                View All
              </button>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {recentDocuments.map((doc) => (
              <div key={doc?.id || Math.random()} className="flex items-center space-x-4 p-4 hover:bg-gray-50 rounded-lg transition-colors group">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  doc.category === 'insurance' ? 'bg-blue-100' :
                  doc.category === 'warranty' ? 'bg-green-100' :
                  doc.category === 'lease' ? 'bg-purple-100' : 'bg-gray-100'
                }`}>
                  <FileText className={`h-5 w-5 ${
                    doc.category === 'insurance' ? 'text-blue-600' :
                    doc.category === 'warranty' ? 'text-green-600' :
                    doc.category === 'lease' ? 'text-purple-600' : 'text-gray-600'
                  }`} />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{doc.name}</h3>
                  <p className="text-sm text-gray-500 capitalize">
                    {doc?.category || 'Unknown'} • {doc?.size || 'Unknown size'}
                    {doc.fileCount && doc.fileCount > 1 && (
                      <span className="ml-2 text-blue-600 font-medium">
                        ({doc.fileCount} files)
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                    doc.status === 'active' ? 'bg-green-100 text-green-800' :
                    doc.status === 'expiring' ? 'bg-orange-100 text-orange-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {doc.status}
                  </div>
                  <button
                    onClick={() => doc?.id && setShowDeleteConfirm(doc.id)}
                    disabled={deletingDocId === doc.id}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition-all disabled:opacity-50"
                    title="Delete document"
                  >
                    {deletingDocId === doc.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          {recentDocuments.length === 0 && (
            <div className="p-6 text-center text-gray-500">
              <p>No documents uploaded yet. Upload your first document to get started!</p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button
                onClick={onAddDocument}
                className="w-full flex items-center space-x-3 p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-left"
              >
                <Upload className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="font-medium text-gray-900">Upload New Document</h3>
                  <p className="text-sm text-gray-600">Add a new legal or financial document</p>
                </div>
              </button>
              
              <button
                onClick={() => onNavigate('tracker')}
                className="w-full flex items-center space-x-3 p-4 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors text-left"
              >
                <Calendar className="h-5 w-5 text-orange-600" />
                <div>
                  <h3 className="font-medium text-gray-900">Check Expiration Dates</h3>
                  <p className="text-sm text-gray-600">View upcoming renewals and expirations</p>
                </div>
              </button>

              <button
                onClick={() => onNavigate('vault')}
                className="w-full flex items-center space-x-3 p-4 bg-green-50 hover:bg-green-100 rounded-lg transition-colors text-left"
              >
                <MessageSquare className="h-5 w-5 text-green-600" />
                <div>
                  <h3 className="font-medium text-gray-900">Ask AI Assistant</h3>
                  <p className="text-sm text-gray-600">Get instant answers about your documents</p>
                </div>
              </button>
            </div>
          </div>

          {/* Alerts */}
          {expiringDocuments > 0 && safeDocuments.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-6">
              <div className="flex items-center space-x-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <h3 className="font-semibold text-orange-900">Attention Required</h3>
              </div>
              <p className="text-orange-800 mb-3">
                You have {expiringDocuments} document{expiringDocuments !== 1 ? 's' : ''} expiring soon.
              </p>
              <button
                onClick={() => onNavigate('tracker')}
                className="text-orange-700 hover:text-orange-800 font-medium text-sm underline"
              >
                Review expiring documents →
              </button>
            </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={!!showDeleteConfirm}
          title="Delete Document"
          message={`Are you sure you want to delete "${safeDocuments.find(d => d.id === showDeleteConfirm)?.name}"? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          confirmVariant="danger"
          isLoading={deletingDocId === showDeleteConfirm}
          onConfirm={() => showDeleteConfirm && handleDeleteDocument(showDeleteConfirm)}
          onCancel={() => setShowDeleteConfirm(null)}
        />
      </div>
    </div>
  );
}

// Loading skeleton component
function DashboardSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="h-8 bg-gray-200 rounded w-48 mb-2 animate-pulse"></div>
        <div className="h-4 bg-gray-200 rounded w-96 animate-pulse"></div>
      </div>

      {/* Stats Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-4 bg-gray-200 rounded w-24 mb-2 animate-pulse"></div>
                <div className="h-8 bg-gray-200 rounded w-16 animate-pulse"></div>
              </div>
              <div className="w-12 h-12 bg-gray-200 rounded-lg animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="h-96 bg-white rounded-xl shadow-sm border border-gray-200 animate-pulse"></div>
        <div className="h-96 bg-white rounded-xl shadow-sm border border-gray-200 animate-pulse"></div>
      </div>
    </div>
  );
}