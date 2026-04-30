import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { subjectRepository } from '../repositories/subjectRepository.js';
import { postRepository } from '../repositories/postRepository.js';
import { logger } from '../utils/logger.js';

export const subjectService = {
  async list(filter = {}) {
    return subjectRepository.findAll(filter);
  },

  async listByPost(postId) {
    if (!postId) {
      throw new AppError('postId is required', HTTP_STATUS.BAD_REQUEST);
    }
    return subjectRepository.findAll({ postId });
  },

  async getById(id) {
    const subject = await subjectRepository.findById(id);
    if (!subject) {
      throw new AppError('Subject not found', HTTP_STATUS.NOT_FOUND);
    }
    return subject;
  },

  async create({ name, postId, order = 0 }) {
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) {
      throw new AppError('Subject name is required', HTTP_STATUS.BAD_REQUEST);
    }
    if (!postId) {
      throw new AppError('postId is required', HTTP_STATUS.BAD_REQUEST);
    }

    const post = await postRepository.findById(postId);
    if (!post) {
      throw new AppError('Post not found', HTTP_STATUS.BAD_REQUEST);
    }

    // App-level duplicate guard — case-insensitive, scoped to the post.
    const duplicate = await subjectRepository.findOneByNameInPost(trimmedName, postId);
    if (duplicate) {
      throw new AppError(
        'A subject with this name already exists for this post.',
        HTTP_STATUS.CONFLICT
      );
    }

    try {
      return await subjectRepository.create({ name: trimmedName, postId, order });
    } catch (err) {
      // Storage-level backstop in case of a race between the duplicate check
      // and the insert: MongoDB duplicate-key error code is 11000.
      if (err?.code === 11000) {
        throw new AppError(
          'A subject with this name already exists for this post.',
          HTTP_STATUS.CONFLICT
        );
      }
      throw err;
    }
  },

  /**
   * Partial update. Only `name`, `order`, and `isActive` are mutable from
   * the admin PATCH endpoint — `postId` is intentionally immutable because
   * moving a subject between posts would invalidate every question tagged
   * under it.
   *
   * `actor` is the authenticated user issuing the change; it is persisted as
   * `updatedBy` for audit purposes and also included in the admin log line.
   */
  async update(id, patch, actor = null) {
    const existing = await subjectRepository.findById(id);
    if (!existing) {
      throw new AppError('Subject not found', HTTP_STATUS.NOT_FOUND);
    }

    const update = {};

    if (patch.name !== undefined) {
      const trimmedName = typeof patch.name === 'string' ? patch.name.trim() : '';
      if (!trimmedName) {
        throw new AppError('Subject name cannot be empty', HTTP_STATUS.BAD_REQUEST);
      }
      // Only re-check for duplicates when the name actually changed; the
      // case-insensitive compound index would reject it anyway, but giving
      // a 409 with a clear message is kinder than a 500.
      if (trimmedName.toLowerCase() !== String(existing.name).toLowerCase()) {
        const duplicate = await subjectRepository.findOneByNameInPost(
          trimmedName,
          existing.postId
        );
        if (duplicate && String(duplicate._id) !== String(id)) {
          throw new AppError(
            'A subject with this name already exists for this post.',
            HTTP_STATUS.CONFLICT
          );
        }
      }
      update.name = trimmedName;
    }

    if (patch.order !== undefined) {
      update.order = patch.order;
    }
    if (patch.isActive !== undefined) {
      update.isActive = Boolean(patch.isActive);
    }

    if (Object.keys(update).length === 0) {
      // Nothing to change — return the unchanged doc so the client has a
      // consistent shape to re-render from.
      return existing;
    }

    // Stamp the audit fields on every real change. `updatedAt` is updated
    // automatically by Mongoose via `{ timestamps: true }`; we only need
    // to stamp `updatedBy` explicitly.
    const actorId = actor?.id ? String(actor.id) : null;
    if (actorId) {
      update.updatedBy = actorId;
    }

    let updated;
    try {
      updated = await subjectRepository.updateById(id, update);
    } catch (err) {
      if (err?.code === 11000) {
        throw new AppError(
          'A subject with this name already exists for this post.',
          HTTP_STATUS.CONFLICT
        );
      }
      throw err;
    }

    // Emit an admin-trail log line for each meaningful change. Status flips
    // get their own message so they're trivial to grep (`Subject disabled`
    // / `Subject enabled`); other field changes produce a generic update
    // line so the audit trail is complete, not just status-focused.
    if (patch.isActive !== undefined && Boolean(patch.isActive) !== existing.isActive) {
      const verb = update.isActive ? 'enabled' : 'disabled';
      logger.info(`[ADMIN] Subject ${verb}:`, {
        id: String(existing._id),
        name: existing.name,
        userId: actorId,
      });
    }
    const nonStatusTouched =
      update.name !== undefined || update.order !== undefined;
    if (nonStatusTouched) {
      logger.info('[ADMIN] Subject updated:', {
        id: String(existing._id),
        changes: pickChanges(existing, update),
        userId: actorId,
      });
    }

    return updated;
  },
};

/**
 * Build a compact before/after diff for audit logs. Only fields present in
 * the update are reported to keep logs small and signal-dense.
 */
function pickChanges(before, update) {
  const out = {};
  for (const key of ['name', 'order', 'isActive']) {
    if (update[key] !== undefined && update[key] !== before[key]) {
      out[key] = { from: before[key], to: update[key] };
    }
  }
  return out;
}
