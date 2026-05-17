/**
 * Mock-test quota messaging — single source for remaining/exhausted copy.
 * Backend enforcement unchanged; this module is UX-only.
 */

export const MOCK_LIMIT_CTA = 'See plans';

/** @typedef {'neutral' | 'emphasis' | 'exhausted'} QuotaTone */

/**
 * @param {{ unlimited?: boolean, remaining?: number, limit?: number, exhausted?: boolean } | null | undefined} quota
 * @returns {boolean}
 */
export function isQuotaExhausted(quota) {
  if (!quota || quota.unlimited) return false;
  if (quota.exhausted === true) return true;
  return Number(quota.remaining) === 0;
}

/**
 * @param {{ unlimited?: boolean, remaining?: number } | null | undefined} quota
 * @returns {{ line: string, tone: QuotaTone } | null}
 */
export function getQuotaStatusLine(quota) {
  if (!quota || quota.unlimited) return null;
  const remaining = Math.max(0, Number(quota.remaining) || 0);
  if (remaining >= 2) {
    return {
      line: `${remaining} free mock tests remaining on this device`,
      tone: 'neutral',
    };
  }
  if (remaining === 1) {
    return {
      line: 'Last free mock available on this device',
      tone: 'emphasis',
    };
  }
  return {
    line: 'Free mock quota used on this device',
    tone: 'exhausted',
  };
}

export const MOCK_EXHAUSTED_TITLE = 'Free mock quota used';
export const MOCK_EXHAUSTED_LEAD =
  'You’ve used the included full mock tests on this device. You can keep studying with the free tools below.';

export const MOCK_STILL_FREE_TITLE = 'Still free on SSBFY';
export const MOCK_STILL_FREE_ITEMS = [
  'Daily practice (10 questions)',
  'Topic and smart practice',
  'Practice missed questions after a mock',
];

export const MOCK_EXHAUSTED_PREMIUM_LINE =
  'Premium unlocks unlimited full mocks and retries on this device.';

/** Short line for Profile / Home mock section */
export function getQuotaProfileLine(quota) {
  const status = getQuotaStatusLine(quota);
  return status?.line ?? null;
}
