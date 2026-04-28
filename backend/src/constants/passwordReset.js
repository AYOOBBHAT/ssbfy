/** Cooldown between forgot-password / resend OTP requests per email (ms). */
export const PASSWORD_RESET_COOLDOWN_MS = 45_000;

/** OTP validity window (ms) — 10 minutes. */
export const PASSWORD_RESET_OTP_TTL_MS = 10 * 60_000;

/** Max wrong OTP submissions before the code is invalidated. */
export const PASSWORD_RESET_MAX_OTP_ATTEMPTS = 5;

/** bcrypt cost for OTP hashing (short-lived secret; lower than password hash). */
export const PASSWORD_RESET_OTP_BCRYPT_ROUNDS = 10;

export const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'If the account exists, reset instructions were sent.';
