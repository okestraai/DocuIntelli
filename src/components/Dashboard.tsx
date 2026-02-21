import React, { useState } from 'react';
import { FileText, Calendar, AlertTriangle, TrendingUp, Upload, MessageSquare, Trash2, Crown, Zap, Shield, FolderOpen, ArrowRight, Sparkles, LayoutDashboard } from 'lucide-react';
import type { Document, Page } from '../App';
import { ConfirmDialog } from './ConfirmDialog';
import { useSubscription } from '../hooks/useSubscription';
import { PLAN_LIMITS, type PlanId } from '../lib/planLimits';
import { TodayFeed } from './TodayFeed';

interface DashboardProps {
  documents?: Document[];
  onNavigate: (page: Page) => void;
  onAddDocument: () => void;
  onDocumentDelete?: (documentId: string) => Promise<void>;
  onUpgrade?: () => void;
  onManageSubscription?: () => void;
  onViewDocument?: (documentId: string) => void;
}

export function Dashboard({ documents, onNavigate, onAddDocument, onDocumentDelete, onUpgrade, onManageSubscription, onViewDocument }: DashboardProps) {
  const safeDocuments = documents ?? [];
  const { subscription, documentCount } = useSubscription();
  const planDocLimit: number = subscription ? (PLAN_LIMITS[subscription.plan as PlanId]?.documents ?? subscription.document_limit) : 3;

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

  if (documents === undefined) {
    return <DashboardSkeleton />;
  }

  // Empty state when user has zero documents
  if (totalDocuments === 0) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-600 p-2.5 rounded-xl shadow-md">
              <LayoutDashboard className="h-6 w-6 text-white" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
              <p className="text-sm sm:text-base text-slate-600">Welcome! Let's get your document vault set up.</p>
            </div>
          </div>
        </div>

        {/* Welcome Hero */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 rounded-2xl sm:rounded-3xl p-8 sm:p-12 mb-8 text-white">
          {/* Decorative circles */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/4" />

          <div className="relative z-10 max-w-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-emerald-200" />
              <span className="text-emerald-100 text-sm font-medium">Get Started</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Your intelligent document vault awaits</h2>
            <p className="text-emerald-100 text-sm sm:text-base mb-6 max-w-lg leading-relaxed">
              Upload your important documents and let AI help you organize, track expirations, and find answers instantly. It all starts with your first upload.
            </p>
            <button
              onClick={onAddDocument}
              className="inline-flex items-center gap-2 bg-white text-emerald-700 hover:bg-emerald-50 font-semibold px-6 py-3 rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <Upload className="h-5 w-5" />
              Upload Your First Document
            </button>
          </div>
        </div>

        {/* What You Can Do - Feature Cards */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">What you can do with DocuIntelli</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-emerald-200 transition-all group">
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 w-11 h-11 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <FolderOpen className="h-5 w-5 text-emerald-600" />
              </div>
              <h4 className="font-semibold text-slate-900 mb-1">Organize Documents</h4>
              <p className="text-sm text-slate-500 leading-relaxed">Categorize warranties, insurance, leases, and more with automatic tagging.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-amber-200 transition-all group">
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 w-11 h-11 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Calendar className="h-5 w-5 text-amber-600" />
              </div>
              <h4 className="font-semibold text-slate-900 mb-1">Track Expirations</h4>
              <p className="text-sm text-slate-500 leading-relaxed">Never miss a renewal. Get alerts before your documents expire.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-teal-200 transition-all group">
              <div className="bg-gradient-to-br from-teal-50 to-cyan-50 w-11 h-11 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <MessageSquare className="h-5 w-5 text-teal-600" />
              </div>
              <h4 className="font-semibold text-slate-900 mb-1">Chat with AI</h4>
              <p className="text-sm text-slate-500 leading-relaxed">Ask questions about any document and get instant, accurate answers.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-violet-200 transition-all group">
              <div className="bg-gradient-to-br from-violet-50 to-purple-50 w-11 h-11 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Shield className="h-5 w-5 text-violet-600" />
              </div>
              <h4 className="font-semibold text-slate-900 mb-1">Life Event Prep</h4>
              <p className="text-sm text-slate-500 leading-relaxed">Prepare for moving, travel, or new jobs with guided document checklists.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-blue-200 transition-all group">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 w-11 h-11 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <h4 className="font-semibold text-slate-900 mb-1">Vault Health</h4>
              <p className="text-sm text-slate-500 leading-relaxed">Weekly audits keep your document vault complete and up to date.</p>
            </div>

            <button
              onClick={onAddDocument}
              className="bg-gradient-to-br from-slate-50 to-white rounded-xl border-2 border-dashed border-slate-300 p-5 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all flex flex-col items-center justify-center text-center group cursor-pointer"
            >
              <div className="bg-emerald-100 w-11 h-11 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Upload className="h-5 w-5 text-emerald-600" />
              </div>
              <h4 className="font-semibold text-slate-900 mb-1">Start Now</h4>
              <p className="text-sm text-slate-500">Upload your first document</p>
            </button>
          </div>
        </div>

        {/* Subscription Card */}
        {subscription && (
          <div className="mb-6 sm:mb-8">
            <div className="bg-gradient-to-br from-slate-50 to-white border-2 border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${
                    subscription.plan === 'pro' ? 'bg-gradient-to-br from-emerald-100 to-teal-100' :
                    subscription.plan === 'starter' ? 'bg-gradient-to-br from-blue-100 to-cyan-100' :
                    'bg-slate-100'
                  }`}>
                    {subscription.plan === 'pro' ? (
                      <Crown className="h-6 w-6 text-emerald-600" strokeWidth={2} />
                    ) : subscription.plan === 'starter' ? (
                      <Zap className="h-6 w-6 text-blue-600" strokeWidth={2} />
                    ) : (
                      <FileText className="h-6 w-6 text-slate-600" strokeWidth={2} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 capitalize">
                      {subscription.plan} Plan
                    </h3>
                    <p className="text-sm text-slate-600">
                      {subscription.plan === 'free' ? `Upload up to ${planDocLimit} documents to get started` :
                       subscription.plan === 'pro' ? `${planDocLimit} documents · Unlimited AI · All features` :
                       `${planDocLimit} documents · Unlimited AI chats`}
                    </p>
                  </div>
                </div>
                {subscription.plan === 'free' && onUpgrade && (
                  <button
                    onClick={onUpgrade}
                    className="flex-shrink-0 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold py-2 px-4 rounded-lg transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-sm"
                  >
                    Upgrade
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-600 p-2.5 rounded-xl shadow-md">
            <LayoutDashboard className="h-6 w-6 text-white" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
            <p className="text-sm sm:text-base text-slate-600">Welcome back! Here's an overview of your documents and important dates.</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
        <div className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-slate-600 mb-1">Total</p>
              <p className="text-2xl sm:text-3xl font-bold text-slate-900">{totalDocuments}</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-2 sm:p-3 rounded-lg">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600" strokeWidth={2} />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-green-200 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-slate-600 mb-1">Active</p>
              <p className="text-2xl sm:text-3xl font-bold text-green-600">{activeDocuments}</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-2 sm:p-3 rounded-lg">
              <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" strokeWidth={2} />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-amber-200 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-slate-600 mb-1">Expiring</p>
              <p className="text-2xl sm:text-3xl font-bold text-amber-600">{expiringDocuments}</p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-2 sm:p-3 rounded-lg">
              <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600" strokeWidth={2} />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-red-200 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-slate-600 mb-1">Expired</p>
              <p className="text-2xl sm:text-3xl font-bold text-red-600">{expiredDocuments}</p>
            </div>
            <div className="bg-gradient-to-br from-red-50 to-rose-50 p-2 sm:p-3 rounded-lg">
              <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 text-red-600" strokeWidth={2} />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Documents & Quick Actions — primary content */}
      <div className="grid lg:grid-cols-2 gap-6 sm:gap-8 mb-6 sm:mb-8">
        {/* Recent Documents */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-slate-200">
          <div className="p-4 sm:p-6 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-semibold text-slate-900">Recent Documents</h2>
              <button
                onClick={() => onNavigate('vault')}
                className="text-emerald-600 hover:text-emerald-700 text-sm font-medium transition-colors"
              >
                View All
              </button>
            </div>
          </div>
          <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
            {recentDocuments.map((doc) => (
              <div
                key={doc?.id || Math.random()}
                className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-slate-50 rounded-lg sm:rounded-xl transition-colors group cursor-pointer"
                onClick={() => doc?.id && onViewDocument?.(doc.id)}
              >
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 ${
                  doc.category === 'insurance' ? 'bg-gradient-to-br from-blue-50 to-cyan-50' :
                  doc.category === 'warranty' ? 'bg-gradient-to-br from-green-50 to-emerald-50' :
                  doc.category === 'lease' ? 'bg-gradient-to-br from-violet-50 to-purple-50' : 'bg-gradient-to-br from-slate-50 to-slate-100'
                }`}>
                  <FileText className={`h-5 w-5 sm:h-6 sm:w-6 ${
                    doc.category === 'insurance' ? 'text-blue-600' :
                    doc.category === 'warranty' ? 'text-green-600' :
                    doc.category === 'lease' ? 'text-violet-600' : 'text-slate-600'
                  }`} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-slate-900 text-sm sm:text-base truncate">{doc.name}</h3>
                  <p className="text-xs sm:text-sm text-slate-500 capitalize truncate">{doc?.category || 'Unknown'} • {doc?.size || 'Unknown size'}</p>
                  {doc.tags && doc.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {doc.tags.slice(0, 3).map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
                        >
                          {tag}
                        </span>
                      ))}
                      {doc.tags.length > 3 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium text-slate-500">
                          +{doc.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                    doc.status === 'active' ? 'bg-green-100 text-green-800' :
                    doc.status === 'expiring' ? 'bg-amber-100 text-amber-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {doc.status}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); doc?.id && setShowDeleteConfirm(doc.id); }}
                    disabled={deletingDocId === doc.id}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 transition-all disabled:opacity-50"
                    title="Delete document"
                  >
                    {deletingDocId === doc.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-400 border-t-transparent"></div>
                    ) : (
                      <Trash2 className="h-4 w-4" strokeWidth={2} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {recentDocuments.length === 0 && (
            <div className="p-8 sm:p-12 text-center">
              <div className="bg-slate-50 w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="h-8 w-8 sm:h-10 sm:w-10 text-slate-400" strokeWidth={2} />
              </div>
              <p className="text-slate-500 text-sm sm:text-base">No documents uploaded yet</p>
              <p className="text-slate-400 text-xs sm:text-sm mt-1">Upload your first document to get started</p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900 mb-4 sm:mb-5">Quick Actions</h2>
            <div className="space-y-3">
              <button
                onClick={onAddDocument}
                className="w-full flex items-center gap-3 p-3 sm:p-4 bg-gradient-to-br from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 border border-emerald-200 rounded-lg sm:rounded-xl transition-all text-left group"
              >
                <div className="bg-gradient-to-br from-emerald-600 to-teal-600 p-2 rounded-lg group-hover:scale-110 transition-transform">
                  <Upload className="h-4 w-4 sm:h-5 sm:w-5 text-white" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 text-sm sm:text-base">Upload Document</h3>
                  <p className="text-xs sm:text-sm text-slate-600 truncate">Add a new legal or financial document</p>
                </div>
              </button>

              <button
                onClick={() => onNavigate('vault')}
                className="w-full flex items-center gap-3 p-3 sm:p-4 bg-gradient-to-br from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 border border-amber-200 rounded-lg sm:rounded-xl transition-all text-left group"
              >
                <div className="bg-gradient-to-br from-amber-600 to-orange-600 p-2 rounded-lg group-hover:scale-110 transition-transform">
                  <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-white" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 text-sm sm:text-base">Check Expirations</h3>
                  <p className="text-xs sm:text-sm text-slate-600 truncate">View upcoming renewals and expirations</p>
                </div>
              </button>

              <button
                onClick={() => onNavigate('vault')}
                className="w-full flex items-center gap-3 p-3 sm:p-4 bg-gradient-to-br from-teal-50 to-cyan-50 hover:from-teal-100 hover:to-cyan-100 border border-teal-200 rounded-lg sm:rounded-xl transition-all text-left group"
              >
                <div className="bg-gradient-to-br from-teal-600 to-cyan-600 p-2 rounded-lg group-hover:scale-110 transition-transform">
                  <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-white" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 text-sm sm:text-base">Ask AI Assistant</h3>
                  <p className="text-xs sm:text-sm text-slate-600 truncate">Get instant answers about documents</p>
                </div>
              </button>
            </div>
          </div>

          {/* Alerts */}
          {expiringDocuments > 0 && safeDocuments.length > 0 && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl sm:rounded-2xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="bg-amber-100 p-1.5 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-amber-600" strokeWidth={2} />
                </div>
                <h3 className="font-semibold text-amber-900 text-sm sm:text-base">Attention Required</h3>
              </div>
              <p className="text-amber-800 mb-3 text-sm sm:text-base">
                You have {expiringDocuments} document{expiringDocuments !== 1 ? 's' : ''} expiring soon.
              </p>
              <button
                onClick={() => onNavigate('vault')}
                className="text-amber-700 hover:text-amber-800 font-medium text-sm inline-flex items-center gap-1 hover:gap-2 transition-all"
              >
                Review expiring documents
                <span>→</span>
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Today Feed - Engagement Engine */}
      <div className="mb-6 sm:mb-8">
        <TodayFeed
          onNavigateToDocument={(docId) => onViewDocument?.(docId)}
          onNavigateToAudit={() => onNavigate('audit')}
          onAddDocument={onAddDocument}
        />
      </div>

      {/* Subscription Card */}
      {subscription && (
        <div className="mb-6 sm:mb-8">
          <div className="bg-gradient-to-br from-slate-50 to-white border-2 border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${
                  subscription.plan === 'pro' ? 'bg-gradient-to-br from-emerald-100 to-teal-100' :
                  subscription.plan === 'starter' ? 'bg-gradient-to-br from-blue-100 to-cyan-100' :
                  'bg-slate-100'
                }`}>
                  {subscription.plan === 'pro' ? (
                    <Crown className="h-6 w-6 text-emerald-600" strokeWidth={2} />
                  ) : subscription.plan === 'starter' ? (
                    <Zap className="h-6 w-6 text-blue-600" strokeWidth={2} />
                  ) : (
                    <FileText className="h-6 w-6 text-slate-600" strokeWidth={2} />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 capitalize">
                    {subscription.plan} Plan
                  </h3>
                  <p className="text-sm text-slate-600">
                    {subscription.plan === 'free' ? 'Limited features' :
                     subscription.plan === 'pro' ? `${planDocLimit} documents · Unlimited AI · All features` :
                     `${planDocLimit} documents · Unlimited AI chats`}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:gap-4 w-full sm:w-auto sm:flex sm:items-center">
                <div className="flex-1 sm:flex-none">
                  <div className="text-xs sm:text-sm text-slate-600 mb-1">Documents</div>
                  <div className="text-sm sm:text-lg font-bold text-slate-900">
                    {documentCount} / {planDocLimit}
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                    <div
                      className="bg-gradient-to-r from-emerald-600 to-teal-600 h-1.5 rounded-full transition-all"
                      style={{
                        width: `${Math.min((documentCount / planDocLimit) * 100, 100)}%`
                      }}
                    />
                  </div>
                </div>
                <div className="flex-1 sm:flex-none">
                  <div className="text-xs sm:text-sm text-slate-600 mb-1">Uploads</div>
                  <div className="text-sm sm:text-lg font-bold text-slate-900">
                    {subscription.monthly_uploads_used ?? 0} / {subscription.monthly_upload_limit ?? 3}
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        ((subscription.monthly_uploads_used ?? 0) / (subscription.monthly_upload_limit ?? 3)) >= 0.9
                          ? 'bg-gradient-to-r from-red-500 to-orange-500'
                          : 'bg-gradient-to-r from-emerald-600 to-teal-600'
                      }`}
                      style={{
                        width: `${Math.min(((subscription.monthly_uploads_used ?? 0) / (subscription.monthly_upload_limit ?? 3)) * 100, 100)}%`
                      }}
                    />
                  </div>
                </div>
                <div className="flex-1 sm:flex-none">
                  <div className="text-xs sm:text-sm text-slate-600 mb-1">AI Questions</div>
                  <div className="text-sm sm:text-lg font-bold text-slate-900">
                    {subscription.ai_questions_used} / {subscription.plan !== 'free' ? '∞' : subscription.ai_questions_limit}
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                    <div
                      className="bg-gradient-to-r from-emerald-600 to-teal-600 h-1.5 rounded-full transition-all"
                      style={{
                        width: subscription.plan !== 'free'
                          ? '100%'
                          : `${Math.min((subscription.ai_questions_used / subscription.ai_questions_limit) * 100, 100)}%`
                      }}
                    />
                  </div>
                </div>
                {subscription.plan === 'free' && onUpgrade && (
                  <button
                    onClick={onUpgrade}
                    className="flex-shrink-0 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold py-2 px-4 rounded-lg transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-sm"
                  >
                    Upgrade
                  </button>
                )}
                {subscription.plan !== 'free' && onManageSubscription && (
                  <button
                    onClick={onManageSubscription}
                    className="flex-shrink-0 text-slate-600 hover:text-slate-900 font-medium text-sm transition-colors"
                  >
                    Manage Plan
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
  );
}

function DashboardSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <div className="h-7 sm:h-8 bg-slate-200 rounded w-32 sm:w-48 mb-2 animate-pulse"></div>
        <div className="h-4 bg-slate-200 rounded w-48 sm:w-96 animate-pulse"></div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-3 sm:h-4 bg-slate-200 rounded w-16 sm:w-24 mb-2 animate-pulse"></div>
                <div className="h-6 sm:h-8 bg-slate-200 rounded w-10 sm:w-16 animate-pulse"></div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-200 rounded-lg animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 sm:gap-8">
        <div className="h-80 sm:h-96 bg-white rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 animate-pulse"></div>
        <div className="h-80 sm:h-96 bg-white rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 animate-pulse"></div>
      </div>
    </div>
  );
}
