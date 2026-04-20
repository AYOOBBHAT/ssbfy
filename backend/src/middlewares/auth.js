import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ROLE_VALUES, ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import { verifyToken } from '../utils/jwt.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED));
  }

  const token = header.slice(7);
  try {
    const payload = verifyToken(token);

    // Reject tokens missing required claims or carrying an unknown role.
    // This prevents a malformed/legacy token from sneaking past role checks.
    if (!payload?.sub || !ROLE_VALUES.includes(payload?.role)) {
      return next(new AppError('Invalid token claims', HTTP_STATUS.UNAUTHORIZED));
    }

    req.user = {
      id: String(payload.sub),
      role: payload.role,
    };
    next();
  } catch {
    next(new AppError('Invalid or expired token', HTTP_STATUS.UNAUTHORIZED));
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      console.log('[ACCESS] Forbidden — required:', roles, 'got:', req.user?.role || 'anonymous');
      return next(new AppError('Forbidden', HTTP_STATUS.FORBIDDEN));
    }
    next();
  };
}

export const requireAdmin = requireRole(ROLES.ADMIN);
