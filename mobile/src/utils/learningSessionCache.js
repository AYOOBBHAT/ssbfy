import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@ssbfy/learning_session_cache_v1';
const MAX_ENTRIES = 20;
/** Per-entry cap — AsyncStorage ~6MB total on some devices; stay conservative. */
const MAX_ENTRY_BYTES = 400_000;
/** Drop entries older than this (OS may evict sooner). */
const TTL_MS = 90 * 24 * 60 * 60 * 1000;

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

  try {
    const store = await readStore();
    store[id] = { savedAt: Date.now(), payload: normalized, bytes };
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
  try {
    const store = await readStore();
    const row = store[id];
    if (!row?.payload || typeof row.payload !== 'object') return null;
    const savedAt = Number(row.savedAt) || 0;
    if (!savedAt || Date.now() - savedAt > TTL_MS) return null;
    return normalizeLearningSessionCachePayload(row.payload);
  } catch {
    return null;
  }
}
