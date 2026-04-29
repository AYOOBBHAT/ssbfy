/**
 * Mirrors backend `isPremiumUser` (utils/freeTierAccess.js).
 *
 * Premium = Lifetime user OR active timed subscription.
 *
 * - Lifetime: `isPremium === true` AND no `subscriptionEnd`. This shape is
 *   written by the new payment flow for lifetime plans, and also matches
 *   legacy admin-granted permanent premium users.
 * - Timed plans (monthly/quarterly/yearly): premium ONLY while
 *   `subscriptionEnd > now`. A stale `isPremium === true` left over from
 *   pre-fix legacy data does NOT grant access once the window has lapsed.
 */
export function userHasPremiumAccess(user) {
  if (!user || typeof user !== 'object') return false;
  if (user.isPremium === true && !user.subscriptionEnd) return true;
  if (user.subscriptionEnd) {
    const t = new Date(user.subscriptionEnd).getTime();
    if (!Number.isNaN(t) && t > Date.now()) return true;
  }
  return false;
}
