import { hasActiveSubscription } from '../constants/subscription.js';

export const FREE_TEST_LIMIT_MESSAGE = 'Free test limit reached. Upgrade to continue.';

/** Premium flag OR an active subscription window — both bypass device limits. */
export function isPremiumUser(user) {
  return user?.isPremium === true || hasActiveSubscription(user);
}
