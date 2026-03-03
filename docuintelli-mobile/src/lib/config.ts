import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Hardcoded fallback values from app.json — used when Constants.expoConfig is
// unavailable (common on Expo Web where the config resolution can fail silently).
const FALLBACK_EXTRA = {
  apiBase: 'https://docuintelli.com',
  stripeStarterPriceId: 'price_1SzmJJC1d2bwLolG6IatDmAT',
  stripeProPriceId: 'price_1SzmGgC1d2bwLolGhBHMtuFZ',
};

const extra = Constants.expoConfig?.extra ?? FALLBACK_EXTRA;

// Use the configured API base from app.json extra, falling back to env var or localhost.
// In dev: web uses localhost, native (Expo Go via tunnel) uses production URL.
// In prod: always use the configured production URL.
const configuredApiBase = extra.apiBase ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? FALLBACK_EXTRA.apiBase;
export const API_BASE = __DEV__ && Platform.OS === 'web'
  ? (process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:5000')
  : configuredApiBase;

export const STRIPE_STARTER_PRICE_ID = extra.stripeStarterPriceId ?? process.env.EXPO_PUBLIC_STRIPE_STARTER_PRICE_ID ?? FALLBACK_EXTRA.stripeStarterPriceId;
export const STRIPE_PRO_PRICE_ID = extra.stripeProPriceId ?? process.env.EXPO_PUBLIC_STRIPE_PRO_PRICE_ID ?? FALLBACK_EXTRA.stripeProPriceId;

// Deep link scheme for Stripe callbacks, password reset, etc.
export const APP_SCHEME = 'docuintelli';

if (__DEV__) {
  const usingFallback = !Constants.expoConfig?.extra;
  console.log('[config] source:', usingFallback ? 'FALLBACK_EXTRA (Constants.expoConfig is null)' : 'Constants.expoConfig');
  console.log('[config] STRIPE_STARTER_PRICE_ID:', STRIPE_STARTER_PRICE_ID);
  console.log('[config] STRIPE_PRO_PRICE_ID:', STRIPE_PRO_PRICE_ID);
}
