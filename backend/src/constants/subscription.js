/**
 * True iff the user has a TIMED subscription that has not yet expired.
 *
 * NOTE: This intentionally returns false for Lifetime users (they have
 * `subscriptionEnd: null`). Do NOT use this as the primary premium gate —
 * use `isPremiumUser` from `utils/freeTierAccess.js`, which combines this
 * check with lifetime detection.
 */
export function hasActiveSubscription(user) {
  if (!user?.subscriptionEnd) {
    return false;
  }
  return new Date(user.subscriptionEnd).getTime() > Date.now();
}
