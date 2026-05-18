import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@ssbfy/learning_session_reveal_receipts_v1';
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_RECEIPTS = 40;

/**
 * Stable fingerprint for idempotent reveal after app kill (same Q set + type).
 * @param {string} practiceType
 * @param {string[]} questionIds
 */
export function buildRevealReceiptKey(practiceType, questionIds) {
  const type = String(practiceType || 'practice').trim().toLowerCase();
  const ids = (Array.isArray(questionIds) ? questionIds : [])
    .map((id) => String(id))
    .filter(Boolean)
    .sort()
    .join(',');
  let hash = 0;
  const base = `${type}|${ids}`;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash * 31 + base.charCodeAt(i)) | 0;
  }
  return `${type}:${(hash >>> 0).toString(36)}`;
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
    return savedAt > 0 && now - savedAt < TTL_MS && row?.learningSessionId;
  });
  entries.sort((a, b) => (Number(a[1]?.savedAt) || 0) - (Number(b[1]?.savedAt) || 0));
  return Object.fromEntries(entries.slice(-MAX_RECEIPTS));
}

/**
 * @param {string} receiptKey
 * @returns {Promise<string|null>} learningSessionId
 */
export async function getRevealReceipt(receiptKey) {
  const key = String(receiptKey ?? '').trim();
  if (!key) return null;
  try {
    const store = await readStore();
    const row = store[key];
    if (!row?.learningSessionId) return null;
    const savedAt = Number(row.savedAt) || 0;
    if (!savedAt || Date.now() - savedAt > TTL_MS) return null;
    return String(row.learningSessionId);
  } catch {
    return null;
  }
}

/**
 * @param {string} receiptKey
 * @param {string} learningSessionId
 */
export async function putRevealReceipt(receiptKey, learningSessionId) {
  const key = String(receiptKey ?? '').trim();
  const sessionId = String(learningSessionId ?? '').trim();
  if (!key || !sessionId) return;
  try {
    const store = pruneStore(await readStore());
    store[key] = { savedAt: Date.now(), learningSessionId: sessionId };
    await AsyncStorage.setItem(KEY, JSON.stringify(pruneStore(store)));
  } catch {
    // best-effort
  }
}
