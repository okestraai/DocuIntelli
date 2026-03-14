import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SignatureRequestBuilder from '../../src/components/esign/SignatureRequestBuilder';
import { useAuth } from '../../src/hooks/useAuth';

export default function CreateSignatureRequestScreen() {
  const { documentId, documentName, pdfUrl } = useLocalSearchParams<{
    documentId: string;
    documentName: string;
    pdfUrl: string;
  }>();
  const router = useRouter();
  const { user } = useAuth();

  if (!documentId || !documentName || !pdfUrl) {
    return null;
  }

  return (
    <SignatureRequestBuilder
      documentId={documentId}
      documentName={documentName}
      pdfUrl={pdfUrl}
      userEmail={user?.email}
      userName={user?.user_metadata?.full_name || user?.email?.split('@')[0]}
      onClose={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/vault')}
      onSuccess={() => router.replace('/(tabs)/vault')}
    />
  );
}
