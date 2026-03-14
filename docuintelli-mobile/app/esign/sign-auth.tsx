import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SigningView from '../../src/components/esign/SigningView';

export default function AuthSigningScreen() {
  const { signerId } = useLocalSearchParams<{ signerId: string }>();
  const router = useRouter();

  return (
    <SigningView
      signerId={signerId}
      onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/vault')}
      onComplete={() => router.replace('/(tabs)/vault')}
    />
  );
}
