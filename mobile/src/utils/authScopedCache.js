import AsyncStorage from '@react-native-async-storage/async-storage';
import logger from './logger';

/**
 * Central registry for user-bound sensitive AsyncStorage namespaces.
 * Public/taxonomy/device caches stay outside this module.
 */
export const SENSITIVE_CACHE_KIND = {
  PROFILE_ANALYTICS: 'profile_analytics_v1',
  ANALYTICS_OVERVIEW: 'analytics_overview_v1',
  PROFILE_ACTIVITY: 'profile_activity_v1',
  LEARNING_SESSION_CACHE: 'learning_session_cache_v1',
  REVEAL_RECEIPTS: 'learning_session_reveal_receipts_v1',
  OPEN_TEST_ATTEMPTS: 'open_test_attempts_v1',
};

const KEY_ROOT = '@ssbfy/cache';

/** Exact legacy keys (pre user-scope) — removed on logout to prevent cross-account reads. */
export const LEGACY_SENSITIVE_ASYNC_KEYS = [
  '@ssbfy/profile_analytics_v1',
  '@ssbfy/analytics_overview_v1',
  '@ssbfy/profile_activity_v1',
  '@ssbfy/learning_session_cache_v1',
  '@ssbfy/learning_session_reveal_receipts_v1',
  'ssbfy:openTestAttempts:v1',
];

/** Test draft keys: `...v2:<testId>` (legacy) or `...v2:u_<userId>:<testId>` or `...v2:anon:<testId>`. */
const DRAFT_V2_PREFIX = 'ssbfy:test_attempt_draft:v2:';

let activeCacheUserId = null;
let authCacheSessionGeneration = 0;

function normalizeUserId(userId) {
  if (userId == null) return null;
  const s = String(userId).trim();
  return s.length ? s : null;
}

/**
 * Synchronous ref for the account whose scoped cache keys are active.
 * Set from AuthProvider on user/token changes; cleared synchronously on logout before storage cleanup.
 */
export function setActiveCacheUserId(userId) {
  const next = normalizeUserId(userId);
  const prev = activeCacheUserId;
  if (prev === next) return;
  activeCacheUserId = next;
  // New logged-in account: reset generation so persisted scoped rows (written at gen 0)
  // stay valid after logout bumps invalidated in-flight work only.
  if (next != null) {
    authCacheSessionGeneration = 0;
  }
  if (__DEV__) {
    logger.debug('[auth-scoped-cache] setActiveCacheUserId', {
      prevSuffix: prev ? String(prev).slice(-8) : null,
      nextSuffix: next ? String(next).slice(-8) : null,
      generation: authCacheSessionGeneration,
    });
  }
}

export function getActiveCacheUserId() {
  return activeCacheUserId;
}

/** Bump on logout so optional callers can drop stale async results. */
export function bumpAuthCacheSessionGeneration() {
  authCacheSessionGeneration += 1;
  if (__DEV__) {
    logger.debug('[auth-scoped-cache] session generation bump', {
      generation: authCacheSessionGeneration,
    });
  }
  return authCacheSessionGeneration;
}

export function getAuthCacheSessionGeneration() {
  return authCacheSessionGeneration;
}

/**
 * @param {string} kind — use `SENSITIVE_CACHE_KIND.*`
 * @param {string|null|undefined} [userId] — defaults to active cache user
 * @returns {string|null}
 */
export function sensitiveScopedStorageKey(kind, userId = activeCacheUserId) {
  const uid = normalizeUserId(userId);
  if (!uid) return null;
  return `${KEY_ROOT}:${kind}:u_${uid}`;
}

async function removeKeys(keys) {
  const list = (keys || []).filter(Boolean);
  if (!list.length) return;
  try {
    await AsyncStorage.multiRemove(list);
  } catch {
    for (const k of list) {
      try {
        await AsyncStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function removeLegacySensitiveAsyncKeys() {
  if (__DEV__) {
    logger.debug('[auth-scoped-cache] removeLegacySensitiveAsyncKeys', {
      count: LEGACY_SENSITIVE_ASYNC_KEYS.length,
    });
  }
  await removeKeys(LEGACY_SENSITIVE_ASYNC_KEYS);
}

/** Remove all scoped keys for one user id (logout or account switch). */
export async function clearSensitiveScopedKeysForUser(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return;
  const keys = Object.values(SENSITIVE_CACHE_KIND).map((k) => sensitiveScopedStorageKey(k, uid));
  if (__DEV__) {
    logger.debug('[auth-scoped-cache] clearSensitiveScopedKeysForUser', {
      userIdSuffix: uid.slice(-8),
      keyCount: keys.length,
    });
  }
  await removeKeys(keys);
}

/** Test attempt drafts: legacy `v2:<testId>`, scoped `v2:u_<uid>:<testId>`, or logged-out `v2:anon:`. */
export async function clearTestAttemptDraftKeysForUser(userId) {
  const uid = normalizeUserId(userId);
  try {
    const all = await AsyncStorage.getAllKeys();
    const toRemove = all.filter((k) => {
      if (!k.startsWith(DRAFT_V2_PREFIX)) return false;
      const rest = k.slice(DRAFT_V2_PREFIX.length);
      if (!rest.startsWith('u_') && !rest.startsWith('anon:')) return true;
      if (rest.startsWith('anon:')) return true;
      if (!uid) return false;
      return rest.startsWith(`u_${uid}:`);
    });
    if (toRemove.length) await removeKeys(toRemove);
  } catch {
    /* ignore */
  }
}

/**
 * Logout invalidation: bump session gen (stale async cannot apply), remove legacy global
 * keys (pre-scope cross-account risk), clear drafts for the leaving user / anon.
 * Scoped per-user stores are kept on disk so the same account can reuse offline cache later.
 * Does not call AsyncStorage.clear().
 */
export async function invalidateSensitiveCachesOnLogout(previousUserId) {
  bumpAuthCacheSessionGeneration();
  const prev = normalizeUserId(previousUserId);
  if (__DEV__) {
    logger.debug('[auth-scoped-cache] invalidateSensitiveCachesOnLogout', {
      prevSuffix: prev ? prev.slice(-8) : null,
    });
  }
  await removeLegacySensitiveAsyncKeys();
  await clearTestAttemptDraftKeysForUser(prev);
}
