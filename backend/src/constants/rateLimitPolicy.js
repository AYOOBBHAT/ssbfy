/**
 * Central classification for limiter **provider failure** handling (Upstash errors,
 * transient Redis outages). Does not replace per-route numeric limits — see
 * `createUpstashLimiter` in `upstashRateLimiter.js`.
 *
 * Route → sensitivity mapping (authoritative for this codebase):
 *
 * HIGH — fail-closed on missing Redis (non-webhook); on provider errors use in-process
 * emergency limiter (never silent `next()`):
 *   - POST /auth/login, /auth/signup, forgot-password/* (authLimiter / otpLimiter)
 *   - PATCH /users/change-password (changePasswordLimiter)
 *   - POST /practice/issue, /practice/reveal (practiceIssueLimiter, practiceRevealLimiter)
 *   - POST /questions/smart-practice (smartPracticeIssueLimiter)
 *   - POST /payments/create-order, /payments/verify (paymentLimiter)
 *   - /admin/subscription-plans, /admin/payments (adminMutationLimiter)
 *
 * MEDIUM — provider errors: fail-open + structured security log (no emergency store):
 *   - apiLimiter mounts: /users (GET /me, /profile-analytics share bucket with other
 *     apiLimiter routes), /questions, /learning-sessions, /analytics, /results
 *   - /tests — dedicated buckets (tests_read, tests_lifecycle, tests_progress,
 *     tests_attempts_read); test admin mutations reuse adminMutationLimiter
 *
 * LOW — provider errors: fail-open + structured security log:
 *   - POST /payments/webhook (webhookLimiter, allowWithoutRedis when unset)
 *
 * Intentionally lighter / unscoped paths (no dedicated limiter mount here):
 *   - healthRoutes, /subjects, /topics, /leaderboard, /daily-practice, etc.
 */

export const RateLimitSensitivity = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

/** Public API code when HIGH routes cannot safely enforce limits (emergency path failure). */
export const RATE_LIMIT_TEMPORARILY_UNAVAILABLE = 'RATE_LIMIT_TEMPORARILY_UNAVAILABLE';

export function buildRateLimitUnavailableBody() {
  return {
    success: false,
    code: RATE_LIMIT_TEMPORARILY_UNAVAILABLE,
    message: 'Rate limiting is temporarily unavailable. Please try again in a moment.',
  };
}
