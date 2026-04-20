import { subjectService } from '../services/subjectService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const subjectController = {
  list: asyncHandler(async (req, res) => {
    const { postId } = req.query;
    if (!postId) {
      return sendSuccess(res, { subjects: [] }, 'Provide postId query param to list subjects');
    }
    const subjects = await subjectService.listByPost(postId);
    return sendSuccess(res, { subjects }, 'Subjects');
  }),

  getById: asyncHandler(async (req, res) => {
    const subject = await subjectService.getById(req.params.id);
    return sendSuccess(res, { subject }, 'Subject');
  }),
};
