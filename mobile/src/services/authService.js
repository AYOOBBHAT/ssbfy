import api, { getApiErrorMessage } from './api.js';

/**
 * @returns {Promise<{ user: object, token: string }>}
 */
export async function signup({ name, email, password }) {
  const { data } = await api.post('/auth/signup', { name, email, password });
  return data?.data ?? {};
}

/**
 * @returns {Promise<{ user: object, token: string }>}
 */
export async function login({ email, password }) {
  const { data } = await api.post('/auth/login', { email, password });
  return data?.data ?? {};
}

/**
 * Forgot Password — STEP 1.
 * Request a 6-digit reset OTP (email delivered via Resend server-side).
 * The response shape is identical whether or not the account exists,
 * so the UI must NOT branch on the message text.
 */
export async function sendForgotPasswordOtp({ email }) {
  const { data } = await api.post('/auth/forgot-password/send-otp', { email });
  return data?.data ?? {};
}

/**
 * Forgot Password — STEP 2.
 * Verify the 6-digit OTP. On success the server returns a short-lived
 * `resetToken` that must be supplied to step 3. The OTP is consumed
 * atomically and cannot be re-used.
 *
 * @returns {Promise<{ resetToken: string, expiresAt: string, message: string }>}
 */
export async function verifyForgotPasswordOtp({ email, otp }) {
  const { data } = await api.post('/auth/forgot-password/verify-otp', {
    email,
    otp,
  });
  return data?.data ?? {};
}

/**
 * Forgot Password — STEP 3.
 * Submit the resetToken from step 2 plus the new password (and confirm).
 * Server validates match, blocks same-password reuse, hashes with bcrypt,
 * single-use consumes the token. Does NOT auto-login — caller must
 * navigate to the Login screen.
 */
export async function completePasswordReset({
  email,
  resetToken,
  newPassword,
  confirmPassword,
}) {
  const { data } = await api.post('/auth/forgot-password/reset-password', {
    email,
    resetToken,
    newPassword,
    confirmPassword,
  });
  return data?.data ?? {};
}

/**
 * Change password for an authenticated user from Profile settings.
 */
export async function changePassword({
  currentPassword,
  newPassword,
  confirmPassword,
}) {
  const { data } = await api.patch('/users/change-password', {
    currentPassword,
    newPassword,
    confirmPassword,
  });
  return data?.data ?? {};
}

export { getApiErrorMessage };
