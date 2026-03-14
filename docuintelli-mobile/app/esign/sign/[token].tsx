import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SigningView from '../../../src/components/esign/SigningView';

export default function TokenSigningScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();

  return (
    <SigningView
      token={token}
      onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/vault')}
      onComplete={() => router.replace('/(tabs)/vault')}
    />
  );
}
