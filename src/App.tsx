import React, { useState } from 'react';
import { useEffect } from 'react';
import { Header } from './components/Header';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { DocumentVault } from './components/DocumentVault';
import { DocumentChat } from './components/DocumentChat';
import { ExpirationTracker } from './components/ExpirationTracker';
import { AuthModal } from './components/AuthModal';
import { UploadModal } from './components/UploadModal';
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
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { documents, loading, error, uploadDocuments, deleteDocument } = useDocuments();
  const feedback = useFeedback();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Check for existing session on app load
  useEffect(() => {
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setIsLoading(false);
        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          setIsAuthenticated(true);
          setShowAuthModal(false);
          setCurrentPage('dashboard');
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setIsAuthenticated(false);
          setCurrentPage('landing');
          setSelectedDocument(null);
        } else if (event === 'INITIAL_SESSION') {
          if (session?.user) {
            setUser(session.user);
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

  const handleAuth = (authUser: any) => {
    setUser(authUser);
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

  const handleBackToVault = () => {
    setSelectedDocument(null);
  };

  const handleDocumentUpload = (documentData: Partial<Document>) => {
    // In a real app, this would upload to a server and update the documents list
    console.log('Document uploaded:', documentData);
    setShowUploadModal(false);
  };

  const handleDocumentsUpload = (documentsData: Partial<Document>[]) => {
    // In a real app, this would upload to a server and update the documents list
    console.log('Documents uploaded:', documentsData);
    setShowUploadModal(false);
  };

  const handleDocumentsUploadNew = async (documentsData: DocumentUploadRequest[]) => {
    try {
      const loadingToastId = feedback.showLoading('Uploading documents...', 'Please wait while we process your files');
      await uploadDocuments(documentsData);
      feedback.removeToast(loadingToastId);
      feedback.showSuccess('Upload successful!', `${documentsData.length} document${documentsData.length !== 1 ? 's' : ''} uploaded successfully`);
      setShowUploadModal(false);
    } catch (error) {
      feedback.showError('Upload failed', error instanceof Error ? error.message : 'Failed to upload documents');
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
      return <LandingPage onGetStarted={handleGetStarted} />;
    }

    // Only show app UI if authenticated
    if (selectedDocument) {
      return (
        <DocumentChat
          document={selectedDocument}
          onBack={handleBackToVault}
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Only show header if authenticated */}
      {isAuthenticated && (
        <Header
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          onSignOut={() => setShowLogoutConfirm(true)}
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