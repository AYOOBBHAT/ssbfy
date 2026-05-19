import { clearAnalyticsOverviewCache } from './analyticsCache';
import { clearProfileActivityCache } from './profileActivityCache';
import { clearProfileAnalyticsCache } from './profileAnalyticsCache';

/**
 * Invalidate Profile-related caches after a session successfully completes.
 * Call on mock submit, practice reveal, daily practice, and retry finish —
 * not on TTL alone — so Profile shows fresh activity on next visit.
 */
export async function invalidateProfileCachesAfterSessionComplete() {
  await Promise.all([
    clearProfileActivityCache(),
    clearProfileAnalyticsCache(),
    clearAnalyticsOverviewCache(),
  ]);
}
