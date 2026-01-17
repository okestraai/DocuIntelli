import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { DocumentVault } from './components/DocumentVault';
import { DocumentChat } from './components/DocumentChat';
import { DocumentViewer } from './components/DocumentViewer';
import { ExpirationTracker } from './components/ExpirationTracker';
import { AuthModal } from './components/AuthModal';
import { UploadModal } from './components/UploadModal';
import { ProfileModal } from './components/ProfileModal';
import { NotificationsModal } from './components/NotificationsModal';
import { useDocuments } from './hooks/useDocuments';
import { DocumentUploadRequest } from './lib/api';
import { supabase, signOut } from './lib/supabase';
import { useFeedback } from './hooks/useFeedback';
import { ToastContainer } from './components/Toast';
import { ConfirmDialog } from './components/ConfirmDialog';

export type Page = 'landing' | 'dashboard' | 'vault' | 'tracker';

export interface Document {
  id: string;
  name: string;
  type: string;
  category: 'warranty' | 'insurance' | 'lease' | 'employment' | 'contract' | 'other';
  uploadDate: string;
  expirationDate?: string;
  size: string;
  status: 'active' | 'expiring' | 'expired';
  tags?: string[];
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { documents, uploadDocuments, deleteDocument } = useDocuments(isAuthenticated);
  const feedback = useFeedback();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile && !isAuthenticated && !isLoading && currentPage === 'landing') {
      setShowAuthModal(true);
    }
  }, [isMobile, isAuthenticated, isLoading, currentPage]);

  const expiringDocuments = useMemo(() => {
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));

    return documents.filter(doc => {
      if (!doc.expirationDate) return false;
      const expDate = new Date(doc.expirationDate);
      return expDate <= thirtyDaysFromNow;
    }).sort((a, b) => {
      if (!a.expirationDate || !b.expirationDate) return 0;
      return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
    });
  }, [documents]);

  // Check for existing session on app load
  useEffect(() => {
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setIsLoading(false);
        if (event === 'SIGNED_IN' && session?.user) {
          setIsAuthenticated(true);
          setShowAuthModal(false);
          setCurrentPage('dashboard');
        } else if (event === 'SIGNED_OUT') {
          setIsAuthenticated(false);
          setCurrentPage('landing');
          setSelectedDocument(null);
        } else if (event === 'INITIAL_SESSION') {
          if (session?.user) {
            setIsAuthenticated(true);
            setCurrentPage('dashboard');
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Show loading screen while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const handleAuth = () => {
    setIsAuthenticated(true);
    setShowAuthModal(false);
    setCurrentPage('dashboard');
  };

  const handleGetStarted = () => {
    setShowAuthModal(true);
  };

  const handleDocumentSelect = (doc: Document) => {
    setSelectedDocument(doc);
  };

  const handleDocumentView = (doc: Document) => {
    setViewingDocument(doc);
  };

  const handleBackToVault = () => {
    setSelectedDocument(null);
  };

  const handleBackFromViewer = () => {
    setViewingDocument(null);
  };

  const handleNavigate = (page: Page) => {
    // Clear any selected/viewing document states when navigating
    setSelectedDocument(null);
    setViewingDocument(null);
    setCurrentPage(page);
  };

  const handleDocumentsUploadNew = async (documentsData: DocumentUploadRequest[]) => {
    const loadingToastId = feedback.showLoading('Uploading documents...', 'Please wait while we process your files');
    try {
      await uploadDocuments(documentsData);
      feedback.removeToast(loadingToastId);
      feedback.showSuccess('Upload successful!', `${documentsData.length} document${documentsData.length !== 1 ? 's' : ''} uploaded successfully`);
      setShowUploadModal(false);
    } catch (error) {
      feedback.removeToast(loadingToastId);

      const errorMessage = error instanceof Error ? error.message : 'Failed to upload documents';

      if (errorMessage.includes('backend server')) {
        feedback.showError('Backend Server Not Running', 'Please start the backend: cd server && npm run dev', 10000);
      } else {
        feedback.showError('Upload failed', errorMessage, 8000);
      }

      console.error('Upload failed:', error);
    }
  };

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      feedback.showSuccess('Logged out successfully', 'You have been signed out of your account');
      setShowLogoutConfirm(false);
    } catch (error) {
      feedback.showError('Logout failed', error instanceof Error ? error.message : 'Failed to sign out');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const renderPage = () => {
    // Always show landing page if not authenticated
    if (!isAuthenticated) {
      return <LandingPage onGetStarted={handleGetStarted} onSignIn={handleGetStarted} />;
    }

    // Only show app UI if authenticated
    // Note: When in DocumentChat or DocumentViewer, header navigation still works
    // because the Header is always rendered when authenticated
    if (selectedDocument) {
      return (
        <DocumentChat
          document={selectedDocument}
          onBack={handleBackToVault}
        />
      );
    }

    if (viewingDocument) {
      return (
        <DocumentViewer
          document={viewingDocument}
          onBack={handleBackFromViewer}
        />
      );
    }

    switch (currentPage) {
      case 'dashboard':
        return (
          <ErrorBoundary>
            <Dashboard 
              documents={documents} 
              onNavigate={setCurrentPage}
              onAddDocument={() => setShowUploadModal(true)}
              onDocumentDelete={handleDocumentDelete}
              feedback={feedback}
            />
          </ErrorBoundary>
        );
      case 'vault':
        return (
          <ErrorBoundary>
            <DocumentVault
              documents={documents}
              onDocumentSelect={handleDocumentSelect}
              onDocumentView={handleDocumentView}
              onDocumentUpload={handleDocumentsUploadNew}
              onDocumentDelete={handleDocumentDelete}
              feedback={feedback}
            />
          </ErrorBoundary>
        );
      case 'tracker':
        return (
          <ErrorBoundary>
            <ExpirationTracker documents={documents} />
          </ErrorBoundary>
        );
      default:
        return (
          <ErrorBoundary>
            <Dashboard 
              documents={documents} 
              onNavigate={setCurrentPage}
              onAddDocument={() => setShowUploadModal(true)}
              onDocumentDelete={handleDocumentDelete}
              feedback={feedback}
            />
          </ErrorBoundary>
        );
    }
  };

  const handleDocumentDelete = async (documentId: string) => {
    try {
      const loadingToastId = feedback.showLoading('Deleting document...', 'Please wait while we remove the document');
      await deleteDocument(documentId);
      feedback.removeToast(loadingToastId);
      feedback.showSuccess('Document deleted', 'The document has been successfully removed');
    } catch (error) {
      feedback.showError('Delete failed', error instanceof Error ? error.message : 'Failed to delete document');
      console.error('Delete failed:', error);
    }
  };

  const handleSendNotifications = async () => {
    try {
      const documentIds = expiringDocuments.map(doc => doc.id);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-expiration-notifications`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ documentIds }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send notifications');
      }

      const result = await response.json();
      feedback.showSuccess('Email sent!', `Notification sent for ${result.documentsNotified} document(s)`);
    } catch (error) {
      console.error('Failed to send notifications:', error);
      feedback.showError('Failed to send email', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Only show header if authenticated */}
      {isAuthenticated && (
        <Header
          currentPage={currentPage}
          onNavigate={handleNavigate}
          onSignOut={() => setShowLogoutConfirm(true)}
          onOpenProfile={() => setShowProfileModal(true)}
          onOpenNotifications={() => setShowNotificationsModal(true)}
          notificationCount={expiringDocuments.length}
        />
      )}
      
      {renderPage()}

      {/* Only show auth modal if not authenticated */}
      {showAuthModal && !isAuthenticated && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onAuth={handleAuth}
        />
      )}

      {/* Only show upload modal if authenticated */}
      {showUploadModal && isAuthenticated && (
        <UploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onUpload={handleDocumentsUploadNew}
        />
      )}

      {/* Profile Modal */}
      {showProfileModal && isAuthenticated && (
        <ProfileModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {/* Notifications Modal */}
      {showNotificationsModal && isAuthenticated && (
        <NotificationsModal
          isOpen={showNotificationsModal}
          onClose={() => setShowNotificationsModal(false)}
          expiringDocuments={expiringDocuments}
          onSendNotifications={handleSendNotifications}
        />
      )}

      {/* Toast Container */}
      <ToastContainer toasts={feedback.toasts} onClose={feedback.removeToast} />

      {/* Logout Confirmation */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out of your account?"
        confirmText="Sign Out"
        cancelText="Cancel"
        confirmVariant="primary"
        isLoading={isLoggingOut}
        onConfirm={handleSignOut}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
}

export default App;