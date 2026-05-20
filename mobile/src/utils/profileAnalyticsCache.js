import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getActiveCacheUserId,
  sensitiveScopedStorageKey,
  SENSITIVE_CACHE_KIND,
} from './authScopedCache';

const TTL_MS = 60 * 1000;

function storageKey() {
  const uid = getActiveCacheUserId();
  return uid ? sensitiveScopedStorageKey(SENSITIVE_CACHE_KIND.PROFILE_ANALYTICS, uid) : null;
}

/**
 * @returns {Promise<{ payload: object, savedAt: number } | null>}
 */
export async function getProfileAnalyticsCache() {
  const KEY = storageKey();
  if (!KEY) return null;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.payload || typeof parsed.payload !== 'object') return null;
    const savedAt = Number(parsed.savedAt) || 0;
    if (!savedAt || Date.now() - savedAt > TTL_MS) return null;
    return { payload: parsed.payload, savedAt };
  } catch {
    return null;
  }
}

/**
 * @param {object} payload
 */
export async function putProfileAnalyticsCache(payload) {
  const KEY = storageKey();
  if (!KEY) return;
  if (!payload || typeof payload !== 'object') return;
  try {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ savedAt: Date.now(), payload })
    );
  } catch {
    // best-effort
  }
}

/** Drop cached profile analytics (stats + recent mock attempts) for the active user. */
export async function clearProfileAnalyticsCache() {
  const KEY = storageKey();
  if (!KEY) return;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}
