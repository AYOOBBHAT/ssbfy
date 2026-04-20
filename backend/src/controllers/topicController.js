import { topicService } from '../services/topicService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { ROLES } from '../constants/roles.js';

function shouldIncludeInactive(req) {
  const wanted = String(req.query.includeInactive || '').toLowerCase() === 'true';
  return wanted && req.user?.role === ROLES.ADMIN;
}

export const topicController = {
  list: asyncHandler(async (req, res) => {
    const { subjectId } = req.query;
    const filter = {};
    if (subjectId) filter.subjectId = subjectId;
    if (!shouldIncludeInactive(req)) filter.isActive = true;
    const topics = await topicService.list(filter);
    return sendSuccess(res, { topics }, 'Topics');
  }),

  getById: asyncHandler(async (req, res) => {
    const topic = await topicService.getById(req.params.id);
    return sendSuccess(res, { topic }, 'Topic');
  }),

  create: asyncHandler(async (req, res) => {
    const { name, subjectId, order } = req.body;
    const topic = await topicService.create({ name, subjectId, order });
    return sendCreated(res, { topic }, 'Topic created');
  }),

  update: asyncHandler(async (req, res) => {
    const { name, order, isActive } = req.body;
    const topic = await topicService.update(
      req.params.id,
      { name, order, isActive },
      req.user
    );
    return sendSuccess(res, { topic }, 'Topic updated');
  }),
};
