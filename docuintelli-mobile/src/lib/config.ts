import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Hardcoded fallback values from app.json — used when Constants.expoConfig is
// unavailable (common on Expo Web where the config resolution can fail silently).
const FALLBACK_EXTRA = {
  supabaseUrl: 'https://caygpjhiakabaxtklnlw.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNheWdwamhpYWthYmF4dGtsbmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNzMzMTQsImV4cCI6MjA3MTY0OTMxNH0.UYaF1hW_j2HGcFP5W1FMV_G7ODGJuz8qieyf9Qe4Z90',
  apiBase: 'https://app.docuintelli.com',
  stripeStarterPriceId: 'price_1SzmJJC1d2bwLolG6IatDmAT',
  stripeProPriceId: 'price_1SzmGgC1d2bwLolGhBHMtuFZ',
};

const extra = Constants.expoConfig?.extra ?? FALLBACK_EXTRA;

export const SUPABASE_URL = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? FALLBACK_EXTRA.supabaseUrl;
export const SUPABASE_ANON_KEY = extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? FALLBACK_EXTRA.supabaseAnonKey;

// Use the configured API base from app.json extra, falling back to env var or localhost.
// On web through a tunnel, localhost won't work from a phone — use production URL.
const configuredApiBase = extra.apiBase ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? FALLBACK_EXTRA.apiBase;
export const API_BASE = Platform.OS === 'web'
  ? (process.env.EXPO_PUBLIC_API_BASE_URL || configuredApiBase || 'http://localhost:5000')
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

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Missing Supabase environment variables — check app.json extra or .env');
}
