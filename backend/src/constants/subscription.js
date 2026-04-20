/** Active access if subscriptionEnd is set and after server "now". */
export function hasActiveSubscription(user) {
  if (!user?.subscriptionEnd) {
    return false;
  }
  return new Date(user.subscriptionEnd).getTime() > Date.now();
}

export const PLAN_MONTHLY = 'monthly';
