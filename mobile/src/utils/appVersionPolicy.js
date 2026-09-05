import { ANDROID_PACKAGE_ID, PLAY_STORE_URL } from '../constants/appVersion';

export function parseVersionCode(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function isOfficialPlayStoreUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname !== 'play.google.com') return false;
    if (parsed.pathname !== '/store/apps/details') return false;
    return parsed.searchParams.get('id') === ANDROID_PACKAGE_ID;
  } catch {
    return false;
  }
}

export function resolvePlayStoreUrl(candidate) {
  return isOfficialPlayStoreUrl(candidate) ? String(candidate).trim() : PLAY_STORE_URL;
}

/**
 * Accepts Axios `{ data: { success, data: { android } } }` or a bare `{ android }`.
 * Returns null when the payload is not a valid policy (caller must fail open).
 */
export function parseAndroidPolicy(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const android = payload.data?.android ?? payload.android;
  if (!android || typeof android !== 'object') return null;

  const minimumVersionCode = parseVersionCode(android.minimumVersionCode);
  const latestVersionCode = parseVersionCode(android.latestVersionCode);
  if (minimumVersionCode == null || latestVersionCode == null) return null;
  if (minimumVersionCode > latestVersionCode) return null;
  if (typeof android.forceUpdate !== 'boolean') return null;

  return {
    minimumVersionCode,
    latestVersionCode,
    forceUpdate: android.forceUpdate,
    playStoreUrl: resolvePlayStoreUrl(android.playStoreUrl),
  };
}

export function shouldForceAndroidUpdate(installedVersionCode, policy) {
  if (!policy || policy.forceUpdate !== true) return false;
  const installed = parseVersionCode(installedVersionCode);
  if (installed == null) return false;
  return installed < policy.minimumVersionCode;
}
