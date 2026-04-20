import { testService } from '../services/testService.js';
import { testAttemptService } from '../services/testAttemptService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/response.js';

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
    const { attempt, resumed } = await testAttemptService.start(req.user.id, req.params.id);
    if (resumed) {
      return sendSuccess(res, { attempt, resumed: true }, 'Test attempt resumed');
    }
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
};
