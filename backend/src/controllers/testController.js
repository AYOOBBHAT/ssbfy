import { HTTP_STATUS } from '../constants/httpStatus.js';
import { env } from '../config/env.js';
import { testService } from '../services/testService.js';
import { testAttemptService } from '../services/testAttemptService.js';
import { userRepository } from '../repositories/userRepository.js';
import { deviceUsageRepository } from '../repositories/deviceUsageRepository.js';
import { testAttemptRepository } from '../repositories/testAttemptRepository.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/response.js';
import { FREE_TEST_LIMIT_MESSAGE, isPremiumUser } from '../utils/freeTierAccess.js';

export const testController = {
  list: asyncHandler(async (req, res) => {
    const tests = await testService.list();
    return sendSuccess(res, { tests }, 'Tests');
  }),

  create: asyncHandler(async (req, res) => {
    const test = await testService.create(req.body);
    return sendCreated(res, { test }, 'Test created');
  }),

  getById: asyncHandler(async (req, res) => {
    const test = await testService.getById(req.params.id);
    return sendSuccess(res, { test }, 'Test');
  }),

  start: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    const { attempt, resumed } = await testAttemptService.start(userId, req.params.id, {
      isPremium: isPremiumUser(user),
    });

    if (resumed) {
      return sendSuccess(res, { attempt, resumed: true }, 'Test attempt resumed');
    }

    if (isPremiumUser(user)) {
      return sendCreated(res, { attempt, resumed: false }, 'Test attempt started');
    }

    const deviceId =
      typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';
    if (!deviceId || deviceId.length < 4) {
      await testAttemptRepository.deleteOpenAttemptByIdForUser(attempt._id, userId);
      throw new AppError('deviceId is required', HTTP_STATUS.BAD_REQUEST);
    }

    const updatedDevice = await deviceUsageRepository.consumeOneIfUnderLimit(
      deviceId,
      userId,
      env.freeTestLimit
    );
    if (!updatedDevice) {
      await testAttemptRepository.deleteOpenAttemptByIdForUser(attempt._id, userId);
      throw new AppError(FREE_TEST_LIMIT_MESSAGE, HTTP_STATUS.FORBIDDEN);
    }

    await userRepository.incrementFreeAttemptsUsed(userId);

    console.log('[ACCESS] Device free attempt consumed (post-start):', {
      deviceId: deviceId.slice(0, 12),
      freeAttemptsUsed: updatedDevice.freeAttemptsUsed,
      userId: String(userId),
    });

    return sendCreated(res, { attempt, resumed: false }, 'Test attempt started');
  }),

  submit: asyncHandler(async (req, res) => {
    const payload = await testAttemptService.submit(req.user.id, req.params.id, req.body.answers);
    return sendSuccess(
      res,
      {
        attempt: payload.attempt,
        score: payload.score,
        accuracy: payload.accuracy,
        timeTaken: payload.timeTaken,
        weakTopics: payload.weakTopics,
        correctAnswers: payload.correctAnswers,
      },
      'Test submitted'
    );
  }),

  attemptsHistory: asyncHandler(async (req, res) => {
    const attempts = await testAttemptService.listHistory(req.user.id, req.params.id);
    return sendSuccess(res, { attempts }, 'Test attempts');
  }),

  /**
   * Backend source of truth for tests CTA state (Resume/Retry/Start/Completed).
   * Used by mobile to avoid local-only heuristics.
   */
  statusMine: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    const rows = await testAttemptRepository.getStatusFlagsByUser(userId);
    const premium = isPremiumUser(user);

    // Shape: { [testId]: { hasOpenAttempt, hasCompletedAttempt, canRetry } }
    const status = {};

    for (const row of rows || []) {
      const testId = String(row?.testId ?? '');
      if (!testId) continue;
      status[testId] = {
        hasOpenAttempt: !!row?.hasOpenAttempt,
        hasCompletedAttempt: !!row?.hasCompletedAttempt,
        canRetry: premium,
      };
    }

    return sendSuccess(res, { status }, 'Test status');
  }),
};
