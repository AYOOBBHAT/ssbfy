import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { topicRepository } from '../repositories/topicRepository.js';
import { subjectRepository } from '../repositories/subjectRepository.js';
import { postRepository } from '../repositories/postRepository.js';
import { logger } from '../utils/logger.js';

export const topicService = {
  async list(filter = {}) {
    return topicRepository.findAll(filter);
  },

  async listBySubject(subjectId) {
    return topicRepository.findAll({ subjectId });
  },

  async getById(id) {
    const topic = await topicRepository.findById(id);
    if (!topic) {
      throw new AppError('Topic not found', HTTP_STATUS.NOT_FOUND);
    }
    return topic;
  },

  async create({ name, subjectId, order = 0 }) {
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) {
      throw new AppError('Topic name is required', HTTP_STATUS.BAD_REQUEST);
    }
    if (!subjectId) {
      throw new AppError('subjectId is required', HTTP_STATUS.BAD_REQUEST);
    }

    const subject = await subjectRepository.findById(subjectId);
    if (!subject) {
      throw new AppError('Subject not found', HTTP_STATUS.BAD_REQUEST);
    }
    // Enforce hierarchy Post → Subject → Topic: the subject must already be
    // bound to an existing post. Legacy orphan subjects are rejected.
    if (!subject.postId) {
      throw new AppError(
        'Subject is not linked to any post; cannot create topic.',
        HTTP_STATUS.BAD_REQUEST
      );
    }
    const post = await postRepository.findById(subject.postId);
    if (!post) {
      throw new AppError(
        'Parent post for this subject no longer exists.',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const duplicate = await topicRepository.findOneByNameInSubject(trimmedName, subjectId);
    if (duplicate) {
      throw new AppError(
        'A topic with this name already exists for this subject.',
        HTTP_STATUS.CONFLICT
      );
    }

    return topicRepository.create({ name: trimmedName, subjectId, order });
  },

  /**
   * Partial update. `subjectId` is intentionally immutable — moving a topic
   * between subjects would invalidate every question referencing it.
   *
   * `actor` is the authenticated user issuing the change; it is persisted
   * as `updatedBy` for audit purposes and logged alongside status changes.
   */
  async update(id, patch, actor = null) {
    const existing = await topicRepository.findById(id);
    if (!existing) {
      throw new AppError('Topic not found', HTTP_STATUS.NOT_FOUND);
    }

    const update = {};

    if (patch.name !== undefined) {
      const trimmedName = typeof patch.name === 'string' ? patch.name.trim() : '';
      if (!trimmedName) {
        throw new AppError('Topic name cannot be empty', HTTP_STATUS.BAD_REQUEST);
      }
      if (trimmedName.toLowerCase() !== String(existing.name).toLowerCase()) {
        const duplicate = await topicRepository.findOneByNameInSubject(
          trimmedName,
          existing.subjectId
        );
        if (duplicate && String(duplicate._id) !== String(id)) {
          throw new AppError(
            'A topic with this name already exists for this subject.',
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
      return existing;
    }

    // `updatedAt` is refreshed automatically by Mongoose's `timestamps`
    // option on every save; we only need to stamp the actor.
    const actorId = actor?.id ? String(actor.id) : null;
    if (actorId) {
      update.updatedBy = actorId;
    }

    const updated = await topicRepository.updateById(id, update);

    // Structured audit trail — status flips have their own message so they
    // can be grepped quickly in production logs, independent of renames/
    // reorders which go through the generic "updated" line.
    if (patch.isActive !== undefined && Boolean(patch.isActive) !== existing.isActive) {
      const verb = update.isActive ? 'enabled' : 'disabled';
      logger.info(`[ADMIN] Topic ${verb}:`, {
        id: String(existing._id),
        name: existing.name,
        userId: actorId,
      });
    }
    const nonStatusTouched =
      update.name !== undefined || update.order !== undefined;
    if (nonStatusTouched) {
      logger.info('[ADMIN] Topic updated:', {
        id: String(existing._id),
        changes: pickChanges(existing, update),
        userId: actorId,
      });
    }

    return updated;
  },
};

function pickChanges(before, update) {
  const out = {};
  for (const key of ['name', 'order', 'isActive']) {
    if (update[key] !== undefined && update[key] !== before[key]) {
      out[key] = { from: before[key], to: update[key] };
    }
  }
  return out;
}
