import { practiceRevealService } from '../services/practiceRevealService.js';
import { practiceIssuanceService } from '../services/practiceIssuanceService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const practiceController = {
  issue: asyncHandler(async (req, res) => {
    const payload = await practiceIssuanceService.issueFromRequest(req.user.id, req.body);
    return sendSuccess(res, payload, 'Practice session issued');
  }),

  reveal: asyncHandler(async (req, res) => {
    const payload = await practiceRevealService.reveal(req.user.id, req.body);
    return sendSuccess(res, payload, 'Practice results revealed');
  }),
};
