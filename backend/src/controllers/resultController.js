import { resultService } from '../services/resultService.js';
import { testAttemptService } from '../services/testAttemptService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const resultController = {
  listMine: asyncHandler(async (req, res) => {
    const results = await resultService.listForUser(req.user.id);
    return sendSuccess(res, { results }, 'Results');
  }),

  /** GET /results/attempt/:attemptId — full review payload for one mock attempt */
  getAttemptResult: asyncHandler(async (req, res) => {
    const payload = await testAttemptService.getResultViewByAttemptId(req.user.id, req.params.attemptId);
    return sendSuccess(res, payload, 'Attempt result');
  }),

  getById: asyncHandler(async (req, res) => {
    const result = await resultService.getById(req.params.id, req.user.id);
    return sendSuccess(res, { result }, 'Result');
  }),
};
