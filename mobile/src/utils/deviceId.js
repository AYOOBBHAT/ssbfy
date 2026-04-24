import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

const STORAGE_KEY = '@ssbfy/device_id_v1';

function buildFallbackId() {
  const suffix = Math.random().toString(36).slice(2, 12);
  return `gen_${Date.now().toString(36)}_${suffix}`;
}

/**
 * Returns a stable device identifier for free-tier enforcement.
 *
 * Strategy:
 *   1. Reuse value in AsyncStorage forever (survives restarts).
 *   2. On first launch, prefer a platform id when available:
 *        - Android: Application.androidId (scoped to app+device)
 *        - iOS:     Application.getIosIdForVendorAsync()
 *   3. If neither is available (Expo Go, simulator, etc.), persist a random
 *      generated id — still stable until app data is cleared.
 *
 * Prefixes (`and:`, `ios:`, `gen:`) keep sources obvious in support logs.
 */
export async function getDeviceId() {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    if (cached && cached.length >= 4) {
      return cached;
    }

    let candidate = null;
    if (Platform.OS === 'android') {
      const aid = Application.androidId;
      if (aid && String(aid).trim().length >= 4) {
        candidate = `and:${String(aid).trim()}`;
      }
    } else if (Platform.OS === 'ios') {
      const iv = await Application.getIosIdForVendorAsync();
      if (iv && String(iv).trim().length >= 4) {
        candidate = `ios:${String(iv).trim()}`;
      }
    }

    const next = candidate && candidate.length >= 4 ? candidate : buildFallbackId();
    await AsyncStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    const fallback = buildFallbackId();
    try {
      await AsyncStorage.setItem(STORAGE_KEY, fallback);
    } catch {
      // last resort — unstable across restarts but still allows the session
    }
    return fallback;
  }
}
