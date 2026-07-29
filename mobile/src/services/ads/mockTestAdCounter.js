/**
 * Persisted counter for successfully completed standard mock tests.
 *
 * Frequency: show interstitial opportunity every 3 completions.
 * If the ad cannot be shown, the opportunity is consumed and the counter
 * resets — avoids an "owed" ad firing much later on unrelated navigation.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveCacheUserId } from '../../utils/authScopedCache';
import logger from '../../utils/logger';

export const MOCK_INTERSTITIAL_FREQUENCY = 3;
const KEY_ROOT = '@ssbfy/admob_mock_completions_v1';

function storageKey() {
  const uid = getActiveCacheUserId();
  return uid ? `${KEY_ROOT}:u_${uid}` : `${KEY_ROOT}:anon`;
}

async function readState() {
  try {
    const raw = await AsyncStorage.getItem(storageKey());
    if (!raw) {
      return {
        count: 0,
        lastShownAttemptId: null,
        lastConsumedAttemptId: null,
        lastIncrementedAttemptId: null,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      count: Number(parsed?.count) > 0 ? Math.floor(Number(parsed.count)) : 0,
      lastShownAttemptId:
        typeof parsed?.lastShownAttemptId === 'string' ? parsed.lastShownAttemptId : null,
      lastConsumedAttemptId:
        typeof parsed?.lastConsumedAttemptId === 'string'
          ? parsed.lastConsumedAttemptId
          : null,
      lastIncrementedAttemptId:
        typeof parsed?.lastIncrementedAttemptId === 'string'
          ? parsed.lastIncrementedAttemptId
          : null,
    };
  } catch {
    return {
      count: 0,
      lastShownAttemptId: null,
      lastConsumedAttemptId: null,
      lastIncrementedAttemptId: null,
    };
  }
}

async function writeState(state) {
  try {
    await AsyncStorage.setItem(storageKey(), JSON.stringify(state));
  } catch (e) {
    if (__DEV__) {
      logger.warn('[ads] mock counter persist failed', {
        message: e?.message ? String(e.message).slice(0, 80) : 'unknown',
      });
    }
  }
}

/**
 * Increment after backend confirms a successful standard mock submit.
 * @param {string} [attemptKey] — dedupes 409 recovery vs first success
 */
export async function incrementStandardMockCompletion(attemptKey) {
  const state = await readState();
  if (attemptKey && state.lastIncrementedAttemptId === attemptKey) {
    return state.count;
  }
  state.count += 1;
  if (attemptKey) state.lastIncrementedAttemptId = attemptKey;
  await writeState(state);
  if (__DEV__) {
    logger.debug('[ads] mock completion count', { count: state.count });
  }
  return state.count;
}

export async function getStandardMockCompletionCount() {
  const state = await readState();
  return state.count;
}

export async function shouldOfferMockInterstitial(attemptKey) {
  const state = await readState();
  if (!attemptKey) return false;
  if (state.lastConsumedAttemptId === attemptKey) return false;
  if (state.lastShownAttemptId === attemptKey) return false;
  return state.count >= MOCK_INTERSTITIAL_FREQUENCY;
}

/**
 * Mark opportunity consumed (shown or skipped). Resets counter to 0.
 * @param {string} attemptKey
 * @param {{ shown?: boolean }} [meta]
 */
export async function consumeMockInterstitialOpportunity(attemptKey, meta = {}) {
  if (!attemptKey) return;
  const state = await readState();
  state.count = 0;
  state.lastConsumedAttemptId = attemptKey;
  if (meta.shown) {
    state.lastShownAttemptId = attemptKey;
  }
  await writeState(state);
  if (__DEV__) {
    logger.debug('[ads] mock interstitial opportunity consumed', {
      shown: !!meta.shown,
      attemptSuffix: String(attemptKey).slice(-6),
    });
  }
}

export async function resetMockInterstitialCounter() {
  const state = await readState();
  state.count = 0;
  await writeState(state);
}
