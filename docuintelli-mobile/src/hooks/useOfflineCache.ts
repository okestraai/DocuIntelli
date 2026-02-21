import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'docuintelli_cache_';
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export function useOfflineCache() {
  const cacheData = useCallback(async <T>(key: string, data: T, ttl: number = DEFAULT_TTL) => {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl,
      };
      await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
    } catch (error) {
      console.error('Failed to cache data:', error);
    }
  }, []);

  const getCachedData = useCallback(async <T>(key: string): Promise<T | null> => {
    try {
      const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (!raw) return null;

      const entry: CacheEntry<T> = JSON.parse(raw);
      const isExpired = Date.now() - entry.timestamp > entry.ttl;

      if (isExpired) {
        // Clean up expired cache
        await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
        return null;
      }

      return entry.data;
    } catch (error) {
      console.error('Failed to read cache:', error);
      return null;
    }
  }, []);

  const clearCache = useCallback(async (key?: string) => {
    try {
      if (key) {
        await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
      } else {
        // Clear all cache entries
        const allKeys = await AsyncStorage.getAllKeys();
        const cacheKeys = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));
        if (cacheKeys.length > 0) {
          await AsyncStorage.multiRemove(cacheKeys);
        }
      }
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }, []);

  return { cacheData, getCachedData, clearCache };
}
