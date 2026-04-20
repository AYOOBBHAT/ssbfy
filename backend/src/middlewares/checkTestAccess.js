import { HTTP_STATUS } from '../constants/httpStatus.js';
import { hasActiveSubscription } from '../constants/subscription.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { userRepository } from '../repositories/userRepository.js';

/**
 * Requires authenticate to run first (sets req.user).
 * Active subscription (subscriptionEnd > now) bypasses free-tier consumption.
 * Otherwise consumes one free attempt atomically (max FREE_TEST_ATTEMPTS total used).
 */
export const checkTestAccess = asyncHandler(async (req, res, next) => {
  const user = await userRepository.findById(req.user.id);
  if (!user) {
    throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
  }

  if (hasActiveSubscription(user)) {
    return next();
  }

  const updated = await userRepository.incrementFreeAttemptIfUnderLimit(req.user.id);
  if (!updated) {
    console.log('[ACCESS] Blocked:', {
      userId: String(req.user.id),
      freeAttemptsUsed: user.freeAttemptsUsed,
    });
    throw new AppError('Free limit exceeded. Please upgrade.', HTTP_STATUS.FORBIDDEN);
  }

  console.log('[ACCESS] Free attempt consumed:', {
    userId: String(req.user.id),
    freeAttemptsUsed: updated.freeAttemptsUsed,
  });

  return next();
});
