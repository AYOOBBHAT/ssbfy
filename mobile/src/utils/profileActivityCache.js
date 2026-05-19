import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@ssbfy/profile_activity_v1';
const TTL_MS = 45 * 1000;

/**
 * @returns {Promise<{ practice: object[], mocks: object[], savedAt: number } | null>}
 */
export async function getProfileActivityCache() {
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

/** Drop cached recent activity (e.g. after mock / practice / retry completes). */
export async function clearProfileActivityCache() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}
