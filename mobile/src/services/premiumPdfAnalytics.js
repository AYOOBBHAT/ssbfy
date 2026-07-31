/**
 * Sanitized premium-PDF discovery analytics (Sentry breadcrumbs + DEV logs).
 * Never includes signed URLs, storage paths, or PII.
 */

import { monitoringBreadcrumb } from '../monitoring/sentry';
import logger from '../utils/logger';

/**
 * @param {string} event
 * @param {Record<string, unknown>} [data]
 */
export function trackPremiumPdfEvent(event, data = {}) {
  try {
    monitoringBreadcrumb('premium_pdf', event, data);
  } catch {
    /* ignore */
  }
  if (__DEV__) {
    logger.debug(`[premium_pdf] ${event}`, data);
  }
}
