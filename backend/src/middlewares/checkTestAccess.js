import { HTTP_STATUS } from '../constants/httpStatus.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { userRepository } from '../repositories/userRepository.js';
import { deviceUsageRepository } from '../repositories/deviceUsageRepository.js';
import { testAttemptRepository } from '../repositories/testAttemptRepository.js';
import { FREE_TEST_LIMIT_MESSAGE, isPremiumUser } from '../utils/freeTierAccess.js';

/**
 * Requires `authenticate` first (sets req.user).
 *
 * Premium → always allow (device quota not applied).
 *
 * Otherwise:
 *   - `deviceId` required (validated again in `startTestValidators`).
 *   - Cannot start if test already submitted.
 *   - Resuming an in-progress attempt skips the device read — no extra slot.
 *   - Brand-new start: pre-flight read so we fail fast when the device is
 *     already at the limit. The actual slot is consumed in the controller
 *     *after* `testAttemptService.start` succeeds, so a failed start never
 *     charges the device.
 */
export const checkTestAccess = asyncHandler(async (req, res, next) => {
  const user = await userRepository.findById(req.user.id);
  if (!user) {
    throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
  }

  if (isPremiumUser(user)) {
    return next();
  }

  const deviceId =
    typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';
  if (!deviceId || deviceId.length < 4) {
    throw new AppError('deviceId is required', HTTP_STATUS.BAD_REQUEST);
  }

  const testId = req.params.id;
  const userId = req.user.id;
  const limit = env.freeTestLimit;

  const submitted = await testAttemptRepository.findSubmittedByUserAndTest(userId, testId);
  if (submitted) {
    throw new AppError('Test already completed', HTTP_STATUS.CONFLICT);
  }

  const inProgress = await testAttemptRepository.findInProgressByUserAndTest(userId, testId);
  if (inProgress) {
    return next();
  }

  await deviceUsageRepository.ensureDeviceRow(deviceId);
  const doc = await deviceUsageRepository.findByDeviceId(deviceId);
  const used = doc?.freeAttemptsUsed ?? 0;
  if (used >= limit) {
    console.log('[ACCESS] Device free limit (pre-flight):', {
      deviceId: deviceId.slice(0, 12),
      used,
      limit,
    });
    throw new AppError(FREE_TEST_LIMIT_MESSAGE, HTTP_STATUS.FORBIDDEN);
  }

  return next();
});
