import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { noteRepository } from '../repositories/noteRepository.js';
import { subjectRepository } from '../repositories/subjectRepository.js';
import { topicRepository } from '../repositories/topicRepository.js';
import { postRepository } from '../repositories/postRepository.js';
import { logger } from '../utils/logger.js';

/**
 * Walk Post → Subject → Topic and verify the triple is internally
 * consistent AND every level is currently active. Returns the loaded
 * docs so callers can use them (e.g. to echo the post/subject name).
 *
 * Throws 400 `AppError` with a precise message for each failure mode so
 * the admin UI can show something meaningful instead of "Bad Request".
 */
async function resolveHierarchy({ postId, subjectId, topicId }) {
  const [post, subject, topic] = await Promise.all([
    postRepository.findById(postId),
    subjectRepository.findById(subjectId),
    topicRepository.findById(topicId),
  ]);

  if (!post) {
    throw new AppError('Post not found', HTTP_STATUS.BAD_REQUEST);
  }
  if (post.isActive === false) {
    throw new AppError(
      'Post is inactive; cannot attach notes to it.',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (!subject) {
    throw new AppError('Subject not found', HTTP_STATUS.BAD_REQUEST);
  }
  if (subject.isActive === false) {
    throw new AppError(
      'Subject is inactive; cannot attach notes to it.',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  // Global subjects (`postId` null) are reusable across posts; the note's
  // `postId` pins which exam the note appears under. Legacy subjects still
  // tied to a single post must match that post.
  if (subject.postId != null && String(subject.postId) !== String(postId)) {
    throw new AppError(
      'Subject does not belong to the given post.',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (!topic) {
    throw new AppError('Topic not found', HTTP_STATUS.BAD_REQUEST);
  }
  if (topic.isActive === false) {
    throw new AppError(
      'Topic is inactive; cannot attach notes to it.',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  if (String(topic.subjectId) !== String(subjectId)) {
    throw new AppError(
      'Topic does not belong to the given subject.',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  return { post, subject, topic };
}

export const noteService = {
  /**
   * List notes with optional scope filters. Active-only by default so
   * students never see disabled content; an admin tool that needs to see
   * disabled notes can pass `{ includeInactive: true }` explicitly.
   *
   * `topicIds` (array) takes precedence over the single `topicId` when
   * both are given — callers using the multi-topic form almost always
   * mean "anything in this set", and silently ANDing a single id on top
   * would give counter-intuitive results.
   */
  async list({
    postId,
    subjectId,
    topicId,
    topicIds,
    includeInactive = false,
  } = {}) {
    const filter = {};
    if (postId) filter.postId = postId;
    if (subjectId) filter.subjectId = subjectId;
    if (Array.isArray(topicIds) && topicIds.length > 0) {
      filter.topicId = { $in: topicIds };
    } else if (topicId) {
      filter.topicId = topicId;
    }
    if (!includeInactive) filter.isActive = true;
    return noteRepository.findAll(filter);
  },

  async getById(id) {
    const note = await noteRepository.findById(id);
    if (!note || note.isActive === false) {
      throw new AppError('Note not found', HTTP_STATUS.NOT_FOUND);
    }
    return note;
  },

  async create({ title, content, postId, subjectId, topicId } = {}) {
    // Trim here instead of trusting the validator so we don't depend on
    // validator ordering if this service is ever called from elsewhere.
    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    if (!trimmedTitle) {
      throw new AppError('Note title is required', HTTP_STATUS.BAD_REQUEST);
    }
    if (typeof content !== 'string' || content.length === 0) {
      throw new AppError('Note content is required', HTTP_STATUS.BAD_REQUEST);
    }

    // Hierarchy consistency is enforced at the service layer so every
    // write path (admin PATCH UIs, future import scripts, etc.) shares
    // the same invariant: topic ⊂ subject ⊂ post.
    await resolveHierarchy({ postId, subjectId, topicId });

    return noteRepository.create({
      title: trimmedTitle,
      content,
      postId,
      subjectId,
      topicId,
    });
  },

  /**
   * Partial update. Only `title`, `content`, and `isActive` can be patched
   * — the Post/Subject/Topic of an existing note is immutable (moving a
   * note across the hierarchy is a re-create, not an edit). Callers must
   * supply at least one field.
   *
   * `actor` is the authenticated admin; currently used only for audit
   * logs but kept in the signature so we can stamp `updatedBy` here if
   * the model later grows that field.
   */
  async update(id, patch = {}, actor = null) {
    const before = await noteRepository.findById(id);
    if (!before) {
      throw new AppError('Note not found', HTTP_STATUS.NOT_FOUND);
    }

    const update = {};
    if (typeof patch.title === 'string') {
      const trimmed = patch.title.trim();
      if (!trimmed) {
        throw new AppError('Title cannot be empty', HTTP_STATUS.BAD_REQUEST);
      }
      update.title = trimmed;
    }
    if (typeof patch.content === 'string') {
      if (patch.content.length === 0) {
        throw new AppError('Content cannot be empty', HTTP_STATUS.BAD_REQUEST);
      }
      update.content = patch.content;
    }
    if (typeof patch.isActive === 'boolean') {
      update.isActive = patch.isActive;
    }

    if (Object.keys(update).length === 0) {
      throw new AppError(
        'No valid fields provided to update',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const updated = await noteRepository.updateById(id, update);

    // Audit log for status flips — makes disables traceable in the logs.
    if (
      typeof update.isActive === 'boolean' &&
      update.isActive !== before.isActive
    ) {
      const actorId = actor?.id ? String(actor.id) : 'unknown';
      logger.info(
        `[ADMIN] Note ${update.isActive ? 'enabled' : 'disabled'}:`,
        { id: String(id), userId: actorId }
      );
    }

    return updated;
  },
};
