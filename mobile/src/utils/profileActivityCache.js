import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getActiveCacheUserId,
  sensitiveScopedStorageKey,
  SENSITIVE_CACHE_KIND,
} from './authScopedCache';

const TTL_MS = 45 * 1000;

function storageKey() {
  const uid = getActiveCacheUserId();
  return uid ? sensitiveScopedStorageKey(SENSITIVE_CACHE_KIND.PROFILE_ACTIVITY, uid) : null;
}

/**
 * @returns {Promise<{ practice: object[], mocks: object[], savedAt: number } | null>}
 */
export async function getProfileActivityCache() {
  const KEY = storageKey();
  if (!KEY) return null;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt) || 0;
    if (!savedAt || Date.now() - savedAt > TTL_MS) return null;
    return {
      practice: Array.isArray(parsed.practice) ? parsed.practice : [],
      mocks: Array.isArray(parsed.mocks) ? parsed.mocks : [],
      savedAt,
    };
  } catch {
    return null;
  }
}

/**
 * @param {{ practice: object[], mocks: object[] }} payload
 */
export async function putProfileActivityCache(payload) {
  const KEY = storageKey();
  if (!KEY) return;
  if (!payload || typeof payload !== 'object') return;
  try {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        savedAt: Date.now(),
        practice: Array.isArray(payload.practice) ? payload.practice : [],
        mocks: Array.isArray(payload.mocks) ? payload.mocks : [],
      })
    );
  } catch {
    // best-effort
  }
}

/** Drop cached recent activity (e.g. after mock / practice / retry completes) for the active user. */
export async function clearProfileActivityCache() {
  const KEY = storageKey();
  if (!KEY) return;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}
