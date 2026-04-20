import { topicService } from '../services/topicService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const topicController = {
  list: asyncHandler(async (req, res) => {
    const { subjectId } = req.query;
    if (!subjectId) {
      return sendSuccess(res, { topics: [] }, 'Provide subjectId query param to list topics');
    }
    const topics = await topicService.listBySubject(subjectId);
    return sendSuccess(res, { topics }, 'Topics');
  }),

  getById: asyncHandler(async (req, res) => {
    const topic = await topicService.getById(req.params.id);
    return sendSuccess(res, { topic }, 'Topic');
  }),
};
