import api from './api.js';
import { PREMIUM_SAVE_MESSAGE } from '../constants/upgradeCopy.js';
import { sanitizeSavedMaterialTogglePayload } from '../utils/mongoId.js';
import { getActiveCacheUserId } from '../utils/authScopedCache.js';
import { focusRefetchDevLog } from '../utils/focusRefetchDevLog.js';
import { getCacheAgeMs, isCacheFresh } from '../utils/requestFreshness.js';

export { PREMIUM_SAVE_MESSAGE };

export const SAVED_MATERIALS_STALE_AFTER_MS = 45 * 1000;

let savedMaterialsCache = null;
let savedMaterialsInFlight = null;

function activeScopeKey() {
  return getActiveCacheUserId() || 'anon';
}

function getScopedSavedMaterialsCache() {
  if (savedMaterialsCache?.scopeKey !== activeScopeKey()) {
    return null;
  }
  return savedMaterialsCache;
}

function buildSavedMaterialsValue(payload) {
  return {
    savedPdfs: Array.isArray(payload?.savedPdfs) ? payload.savedPdfs : [],
    savedNotes: Array.isArray(payload?.savedNotes) ? payload.savedNotes : [],
  };
}

function setSavedMaterialsCacheEntry(value, fetchedAt = Date.now()) {
  savedMaterialsCache = {
    scopeKey: activeScopeKey(),
    fetchedAt,
    value: buildSavedMaterialsValue(value),
  };
  return savedMaterialsCache;
}

function applyToggleToCacheValue(value, clean, saved) {
  const current = buildSavedMaterialsValue(value);
  if (clean.materialType === 'pdf' && clean.pdfId) {
    const pdfId = String(clean.pdfId).trim();
    if (saved) return null;
    return {
      ...current,
      savedPdfs: current.savedPdfs.filter((item) => String(item?.pdfId || '').trim() !== pdfId),
    };
  }
  if (clean.materialType === 'note' && clean.noteId) {
    const noteId = String(clean.noteId).trim();
    if (saved) return null;
    return {
      ...current,
      savedNotes: current.savedNotes.filter((item) => String(item?.noteId || '').trim() !== noteId),
    };
  }
  return current;
}

async function fetchSavedMaterialsFresh() {
  const { data } = await api.get('/saved-materials');
  const entry = setSavedMaterialsCacheEntry(data?.data ?? {});
  focusRefetchDevLog('saved_materials_refresh_ok', {
    ageMs: getCacheAgeMs(entry.fetchedAt),
    notes: entry.value.savedNotes.length,
    pdfs: entry.value.savedPdfs.length,
  });
  return entry.value;
}

function ensureSavedMaterialsFetch(reason = 'refresh') {
  const scopeKey = activeScopeKey();
  if (savedMaterialsInFlight?.scopeKey === scopeKey) {
    focusRefetchDevLog('saved_materials_dedupe_reuse', { reason });
    return savedMaterialsInFlight.promise;
  }
  const promise = (async () => {
    try {
      focusRefetchDevLog('saved_materials_refresh_start', { reason });
      return await fetchSavedMaterialsFresh();
    } finally {
      if (savedMaterialsInFlight?.scopeKey === scopeKey) {
        savedMaterialsInFlight = null;
      }
    }
  })();
  savedMaterialsInFlight = { scopeKey, promise };
  return promise;
}

export function getSavedMaterialsSnapshot() {
  return getScopedSavedMaterialsCache()?.value ?? null;
}

export function isSavedMaterialsSnapshotFresh(
  staleAfterMs = SAVED_MATERIALS_STALE_AFTER_MS
) {
  const entry = getScopedSavedMaterialsCache();
  return Boolean(entry && isCacheFresh(entry.fetchedAt, staleAfterMs));
}

export function invalidateSavedMaterialsCache(reason = 'manual') {
  savedMaterialsCache = null;
  focusRefetchDevLog('saved_materials_invalidate', { reason });
}

export async function toggleSavedMaterial(payload, opts = {}) {
  const clean = sanitizeSavedMaterialTogglePayload(payload);
  if (!clean) {
    return { saved: false };
  }
  const { signal } = opts;
  const { data } = await api.post('/saved-materials/toggle', clean, { signal });
  const result = data?.data ?? { saved: false };
  const entry = getScopedSavedMaterialsCache();
  if (entry) {
    const nextValue = applyToggleToCacheValue(entry.value, clean, !!result?.saved);
    if (nextValue) {
      setSavedMaterialsCacheEntry(nextValue);
      focusRefetchDevLog('saved_materials_patch', {
        materialType: clean.materialType,
        saved: !!result?.saved,
      });
    } else {
      invalidateSavedMaterialsCache('toggle_saved_true');
    }
  } else {
    invalidateSavedMaterialsCache('toggle_without_snapshot');
  }
  return result;
}

export async function getSavedMaterials(opts = {}) {
  const {
    force = false,
    staleAfterMs = SAVED_MATERIALS_STALE_AFTER_MS,
    reason = 'read',
  } = opts;
  const entry = getScopedSavedMaterialsCache();
  if (!force && entry && isCacheFresh(entry.fetchedAt, staleAfterMs)) {
    focusRefetchDevLog('saved_materials_skip_fresh', {
      reason,
      ageMs: getCacheAgeMs(entry.fetchedAt),
    });
    return entry.value;
  }
  return ensureSavedMaterialsFetch(force ? `${reason}:force` : reason);
}
