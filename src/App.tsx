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
      await uploadDocuments(documentsData);
      setShowUploadModal(false);
    } catch (error) {
      console.error('Upload failed:', error);
      // Handle error - could show a toast notification
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
            />
          </ErrorBoundary>
        );
    }
  };

  const handleDocumentDelete = async (documentId: string) => {
    try {
      await deleteDocument(documentId);
    } catch (error) {
      console.error('Delete failed:', error);
      // Could show error toast notification here
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Only show header if authenticated */}
      {isAuthenticated && (
        <Header
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          onSignOut={async () => {
            try {
              await signOut();
              // Auth state change listener will handle the rest
            } catch (error) {
              console.error('Sign out failed:', error);
            }
          }}
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
    </div>
  );
}

export default App;