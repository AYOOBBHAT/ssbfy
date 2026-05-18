import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@ssbfy/analytics_overview_v1';
const TTL_MS = 6 * 60 * 60 * 1000;

/**
 * @returns {Promise<{ payload: object, savedAt: number } | null>}
 */
export async function getAnalyticsOverviewCache() {
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
export async function putAnalyticsOverviewCache(payload) {
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
