import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@ssbfy/profile_analytics_v1';
const TTL_MS = 60 * 1000;

/**
 * @returns {Promise<{ payload: object, savedAt: number } | null>}
 */
export async function getProfileAnalyticsCache() {
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

/** Drop cached profile analytics (stats + recent mock attempts). */
export async function clearProfileAnalyticsCache() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}
