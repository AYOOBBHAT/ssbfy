import { authenticate, requireRole } from './auth.js';
import { ROLES } from '../constants/roles.js';

/**
 * Single middleware that enforces "must be an authenticated admin".
 * Use directly: router.post('/x', requireAdmin, handler)
 */
export const requireAdmin = [authenticate, requireRole(ROLES.ADMIN)];

/**
 * Convenience alias used inline so admin routes always read the same way:
 *
 *   router.post('/', ...adminChain, validators, handler);
 *
 * Centralizing this avoids the risk of a future route forgetting one of
 * the two middlewares (auth + role) and silently exposing admin actions.
 */
export const adminChain = requireAdmin;
