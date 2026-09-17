import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@ssbfy/lecture-progress';
export const LECTURE_PROGRESS_SAVE_INTERVAL_MS = 12_000;
export const LECTURE_COMPLETED_RATIO = 0.9;

function storageKey(userId, lectureId) {
  const uid = String(userId || '').trim();
  const lid = String(lectureId || '').trim();
  if (!uid || !lid) return null;
  return `${PREFIX}/${uid}/${lid}`;
}

function asRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const positionSeconds = Math.max(0, Number(raw.positionSeconds) || 0);
  const durationSeconds = Math.max(0, Number(raw.durationSeconds) || 0);
  return {
    positionSeconds,
    durationSeconds,
    completed: raw.completed === true,
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

export function isLectureCompleted(positionSeconds, durationSeconds) {
  const duration = Number(durationSeconds) || 0;
  if (duration <= 0) return false;
  return Number(positionSeconds) >= duration * LECTURE_COMPLETED_RATIO;
}

export async function getLectureProgress(userId, lectureId) {
  const key = storageKey(userId, lectureId);
  if (!key) return null;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveLectureProgress(userId, lectureId, input) {
  const key = storageKey(userId, lectureId);
  if (!key) return null;
  const durationSeconds = Math.max(0, Number(input?.durationSeconds) || 0);
  const positionSeconds = Math.max(0, Number(input?.positionSeconds) || 0);
  const completed =
    input?.completed === true || isLectureCompleted(positionSeconds, durationSeconds);
  const record = {
    positionSeconds: completed ? 0 : positionSeconds,
    durationSeconds,
    completed,
    updatedAt: new Date().toISOString(),
  };
  try {
    await AsyncStorage.setItem(key, JSON.stringify(record));
  } catch {
    /* ignore quota / private-mode */
  }
  return record;
}

export function formatLectureDuration(seconds) {
  const n = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(n / 3600);
  const minutes = Math.floor((n % 3600) / 60);
  const secs = n % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}
