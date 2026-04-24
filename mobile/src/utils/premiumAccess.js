/**
 * Matches backend free-tier bypass: `isPremium` flag or an active `subscriptionEnd`.
 */
export function userHasPremiumAccess(user) {
  if (!user || typeof user !== 'object') return false;
  if (user.isPremium === true) return true;
  if (user.subscriptionEnd) {
    const t = new Date(user.subscriptionEnd).getTime();
    if (!Number.isNaN(t) && t > Date.now()) return true;
  }
  return false;
}
