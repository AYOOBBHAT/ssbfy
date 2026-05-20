import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getActiveCacheUserId,
  sensitiveScopedStorageKey,
  SENSITIVE_CACHE_KIND,
} from './authScopedCache';

/**
 * Invalidate Profile-related caches after a session successfully completes.
 * Call on mock submit, practice reveal, daily practice, and retry finish —
 * not on TTL alone — so Profile shows fresh activity on next visit.
 */
export async function invalidateProfileCachesAfterSessionComplete() {
  const uid = getActiveCacheUserId();
  if (!uid) return;
  const keys = [
    sensitiveScopedStorageKey(SENSITIVE_CACHE_KIND.PROFILE_ACTIVITY, uid),
    sensitiveScopedStorageKey(SENSITIVE_CACHE_KIND.PROFILE_ANALYTICS, uid),
    sensitiveScopedStorageKey(SENSITIVE_CACHE_KIND.ANALYTICS_OVERVIEW, uid),
  ].filter(Boolean);
  await Promise.all(keys.map((k) => AsyncStorage.removeItem(k)));
}
