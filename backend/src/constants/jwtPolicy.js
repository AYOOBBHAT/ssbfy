/**
 * JWT session policy — single signing secret, role-aware expiry at issuance.
 * Student/mobile sessions use JWT_EXPIRES_IN; privileged admin sessions use JWT_ADMIN_EXPIRES_IN.
 */

import { ROLES } from './roles.js';

/** Default when JWT_ADMIN_EXPIRES_IN is unset (see env.js). */
export const DEFAULT_ADMIN_JWT_EXPIRES_IN = '8h';

/** Default when JWT_EXPIRES_IN is unset (see env.js). */
export const DEFAULT_USER_JWT_EXPIRES_IN = '7d';

/**
 * @param {string} role
 * @returns {'privileged'|'standard'}
 */
export function sessionTierForRole(role) {
  return role === ROLES.ADMIN ? 'privileged' : 'standard';
}
