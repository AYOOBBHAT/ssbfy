/** Cooldown between forgot-password / resend OTP requests per email (ms). */
export const PASSWORD_RESET_COOLDOWN_MS = 45_000;

/** OTP validity window (ms) — 10 minutes. */
export const PASSWORD_RESET_OTP_TTL_MS = 10 * 60_000;

/** Max wrong OTP submissions before the code is invalidated. */
export const PASSWORD_RESET_MAX_OTP_ATTEMPTS = 5;

/** bcrypt cost for OTP hashing (short-lived secret; lower than password hash). */
export const PASSWORD_RESET_OTP_BCRYPT_ROUNDS = 10;

/**
 * Reset-token validity window (ms) — 15 minutes. Covers the time between
 * verify-otp and reset-password. Single-use; consumed atomically on reset.
 */
export const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60_000;

/** Generic response — never reveals whether the account exists. */
export const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'If the account exists, reset instructions were sent.';

/**
 * Generic error for any "OTP path" failure (wrong / expired / used / no
 * pending request). Consciously identical wording so attackers can't
 * distinguish state via timing or copy.
 */
export const INVALID_OR_EXPIRED_OTP_MESSAGE = 'Invalid or expired reset code.';

/**
 * Generic error for any "reset-token path" failure (wrong / expired /
 * already used / no pending verification). Same neutralization principle.
 */
export const INVALID_OR_EXPIRED_TOKEN_MESSAGE =
  'This reset session has expired. Please request a new code.';
