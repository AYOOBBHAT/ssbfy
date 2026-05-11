import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { subjectRepository } from '../repositories/subjectRepository.js';
import { postRepository } from '../repositories/postRepository.js';
import { logger } from '../utils/logger.js';
import { cachedSubjectsList } from '../utils/ttlCache.js';

export const subjectService = {
  async list(filter = {}) {
    if (filter.isActive === true) {
      return cachedSubjectsList(filter, () => subjectRepository.findAll(filter));
    }
    return subjectRepository.findAll(filter);
  },

  /** @deprecated Use `list({ postId })` — same filter semantics. */
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

    if (postId) {
      const post = await postRepository.findById(postId);
      if (!post) {
        throw new AppError('Post not found', HTTP_STATUS.BAD_REQUEST);
      }
    }

    const duplicate = await subjectRepository.findOneByNameGlobal(trimmedName);
    if (duplicate) {
      throw new AppError(
        'A subject with this name already exists (names are unique globally, case-insensitive).',
        HTTP_STATUS.CONFLICT
      );
    }

    try {
      return await subjectRepository.create({
        name: trimmedName,
        postId: postId ?? null,
        order,
      });
    } catch (err) {
      if (err?.code === 11000) {
        throw new AppError(
          'A subject with this name already exists (names are unique globally, case-insensitive).',
          HTTP_STATUS.CONFLICT
        );
      }
      throw err;
    }
  },

  /**
   * Partial update. `name`, `order`, `isActive` mutable. `postId` is not
   * accepted here — use migration tools to normalize legacy rows.
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
      if (trimmedName.toLowerCase() !== String(existing.name).toLowerCase()) {
        const duplicate = await subjectRepository.findOneByNameGlobal(trimmedName);
        if (duplicate && String(duplicate._id) !== String(id)) {
          throw new AppError(
            'A subject with this name already exists (names are unique globally, case-insensitive).',
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
          'A subject with this name already exists (names are unique globally, case-insensitive).',
          HTTP_STATUS.CONFLICT
        );
      }
      throw err;
    }

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

function pickChanges(before, update) {
  const out = {};
  for (const key of ['name', 'order', 'isActive']) {
    if (update[key] !== undefined && update[key] !== before[key]) {
      out[key] = { from: before[key], to: update[key] };
    }
  }
  return out;
}
