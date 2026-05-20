/** Practice reveal tickets: TTL from creation (Mongo TTL index on expiresAt). */
export const PRACTICE_ISSUANCE_TTL_MS = 36 * 60 * 60 * 1000;

/** Max non-idempotent reveal attempts per issuance (network retries / failures). */
export const PRACTICE_ISSUANCE_MAX_SCRATCH_REVEALS = 24;

/** Max question ids per issuance / reveal. */
export const PRACTICE_ISSUANCE_MAX_QUESTIONS = 50;
