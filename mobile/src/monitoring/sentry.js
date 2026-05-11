import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

/**
 * Derive release channel without leaking secrets.
 * EAS injects channel via updates; fall back to env-style naming.
 *
 * Note: We intentionally ship Sentry runtime reporting, but we disable
 * automatic Android sourcemap upload in EAS builds for now because it
 * requires SENTRY_AUTH_TOKEN / org / project configuration. When we're
 * ready to enable uploads, remove `SENTRY_DISABLE_AUTO_UPLOAD=true` from
 * `mobile/eas.json` and provide Sentry credentials in EAS secrets/env.
 */
function resolveEnvironment() {
  if (__DEV__) return 'development';
  const channel = Constants.expoConfig?.extra?.eas?.channel;
  if (channel === 'preview' || channel === 'development') return channel;
  return 'production';
}

function init() {
  if (!dsn) return;

  const enableInDev = process.env.EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV === '1';
  if (__DEV__ && !enableInDev) return;

  const release = `${Constants.expoConfig?.slug ?? 'ssbfy'}@${Constants.expoConfig?.version ?? '0'}+${
    Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? '0'
  }`;

  Sentry.init({
    dsn,
    debug: false,
    enabled: !__DEV__ || enableInDev,
    environment: resolveEnvironment(),
    release,
    dist: String(
      Constants.expoConfig?.android?.versionCode ??
        Constants.expoConfig?.ios?.buildNumber ??
        ''
    ),
    tracesSampleRate: __DEV__ ? 0 : 0.12,
    enableAutoPerformanceTracing: true,
    attachStacktrace: true,
    beforeSend(event) {
      try {
        if (event.request?.headers) {
          delete event.request.headers.Authorization;
          delete event.request.headers.Cookie;
        }
      } catch {
        /* ignore */
      }
      return event;
    },
  });
}

init();

/** Correlate sessions without sending full PII — last segment of ObjectId only. */
export function setMonitoringUser(user) {
  if (!dsn) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  const raw = user._id ?? user.id;
  const id = raw != null ? String(raw) : '';
  Sentry.setUser(id ? { id: id.slice(-12) } : null);
}

export function monitoringBreadcrumb(category, message, data = {}) {
  if (!dsn) return;
  try {
    Sentry.addBreadcrumb({
      category,
      message,
      level: 'info',
      data: sanitizeData(data),
    });
  } catch {
    /* ignore */
  }
}

function sanitizeData(data) {
  if (!data || typeof data !== 'object') return {};
  const out = { ...data };
  const redact = ['password', 'token', 'authorization', 'otp', 'razorpay_signature'];
  for (const k of redact) {
    if (k in out) out[k] = '[redacted]';
  }
  return out;
}

export function captureFlowException(flow, error, extras = {}) {
  if (!dsn || !error) return;
  Sentry.captureException(error, {
    tags: { flow },
    extra: sanitizeData(extras),
  });
}

export function isSentryEnabled() {
  return !!dsn && (!__DEV__ || process.env.EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV === '1');
}
