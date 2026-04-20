import { questionService } from '../services/questionService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/response.js';

export const questionController = {
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
