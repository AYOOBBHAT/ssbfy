import { monitoringBreadcrumb, captureFlowException, isSentryEnabled } from './sentry';

/**
 * Lightweight HTTP diagnostics — breadcrumbs only unless severity warrants an exception.
 */
export function recordHttpFailure({
  method,
  url,
  status,
  latencyMs,
  axiosCode,
  flow,
}) {
  if (status === 409 && String(url || '').includes('/submit')) {
    monitoringBreadcrumb('http', `${method} ${url}`, {
      status,
      latencyMs,
      code: axiosCode ?? null,
      note: 'may_be_recoverable_duplicate',
    });
    return;
  }

  monitoringBreadcrumb('http', `${method} ${url}`, {
    status: status ?? null,
    latencyMs,
    code: axiosCode ?? null,
  });

  const tag = flow || 'api';
  if (isSentryEnabled() && status >= 500) {
    captureFlowException(tag, new Error(`HTTP ${status} ${method} ${url}`), {
      status,
      latencyMs,
    });
  }
}
