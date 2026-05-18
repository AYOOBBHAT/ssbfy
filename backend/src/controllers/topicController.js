import { topicService } from '../services/topicService.js';
import { canonicalTopicService } from '../services/canonicalTopicService.js';
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

  taxonomyRename: asyncHandler(async (req, res) => {
    const topic = await canonicalTopicService.renameTopic(
      req.params.id,
      req.body.name,
      req.user
    );
    return sendSuccess(res, { topic }, 'Topic renamed');
  }),

  taxonomyAlias: asyncHandler(async (req, res) => {
    const topic = await canonicalTopicService.addAlias(
      req.params.id,
      req.body.alias,
      req.user
    );
    return sendSuccess(res, { topic }, 'Alias added');
  }),

  taxonomyMerge: asyncHandler(async (req, res) => {
    const result = await canonicalTopicService.mergeTopics(
      req.body.targetTopicId,
      req.body.sourceTopicIds,
      req.user
    );
    return sendSuccess(res, result, 'Topics merged');
  }),

  taxonomySplit: asyncHandler(async (req, res) => {
    const result = await canonicalTopicService.splitTopic(
      req.params.id,
      req.body.splits,
      req.user
    );
    return sendSuccess(res, result, 'Topic split');
  }),

  taxonomyBackfill: asyncHandler(async (req, res) => {
    const result = await canonicalTopicService.backfillAll(req.user?.id);
    return sendSuccess(res, result, 'Canonical topics backfilled');
  }),
};
