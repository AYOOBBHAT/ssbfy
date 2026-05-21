import { battleService } from '../services/battleService.js';
import { battleHistoryService } from '../services/battleHistoryService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/response.js';

export const battleController = {
  quota: asyncHandler(async (req, res) => {
    const payload = await battleService.getQuota(req.user.id);
    return sendSuccess(res, payload, 'Battle quota');
  }),

  availability: asyncHandler(async (req, res) => {
    const payload = await battleService.getAvailability({
      subjectId: req.query.subjectId,
      topicId: req.query.topicId,
      difficulty: req.query.difficulty,
    });
    return sendSuccess(res, payload, 'Battle availability');
  }),

  create: asyncHandler(async (req, res) => {
    const payload = await battleService.createBattle(req.user.id, req.body);
    return sendCreated(res, payload, 'Battle created');
  }),

  previewInvite: asyncHandler(async (req, res) => {
    const payload = await battleService.getByInviteCode(req.user.id, req.params.inviteCode);
    return sendSuccess(res, payload, 'Battle invite');
  }),

  join: asyncHandler(async (req, res) => {
    const payload = await battleService.joinBattle(req.user.id, req.params.inviteCode);
    return sendSuccess(res, payload, 'Joined battle');
  }),

  getById: asyncHandler(async (req, res) => {
    const payload = await battleService.getById(req.user.id, req.params.id);
    return sendSuccess(res, payload, 'Battle');
  }),

  start: asyncHandler(async (req, res) => {
    const payload = await battleService.startAttempt(req.user.id, req.params.id);
    return sendSuccess(res, payload, 'Battle attempt started');
  }),

  result: asyncHandler(async (req, res) => {
    const payload = await battleService.getBattleResultComparison(req.user.id, req.params.id);
    return sendSuccess(res, payload, 'Battle result');
  }),

  listMine: asyncHandler(async (req, res) => {
    const payload = await battleService.listMine(req.user.id, req.query);
    return sendSuccess(res, payload, 'Battles');
  }),

  history: asyncHandler(async (req, res) => {
    const payload = await battleHistoryService.getHistory(req.user.id, req.query);
    return sendSuccess(res, payload, 'Battle history');
  }),
};
