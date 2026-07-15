import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

const WEB_CLIENT_ID = String(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '').trim();

let configured = false;

export function isGoogleSignInConfigured() {
  return WEB_CLIENT_ID.length > 0;
}

export function configureGoogleSignIn() {
  if (configured || !isGoogleSignInConfigured()) {
    return;
  }
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    offlineAccess: false,
  });
  configured = true;
}

/**
 * User dismissed the Google account picker — not an error for UX or Sentry.
 */
export function isGoogleSignInCancelledError(error) {
  if (!error) return false;
  if (error?.name === 'GoogleSignInCancelledError') return true;
  if (isErrorWithCode(error)) {
    return error.code === statusCodes.SIGN_IN_CANCELLED;
  }
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return (
    code === statusCodes.SIGN_IN_CANCELLED ||
    code === '-5' ||
    message.includes('cancel') ||
    message.includes('dismiss')
  );
}

function throwCancelled() {
  const err = new Error('Google sign-in cancelled');
  err.name = 'GoogleSignInCancelledError';
  err.code = statusCodes.SIGN_IN_CANCELLED;
  throw err;
}

/**
 * Obtain a Google ID token for backend verification.
 * @returns {Promise<string>}
 */
export async function requestGoogleIdToken() {
  configureGoogleSignIn();
  if (!isGoogleSignInConfigured()) {
    throw new Error('Google sign-in is not configured for this build.');
  }

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();
  if (isCancelledResponse(response)) {
    throwCancelled();
  }
  if (!isSuccessResponse(response)) {
    throw new Error('Google sign-in did not complete.');
  }

  const idToken = response.data?.idToken;
  if (!idToken) {
    throw new Error('Google did not return a sign-in token. Please try again.');
  }

  return idToken;
}
