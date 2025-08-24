import React, { useState } from 'react';
import { useEffect } from 'react';
import { Header } from './components/Header';
import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { DocumentVault } from './components/DocumentVault';
import { DocumentChat } from './components/DocumentChat';
import { ExpirationTracker } from './components/ExpirationTracker';
import { AuthModal } from './components/AuthModal';
import { UploadModal } from './components/UploadModal';
import { useDocuments } from './hooks/useDocuments';
import { DocumentUploadRequest } from './lib/api';
import { supabase, getCurrentUser, signOut } from './lib/supabase';

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
  const { documents, loading, error, uploadDocuments } = useDocuments();

  // Check for existing session on app load
  useEffect(() => {
    const checkSession = async () => {
      try {
        const currentUser = await getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          setIsAuthenticated(true);
          setCurrentPage('dashboard');
        }
      } catch (error) {
        console.error('Session check failed:', error);
      }
    };

    checkSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
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
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

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
    if (!isAuthenticated) {
      return <LandingPage onGetStarted={handleGetStarted} />;
    }

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
          <Dashboard 
            documents={documents} 
            onNavigate={setCurrentPage}
            onAddDocument={() => setShowUploadModal(true)}
          />
        );
      case 'vault':
        return (
          <DocumentVault
            documents={documents}
            onDocumentSelect={handleDocumentSelect}
          />
        );
      case 'tracker':
        return <ExpirationTracker documents={documents} />;
      default:
        return (
          <Dashboard 
            documents={documents} 
            onNavigate={setCurrentPage}
            onAddDocument={() => setShowUploadModal(true)}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
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

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onAuth={handleAuth}
        />
      )}

      {showUploadModal && (
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