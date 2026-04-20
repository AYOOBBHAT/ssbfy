import { subjectService } from '../services/subjectService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { ROLES } from '../constants/roles.js';

/**
 * Return `true` only if the caller is an authenticated admin AND explicitly
 * asked for inactive items. Everyone else always gets active-only.
 */
function shouldIncludeInactive(req) {
  const wanted = String(req.query.includeInactive || '').toLowerCase() === 'true';
  return wanted && req.user?.role === ROLES.ADMIN;
}

export const subjectController = {
  list: asyncHandler(async (req, res) => {
    const { postId } = req.query;
    const filter = {};
    if (postId) filter.postId = postId;
    if (!shouldIncludeInactive(req)) filter.isActive = true;
    const subjects = await subjectService.list(filter);
    return sendSuccess(res, { subjects }, 'Subjects');
  }),

  getById: asyncHandler(async (req, res) => {
    const subject = await subjectService.getById(req.params.id);
    return sendSuccess(res, { subject }, 'Subject');
  }),

  create: asyncHandler(async (req, res) => {
    const { name, postId, order } = req.body;
    const subject = await subjectService.create({ name, postId, order });
    return sendCreated(res, { subject }, 'Subject created');
  }),

  update: asyncHandler(async (req, res) => {
    const { name, order, isActive } = req.body;
    // `req.user` was populated by the admin guard; forwarded so the service
    // can stamp `updatedBy` and include the actor in audit logs.
    const subject = await subjectService.update(
      req.params.id,
      { name, order, isActive },
      req.user
    );
    return sendSuccess(res, { subject }, 'Subject updated');
  }),
};
