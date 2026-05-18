import { learningSessionService } from '../services/learningSessionService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const learningSessionController = {
  getById: asyncHandler(async (req, res) => {
    const payload = await learningSessionService.getResultViewBySessionId(
      req.user.id,
      req.params.sessionId
    );
    return sendSuccess(res, payload, 'Learning session');
  }),

  listRecent: asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 15, 1), 50);
    const sessions = await learningSessionService.listRecent(req.user.id, { limit });
    return sendSuccess(res, { sessions }, 'Recent learning sessions');
  }),
};
