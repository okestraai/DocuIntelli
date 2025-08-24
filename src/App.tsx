import React, { useState } from 'react';
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
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const { documents, loading, error, uploadDocuments } = useDocuments();


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
          onSignOut={() => {
            setIsAuthenticated(false);
            setCurrentPage('landing');
            setSelectedDocument(null);
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