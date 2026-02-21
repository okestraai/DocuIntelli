import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { APP_SCHEME } from '../lib/config';

/**
 * Deep linking is primarily handled by Expo Router automatically via file-based routing.
 * URLs like docuintelli://document/abc123 map to app/document/[id]/index.tsx.
 *
 * This service handles special non-route URLs like Stripe callbacks.
 */

export function handleDeepLink(url: string) {
  const parsed = Linking.parse(url);

  if (!parsed.path) return;

  // Handle Stripe checkout callbacks
  if (parsed.path === 'checkout/success') {
    // Stripe checkout completed — navigate to billing with success state
    router.replace('/billing');
    return;
  }

  if (parsed.path === 'checkout/cancel') {
    // Stripe checkout was cancelled — navigate to billing
    router.replace('/billing');
    return;
  }

  // Handle password reset
  if (parsed.path === 'reset-password') {
    const token = parsed.queryParams?.token as string | undefined;
    if (token) {
      router.push({ pathname: '/(auth)/forgot-password', params: { token } });
    }
    return;
  }

  // For all other deep links, Expo Router handles them automatically
}

export function setupDeepLinkListener() {
  // Listen for incoming deep links while app is running
  const subscription = Linking.addEventListener('url', ({ url }) => {
    handleDeepLink(url);
  });

  // Check if app was opened via deep link
  Linking.getInitialURL().then((url) => {
    if (url) {
      handleDeepLink(url);
    }
  });

  return () => {
    subscription.remove();
  };
}
