import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { pdfNoteRepository } from '../repositories/pdfNoteRepository.js';
import { postRepository } from '../repositories/postRepository.js';

export const pdfNoteService = {
  /**
   * List PDF notes, optionally scoped to a post. Active-only by default
   * so the student-facing GET never leaks disabled uploads.
   */
  async list({ postId, includeInactive = false } = {}) {
    const filter = {};
    if (postId) filter.postId = postId;
    if (!includeInactive) filter.isActive = true;
    return pdfNoteRepository.findAll(filter);
  },

  /**
   * Persist a PDF note's metadata. The caller (controller) is responsible
   * for having already uploaded the file to the storage backend
   * (Cloudinary) and for destroying the uploaded asset if this call
   * throws, so we don't accumulate orphaned blobs.
   */
  async create({
    title,
    postId,
    fileUrl,
    fileName,
    storedName,
    fileSize,
    mimeType,
    uploadedBy,
  } = {}) {
    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    if (!trimmedTitle) {
      throw new AppError('Title is required', HTTP_STATUS.BAD_REQUEST);
    }

    // Ensure the post exists and is active before we commit the note —
    // otherwise students would see a PDF under an inactive post.
    const post = await postRepository.findById(postId);
    if (!post) {
      throw new AppError('Post not found', HTTP_STATUS.BAD_REQUEST);
    }
    if (post.isActive === false) {
      throw new AppError(
        'Post is inactive; cannot attach PDFs to it.',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    return pdfNoteRepository.create({
      title: trimmedTitle,
      postId,
      fileUrl,
      fileName,
      storedName,
      fileSize,
      mimeType,
      uploadedBy,
    });
  },

  /**
   * Partial update. Currently only `isActive` is patchable — moving a PDF
   * across posts is a re-upload, not an edit, and the file body itself
   * is immutable once stored in Cloudinary.
   *
   * `actor` is the authenticated admin; used for the audit log line so
   * disables are traceable in Render logs.
   */
  async update(id, patch = {}, actor = null) {
    const before = await pdfNoteRepository.findById(id);
    if (!before) {
      throw new AppError('PDF note not found', HTTP_STATUS.NOT_FOUND);
    }

    const update = {};
    if (typeof patch.isActive === 'boolean') {
      update.isActive = patch.isActive;
    }

    if (Object.keys(update).length === 0) {
      throw new AppError(
        'No valid fields provided to update',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const updated = await pdfNoteRepository.updateById(id, update);

    if (
      typeof update.isActive === 'boolean' &&
      update.isActive !== before.isActive
    ) {
      const actorId = actor?.id ? String(actor.id) : 'unknown';
      console.log(
        `[ADMIN] PDF note ${update.isActive ? 'enabled' : 'disabled'}:`,
        { id: String(id), userId: actorId }
      );
    }

    return updated;
  },
};
