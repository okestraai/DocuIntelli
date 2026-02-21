import { router } from 'expo-router';

/**
 * Safe back navigation that falls back to a target route
 * when there's no history (e.g. page refresh on web, direct URL).
 */
export function goBack(fallback = '/(tabs)/dashboard') {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback as any);
  }
}
