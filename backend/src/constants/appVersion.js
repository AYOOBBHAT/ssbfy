/**
 * Android app version policy — env-driven, never stored in Mongo.
 *
 * Defaults are fail-open for local/dev: minimum 1 and forceUpdate false so
 * unset production env cannot silently force every store build (e.g. 36).
 */

export const ANDROID_PACKAGE_ID = 'com.ayoobbhat.ssbfy';

export const ANDROID_PLAY_STORE_URL =
  `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`;

/** Safe default — never treat the current store build as the floor. */
export const DEFAULT_ANDROID_MINIMUM_VERSION_CODE = 1;

/** Informational latest only; not used as a force-update floor. */
export const DEFAULT_ANDROID_LATEST_VERSION_CODE = 36;

export const DEFAULT_ANDROID_FORCE_UPDATE = false;

export function parsePositiveVersionCode(raw, name) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return null;
  }
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return n;
}

export function parseForceUpdateFlag(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return null;
  }
  const s = String(raw).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  throw new Error('ANDROID_FORCE_UPDATE must be true or false');
}

export function isOfficialAndroidPlayStoreUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:') return false;
    if (u.hostname !== 'play.google.com') return false;
    if (u.pathname !== '/store/apps/details') return false;
    return u.searchParams.get('id') === ANDROID_PACKAGE_ID;
  } catch {
    return false;
  }
}

/**
 * Resolve Android version policy from raw env-like values.
 * Unset vars use safe defaults. Invalid or min > latest throws.
 *
 * @param {Record<string, string | undefined>} raw
 */
export function resolveAndroidVersionPolicy(raw = {}) {
  const minimumVersionCode =
    parsePositiveVersionCode(raw.ANDROID_MINIMUM_VERSION_CODE, 'ANDROID_MINIMUM_VERSION_CODE') ??
    DEFAULT_ANDROID_MINIMUM_VERSION_CODE;
  const latestVersionCode =
    parsePositiveVersionCode(raw.ANDROID_LATEST_VERSION_CODE, 'ANDROID_LATEST_VERSION_CODE') ??
    DEFAULT_ANDROID_LATEST_VERSION_CODE;
  const forceUpdate =
    parseForceUpdateFlag(raw.ANDROID_FORCE_UPDATE) ?? DEFAULT_ANDROID_FORCE_UPDATE;

  if (minimumVersionCode > latestVersionCode) {
    throw new Error(
      'ANDROID_MINIMUM_VERSION_CODE must not exceed ANDROID_LATEST_VERSION_CODE'
    );
  }

  return {
    minimumVersionCode,
    latestVersionCode,
    forceUpdate,
    playStoreUrl: ANDROID_PLAY_STORE_URL,
  };
}
