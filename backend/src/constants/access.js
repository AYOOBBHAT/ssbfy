/**
 * Legacy default when env is not wired. Runtime enforcement reads
 * `env.freeTestLimit` (FREE_TEST_LIMIT in .env) — keep this in sync for
 * any code that still imports the constant directly.
 */
export const FREE_TEST_ATTEMPTS = 3;
