import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

let oauthClient = null;

function getOAuthClient() {
  if (!oauthClient) {
    oauthClient = new OAuth2Client();
  }
  return oauthClient;
}

function isGoogleAuthConfigured() {
  return env.googleAndroidClientId.length > 0 && env.googleWebClientId.length > 0;
}

/**
 * Verify a Google ID token server-side.
 * @returns {Promise<{ sub: string, email: string, emailVerified: boolean, name: string, picture: string | null }>}
 */
export async function verifyGoogleIdToken(idToken) {
  if (!isGoogleAuthConfigured()) {
    logger.error('Google auth requested but GOOGLE_*_CLIENT_ID env vars are not configured');
    throw new AppError(
      'Google sign-in is temporarily unavailable. Please try again later or use email login.',
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      null,
      { code: 'GOOGLE_AUTH_UNAVAILABLE' }
    );
  }

  let ticket;
  try {
    ticket = await getOAuthClient().verifyIdToken({
      idToken,
      audience: env.googleAllowedAudiences,
    });
  } catch (err) {
    logger.warn(
      {
        err: { name: err?.name, message: err?.message },
        event: 'google_token_verify_failed',
      },
      'Google ID token verification failed'
    );
    throw new AppError(
      'Google sign-in could not be verified. Please try again.',
      HTTP_STATUS.UNAUTHORIZED,
      null,
      { code: 'GOOGLE_TOKEN_INVALID' }
    );
  }

  const payload = ticket.getPayload();
  if (!payload) {
    throw new AppError(
      'Google sign-in could not be verified. Please try again.',
      HTTP_STATUS.UNAUTHORIZED,
      null,
      { code: 'GOOGLE_TOKEN_INVALID' }
    );
  }

  const iss = payload.iss;
  if (!GOOGLE_ISSUERS.has(iss)) {
    logger.warn({ event: 'google_token_invalid_issuer', iss }, 'Rejected Google token issuer');
    throw new AppError(
      'Google sign-in could not be verified. Please try again.',
      HTTP_STATUS.UNAUTHORIZED,
      null,
      { code: 'GOOGLE_TOKEN_INVALID' }
    );
  }

  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  const name =
    typeof payload.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : email.split('@')[0] || 'SSBFY User';
  const picture =
    typeof payload.picture === 'string' && payload.picture.trim() ? payload.picture.trim() : null;

  if (!sub) {
    throw new AppError(
      'Google sign-in could not be verified. Please try again.',
      HTTP_STATUS.UNAUTHORIZED,
      null,
      { code: 'GOOGLE_TOKEN_INVALID' }
    );
  }

  if (!email) {
    throw new AppError(
      'Your Google account must have an email address to sign in.',
      HTTP_STATUS.UNAUTHORIZED,
      null,
      { code: 'GOOGLE_TOKEN_INVALID' }
    );
  }

  if (!emailVerified) {
    throw new AppError(
      'Please verify your Google email address before signing in.',
      HTTP_STATUS.FORBIDDEN,
      null,
      { code: 'GOOGLE_EMAIL_NOT_VERIFIED' }
    );
  }

  return { sub, email, emailVerified, name, picture };
}

export { isGoogleAuthConfigured };
