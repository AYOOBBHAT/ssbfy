import { questionService } from '../services/questionService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/response.js';

export const questionController = {
  adminList: asyncHandler(async (req, res) => {
    const payload = await questionService.adminList(req.query);
    return sendSuccess(res, payload, 'Questions');
  }),

  getByIdForAdmin: asyncHandler(async (req, res) => {
    const question = await questionService.getByIdForAdmin(req.params.id);
    return sendSuccess(res, { question }, 'Question');
  }),

  list: asyncHandler(async (req, res) => {
    const rawIds = req.query.ids;
    if (rawIds !== undefined && rawIds !== null && String(rawIds).trim() !== '') {
      const idTokens = String(rawIds)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const { questions, total, limit, skip } = await questionService.listByIds(idTokens);
      return sendSuccess(res, { questions, total, limit, skip }, 'Questions');
    }

    const { questions, total, limit, skip } = await questionService.list(req.query);
    return sendSuccess(res, { questions, total, limit, skip }, 'Questions');
  }),

  getById: asyncHandler(async (req, res) => {
    const question = await questionService.getById(req.params.id);
    return sendSuccess(res, { question }, 'Question');
  }),

  weakPractice: asyncHandler(async (req, res) => {
    // `topicIdList` was normalised by the validator from either a
    // comma-separated string or a repeated query param.
    const topicIds = req.query.topicIdList || [];
    const limit = req.query.limit ?? 10;
    const { questions } = await questionService.weakPractice({ topicIds, limit });
    return sendSuccess(res, { questions }, 'Weak-topic practice questions');
  }),

  smartPractice: asyncHandler(async (req, res) => {
    const { postId, subjectId, topicId, difficulty, limit } = req.body || {};
    const { questions } = await questionService.smartPractice({
      postId,
      subjectId,
      topicId,
      difficulty,
      limit: limit ?? 10,
    });
    return sendSuccess(res, { questions }, 'Smart practice questions');
  }),

  create: asyncHandler(async (req, res) => {
    const question = await questionService.create(req.body);
    return sendCreated(res, { question }, 'Question created');
  }),

  update: asyncHandler(async (req, res) => {
    const question = await questionService.update(req.params.id, req.body);
    return sendSuccess(res, { question }, 'Question updated');
  }),

  remove: asyncHandler(async (req, res) => {
    const question = await questionService.softDelete(req.params.id);
    return sendSuccess(res, { question }, 'Question deactivated');
  }),
};
