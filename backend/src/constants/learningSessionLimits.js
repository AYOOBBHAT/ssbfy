/** Max questions per practice reveal (matches practiceRevealService). */
export const LEARNING_SESSION_MAX_QUESTIONS = 50;

/**
 * Soft guard for Mongo document size / mobile load (BSON limit 16MB; stay well under).
 * Typical 50-Q session ≈ 100–300 KB JSON.
 */
export const LEARNING_SESSION_MAX_SNAPSHOT_JSON_BYTES = 1_500_000;

/** Truncate abnormal image URL strings in snapshots (URLs only, not binary). */
export const LEARNING_SESSION_MAX_QUESTION_IMAGE_CHARS = 2048;
