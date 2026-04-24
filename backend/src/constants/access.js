/**
 * Legacy default when env is not wired. Runtime enforcement reads
 * `env.freeTestLimit` (FREE_TEST_LIMIT in .env) — keep this in sync for
 * any code that still imports the constant directly.
 */
export const FREE_TEST_ATTEMPTS = 3;

/** Default premium subscription length after successful payment (days). */
export const PREMIUM_SUBSCRIPTION_DAYS = 30;
