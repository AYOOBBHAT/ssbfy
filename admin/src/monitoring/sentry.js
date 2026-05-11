import * as Sentry from '@sentry/react';

/**
 * Admin SPA — enable with `VITE_SENTRY_DSN` at build time.
 * No PII; auth headers stripped in beforeSend if ever attached.
 */
export function initAdminMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.PROD ? 'production' : 'development',
    tracesSampleRate: import.meta.env.PROD ? 0.08 : 0,
    sendDefaultPii: false,
    beforeSend(event) {
      try {
        if (event.request?.headers) {
          delete event.request.headers.Authorization;
        }
      } catch {
        /* ignore */
      }
      return event;
    },
  });
}

export function captureAdminApiFailure(status, path, detail) {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  Sentry.captureMessage(`Admin API ${status}`, {
    level: status >= 500 ? 'error' : 'warning',
    extra: { path, detail: String(detail ?? '').slice(0, 500) },
  });
}
