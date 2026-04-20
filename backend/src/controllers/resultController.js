import { resultService } from '../services/resultService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const resultController = {
  listMine: asyncHandler(async (req, res) => {
    const results = await resultService.listForUser(req.user.id);
    return sendSuccess(res, { results }, 'Results');
  }),

  getById: asyncHandler(async (req, res) => {
    const result = await resultService.getById(req.params.id, req.user.id);
    return sendSuccess(res, { result }, 'Result');
  }),
};
