import { hasActiveSubscription } from '../constants/subscription.js';

export const FREE_TEST_LIMIT_MESSAGE = 'Free test limit reached. Upgrade to continue.';

/**
 * Single source of truth for "is this user premium right now?".
 *
 * Premium = Lifetime user OR active timed subscription.
 *
 * - Lifetime is recognised by `isPremium === true` AND no `subscriptionEnd`.
 *   This shape is written by the new payment flow for lifetime plans, and
 *   also matches legacy admin-granted permanent premium users.
 * - Timed plans (monthly/quarterly/yearly) are premium ONLY while
 *   `subscriptionEnd > now`. A stale `isPremium === true` left over from
 *   legacy data does NOT grant access once the window has lapsed.
 */
export function isPremiumUser(user) {
  if (!user) return false;
  if (isLifetimeUser(user)) return true;
  return hasActiveSubscription(user);
}

/**
 * Lifetime = persistent premium with no expiry window.
 * Matches both the new lifetime plan write shape and legacy admin-granted users.
 */
export function isLifetimeUser(user) {
  if (!user) return false;
  return user.isPremium === true && !user.subscriptionEnd;
}
