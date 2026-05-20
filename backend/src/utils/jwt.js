import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ROLES } from '../constants/roles.js';
import { sessionTierForRole } from '../constants/jwtPolicy.js';

/**
 * @param {string} role
 * @returns {string} jsonwebtoken `expiresIn` value
 */
export function resolveAuthTokenExpiresIn(role) {
  return role === ROLES.ADMIN ? env.jwtAdminExpiresIn : env.jwtExpiresIn;
}

/**
 * Low-level sign — prefer `signAuthToken` for login/signup sessions.
 * @param {object} payload
 * @param {{ expiresIn?: string }} [options]
 */
export function signToken(payload, options = {}) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: options.expiresIn ?? env.jwtExpiresIn,
  });
}

/**
 * Login/signup session JWT: role-aware expiry + session tier metadata (no separate auth system).
 * @param {{ sub: string, role: string }} claims
 */
export function signAuthToken({ sub, role }) {
  const expiresIn = resolveAuthTokenExpiresIn(role);
  return jwt.sign(
    {
      sub,
      role,
      sessionTier: sessionTierForRole(role),
    },
    env.jwtSecret,
    { expiresIn }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

/** Decode without verification — telemetry only; never use for authorization. */
export function decodeTokenUnsafe(token) {
  return jwt.decode(token);
}
