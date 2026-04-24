import { HTTP_STATUS } from '../constants/httpStatus.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { userRepository } from '../repositories/userRepository.js';
import { deviceUsageRepository } from '../repositories/deviceUsageRepository.js';
import { FREE_TEST_LIMIT_MESSAGE, isPremiumUser } from '../utils/freeTierAccess.js';

/**
 * GET /daily-practice — shares the same device pool as mock tests (read-only).
 * Does not increment usage; consumption happens only when a mock test starts.
 */
export const checkDailyPracticeDeviceAccess = asyncHandler(async (req, res, next) => {
  const user = await userRepository.findById(req.user.id);
  if (!user) {
    throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
  }

  if (isPremiumUser(user)) {
    return next();
  }

  const raw = req.query?.deviceId;
  const deviceId = typeof raw === 'string' ? raw.trim() : '';
  if (!deviceId || deviceId.length < 4) {
    throw new AppError('deviceId is required', HTTP_STATUS.BAD_REQUEST);
  }

  await deviceUsageRepository.ensureDeviceRow(deviceId);
  const doc = await deviceUsageRepository.findByDeviceId(deviceId);
  const used = doc?.freeAttemptsUsed ?? 0;
  if (used >= env.freeTestLimit) {
    throw new AppError(FREE_TEST_LIMIT_MESSAGE, HTTP_STATUS.FORBIDDEN);
  }

  return next();
});
