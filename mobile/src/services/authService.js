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
 * Request password reset OTP (email via Resend on server). Same response
 * shape whether or not the account exists.
 */
export async function forgotPassword({ email }) {
  const { data } = await api.post('/auth/forgot-password', { email });
  return data?.data ?? {};
}

/**
 * Complete password reset with email + 6-digit OTP + new password.
 */
export async function resetPassword({ email, otp, newPassword }) {
  const { data } = await api.post('/auth/reset-password', {
    email,
    otp,
    newPassword,
  });
  return data?.data ?? {};
}

export { getApiErrorMessage };
