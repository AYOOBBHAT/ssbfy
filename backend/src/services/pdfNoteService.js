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
};
