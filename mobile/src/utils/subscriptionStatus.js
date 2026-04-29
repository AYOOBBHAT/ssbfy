/**
 * Derives the user's subscription display state from the user object
 * returned by /api/users/me.
 *
 * Mirrors the backend truth function (`isPremiumUser` in
 * backend/src/utils/freeTierAccess.js) so backend gates and UI never disagree.
 *
 * Status values:
 *   - 'lifetime' : permanent premium (new Lifetime plan OR legacy admin grant)
 *   - 'active'   : timed plan with subscriptionEnd in the future
 *   - 'expired'  : previously had a plan, window has lapsed
 *   - 'free'     : never had a plan
 */

const PLAN_DISPLAY_NAMES = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  lifetime: 'Lifetime',
};

function planTypeOf(user) {
  return user?.currentPlanType || user?.plan || null;
}

function displayNameFor(planType) {
  if (!planType) return 'Premium';
  return PLAN_DISPLAY_NAMES[planType] || 'Premium';
}

function parseDate(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return t;
}

export function getSubscriptionStatus(user) {
  if (!user || typeof user !== 'object') {
    return {
      status: 'free',
      planType: null,
      planName: null,
      subscriptionEnd: null,
      daysRemaining: null,
    };
  }

  const planType = planTypeOf(user);
  const endTs = parseDate(user.subscriptionEnd);

  // Lifetime: persistent flag with no expiry window. Covers both new
  // Lifetime plan writes and legacy admin-granted permanent users.
  if (user.isPremium === true && !endTs) {
    return {
      status: 'lifetime',
      planType: planType === 'lifetime' ? 'lifetime' : 'lifetime',
      planName: 'Lifetime',
      subscriptionEnd: null,
      daysRemaining: null,
    };
  }

  const now = Date.now();

  if (endTs && endTs > now) {
    const daysRemaining = Math.max(1, Math.ceil((endTs - now) / 86_400_000));
    return {
      status: 'active',
      planType,
      planName: displayNameFor(planType),
      subscriptionEnd: user.subscriptionEnd,
      daysRemaining,
    };
  }

  const everPremium = !!endTs || !!planType || user.isPremium === true;
  if (everPremium) {
    return {
      status: 'expired',
      planType,
      planName: displayNameFor(planType),
      subscriptionEnd: user.subscriptionEnd || null,
      daysRemaining: 0,
    };
  }

  return {
    status: 'free',
    planType: null,
    planName: null,
    subscriptionEnd: null,
    daysRemaining: null,
  };
}

/**
 * Format a date string / Date into a friendly user-facing label.
 * Example: "12 Aug 2026". Falls back to empty string on bad input.
 */
export function formatPlanDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
}
