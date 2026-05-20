import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getActiveCacheUserId,
  getAuthCacheSessionGeneration,
  sensitiveScopedStorageKey,
  SENSITIVE_CACHE_KIND,
} from './authScopedCache';
import logger from './logger';

const MAX_ENTRIES = 20;
/** Per-entry cap — AsyncStorage ~6MB total on some devices; stay conservative. */
const MAX_ENTRY_BYTES = 400_000;
/** Drop entries older than this (OS may evict sooner). */
const TTL_MS = 90 * 24 * 60 * 60 * 1000;

function storageKey() {
  const uid = getActiveCacheUserId();
  return uid ? sensitiveScopedStorageKey(SENSITIVE_CACHE_KIND.LEARNING_SESSION_CACHE, uid) : null;
}

function estimateJsonBytes(value) {
  try {
    const json = JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(json).length;
    }
    return json.length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

async function readStore() {
  const KEY = storageKey();
  if (!KEY) {
    if (__DEV__) {
      logger.debug('[learningSessionCache] read skipped — no active cache user');
    }
    return {};
  }
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function pruneStore(store, now = Date.now()) {
  const entries = Object.entries(store).filter(([, row]) => {
    const savedAt = Number(row?.savedAt) || 0;
    return savedAt > 0 && now - savedAt < TTL_MS;
  });
  entries.sort((a, b) => (Number(a[1]?.savedAt) || 0) - (Number(b[1]?.savedAt) || 0));
  const kept = entries.slice(-MAX_ENTRIES);
  return Object.fromEntries(kept);
}

async function writeStore(store) {
  const KEY = storageKey();
  if (!KEY) return;
  try {
    const pruned = pruneStore(store);
    await AsyncStorage.setItem(KEY, JSON.stringify(pruned));
  } catch {
    // AsyncStorage full / eviction — offline reopen falls back to API when online.
  }
}

/**
 * Normalize API or navigation payload for cache + hydration.
 * @param {object} payload
 */
export function normalizeLearningSessionCachePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const learningSessionId =
    payload.learningSessionId != null ? String(payload.learningSessionId) : null;
  if (!learningSessionId) return null;
  return {
    ...payload,
    learningSessionId,
    immutableAttemptSnapshot: payload.immutableAttemptSnapshot !== false,
    practiceRevealed: payload.practiceRevealed !== false,
  };
}

/**
 * Cache Result-view payload for offline historical reopen (best-effort).
 * @param {string} sessionId
 * @param {object} payload
 */
export async function putLearningSessionCache(sessionId, payload) {
  const id = String(sessionId ?? '').trim();
  const normalized = normalizeLearningSessionCachePayload(payload);
  if (!id || !normalized) return;

  const bytes = estimateJsonBytes(normalized);
  if (bytes > MAX_ENTRY_BYTES) return;

  if (!storageKey()) {
    if (__DEV__) {
      logger.debug('[learningSessionCache] put skipped — no active cache user', {
        sessionSuffix: id.slice(-8),
      });
    }
    return;
  }

  try {
    const store = await readStore();
    store[id] = {
      savedAt: Date.now(),
      payload: normalized,
      bytes,
      cacheSessionGen: getAuthCacheSessionGeneration(),
    };
    await writeStore(store);
  } catch {
    // ignore — API remains source of truth cross-device
  }
}

/**
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
export async function getLearningSessionCache(sessionId) {
  const id = String(sessionId ?? '').trim();
  if (!id) return null;
  if (!storageKey()) return null;
  try {
    const store = await readStore();
    const row = store[id];
    if (!row?.payload || typeof row.payload !== 'object') return null;
    const savedAt = Number(row.savedAt) || 0;
    if (!savedAt || Date.now() - savedAt > TTL_MS) return null;
    const gen = getAuthCacheSessionGeneration();
    const cachedGen = Number(row.cacheSessionGen);
    if (Number.isFinite(cachedGen) && cachedGen !== gen) {
      if (__DEV__) {
        logger.debug('[learningSessionCache] stale generation — treating as miss', {
          sessionSuffix: id.slice(-8),
          cachedGen,
          currentGen: gen,
        });
      }
      return null;
    }
    return normalizeLearningSessionCachePayload(row.payload);
  } catch {
    return null;
  }
}

/**
 * Remove a single cached session (corrupt / unsupported / retry refresh).
 * @param {string} sessionId
 * @returns {Promise<boolean>} true when an entry was removed
 */
export async function removeLearningSessionCache(sessionId) {
  const id = String(sessionId ?? '').trim();
  if (!id) return false;
  const KEY = storageKey();
  if (!KEY) return false;
  try {
    const store = await readStore();
    if (!store[id]) return false;
    delete store[id];
    await writeStore(store);
    return true;
  } catch {
    return false;
  }
}
