import { noteService } from '../services/noteService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { ROLES } from '../constants/roles.js';

/**
 * Admin-only bypass: an authenticated admin may pass `includeInactive=true`
 * on the GET to see disabled notes in the management UI. Anyone else
 * (anonymous or authenticated non-admin) always gets the active-only
 * list, even if they try to sneak the flag.
 */
function shouldIncludeInactive(req) {
  const wanted = String(req.query.includeInactive || '').toLowerCase() === 'true';
  return wanted && req.user?.role === ROLES.ADMIN;
}

export const noteController = {
  /** GET /api/notes?postId=&subjectId=&topicId=&topicIds=&includeInactive= */
  list: asyncHandler(async (req, res) => {
    const { postId, subjectId, topicId } = req.query;
    // `topicIdList` was normalised by the validator from `topicIds` (CSV
    // string OR repeated query param). Empty array means "not sent";
    // the service treats it as a no-op.
    const topicIds = Array.isArray(req.query.topicIdList)
      ? req.query.topicIdList
      : [];
    const notes = await noteService.list({
      postId,
      subjectId,
      topicId,
      topicIds,
      includeInactive: shouldIncludeInactive(req),
    });
    return sendSuccess(res, { notes }, 'Notes');
  }),

  /** POST /api/notes — admin-only; enforces hierarchy in the service. */
  create: asyncHandler(async (req, res) => {
    const { title, content, postId, subjectId, topicId } = req.body;
    const note = await noteService.create({
      title,
      content,
      postId,
      subjectId,
      topicId,
    });
    return sendCreated(res, { note }, 'Note created');
  }),

  /** PATCH /api/notes/:id — admin only. Partial update. */
  update: asyncHandler(async (req, res) => {
    const { title, content, isActive } = req.body;
    const note = await noteService.update(
      req.params.id,
      { title, content, isActive },
      req.user
    );
    return sendSuccess(res, { note }, 'Note updated');
  }),
};
