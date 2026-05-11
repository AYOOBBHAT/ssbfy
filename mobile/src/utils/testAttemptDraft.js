import AsyncStorage from '@react-native-async-storage/async-storage';

export const DRAFT_VERSION = 2;

const PREFIX = 'ssbfy:test_attempt_draft:v2:';

/** @param {string} testId */
export function draftStorageKey(testId) {
  return `${PREFIX}${String(testId)}`;
}

/**
 * @typedef {object} TestAttemptDraft
 * @property {number} version
 * @property {string} testId
 * @property {string} attemptId
 * @property {string} questionIdsKey
 * @property {Record<string, number[]>} answers
 * @property {number} currentIndex
 * @property {string[]} skippedQuestionIds
 * @property {string[]} markedForReviewIds
 * @property {string|null} serverStartTimeIso
 * @property {number} durationMinutes
 * @property {boolean} submitted
 * @property {number} updatedAt
 */

/** @returns {Promise<TestAttemptDraft|null>} */
export async function loadDraft(testId) {
  try {
    const raw = await AsyncStorage.getItem(draftStorageKey(testId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== DRAFT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** @param {string} testId @param {TestAttemptDraft} draft */
export async function saveDraft(testId, draft) {
  const payload = {
    ...draft,
    version: DRAFT_VERSION,
    testId: String(testId),
    updatedAt: Date.now(),
  };
  await AsyncStorage.setItem(draftStorageKey(testId), JSON.stringify(payload));
}

/** @param {string} testId */
export async function clearDraft(testId) {
  try {
    await AsyncStorage.removeItem(draftStorageKey(testId));
  } catch {
    /* ignore */
  }
}
