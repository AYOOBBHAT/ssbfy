import { LEARNING_SESSION_MAX_SNAPSHOT_JSON_BYTES } from '../constants/learningSessionLimits.js';

/**
 * @param {unknown} snapshot
 * @returns {number}
 */
export function estimateSnapshotJsonBytes(snapshot) {
  try {
    return Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * @param {unknown} snapshot
 * @throws {import('../utils/AppError.js').AppError}
 */
export function assertSnapshotWithinSizeLimit(snapshot) {
  const bytes = estimateSnapshotJsonBytes(snapshot);
  if (bytes > LEARNING_SESSION_MAX_SNAPSHOT_JSON_BYTES) {
    const err = new Error('SESSION_SNAPSHOT_TOO_LARGE');
    err.code = 'SESSION_SNAPSHOT_TOO_LARGE';
    err.bytes = bytes;
    throw err;
  }
}
