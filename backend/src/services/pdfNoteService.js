import mongoose from 'mongoose';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { pdfNoteRepository } from '../repositories/pdfNoteRepository.js';
import { postRepository } from '../repositories/postRepository.js';

function uniqueObjectIds(input) {
  const out = [];
  const seen = new Set();
  for (const v of input) {
    if (v == null || v === '') continue;
    const s = String(v);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(new mongoose.Types.ObjectId(s));
  }
  return out;
}

/**
 * Multipart text fields are often strings. `postIds` may be a JSON string
 * (`JSON.stringify` from the admin) even after validation — always coerce.
 */
function coalescePostIdsField(postIds) {
  if (Array.isArray(postIds)) {
    return postIds;
  }
  if (typeof postIds === 'string' && postIds.trim() !== '') {
    try {
      const parsed = JSON.parse(postIds);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Accept `postId` and/or `postIds` and return a non-empty, de-duplicated
 * array of ObjectIds. Legacy single `postId` is converted to `[postId]`.
 */
function resolveInputPostIds({ postId, postIds } = {}) {
  const raw = [];
  const arr = coalescePostIdsField(postIds);
  if (arr.length) {
    for (const id of arr) {
      if (id != null && id !== '') raw.push(id);
    }
  }
  if (postId != null && postId !== '') {
    raw.push(postId);
  }
  return uniqueObjectIds(raw);
}

/**
 * Ensure every id references an existing, active `Post`.
 */
async function assertAllPostsActiveByIds(oids) {
  if (oids.length < 1) {
    throw new AppError('At least one post is required', HTTP_STATUS.BAD_REQUEST);
  }
  const posts = await postRepository.findByIds(oids);
  if (posts.length !== oids.length) {
    throw new AppError('One or more posts not found', HTTP_STATUS.BAD_REQUEST);
  }
  for (const p of posts) {
    if (p.isActive === false) {
      throw new AppError(
        'One or more posts are inactive; cannot attach PDFs to them.',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }
  return oids;
}

/**
 * If `postIds` is empty but legacy `postId` exists, treat as `[postId]`.
 * Ensures every API consumer sees a consistent `postIds` array.
 */
function normalizePdfNoteDoc(doc) {
  if (!doc) return doc;
  const fromArr = Array.isArray(doc.postIds) ? doc.postIds : [];
  const effective =
    fromArr.length > 0
      ? uniqueObjectIds(fromArr)
      : doc.postId
        ? uniqueObjectIds([doc.postId])
        : [];

  return {
    ...doc,
    postIds: effective,
    postId: doc.postId ?? effective[0] ?? null,
  };
}

function mapList(docs) {
  if (!Array.isArray(docs)) return [];
  return docs.map((d) => normalizePdfNoteDoc(d));
}

function buildListFilterForPost(postId) {
  const oid = new mongoose.Types.ObjectId(String(postId));
  // New rows: `postIds` contains the post. Legacy: only `postId` set.
  return {
    $or: [{ postIds: oid }, { postId: oid }],
  };
}

export const pdfNoteService = {
  /**
   * List PDF notes, optionally scoped to a post. Active-only by default
   * so the student-facing GET never leaks disabled uploads.
   */
  async list({ postId, includeInactive = false } = {}) {
    const filter = {};
    if (postId) {
      Object.assign(filter, buildListFilterForPost(postId));
    }
    if (!includeInactive) filter.isActive = true;
    const rows = await pdfNoteRepository.findAll(filter);
    return mapList(rows);
  },

  /**
   * Persist a PDF note's metadata. The caller (controller) is responsible
   * for having already uploaded the file to the storage backend
   * (Cloudinary) and for destroying the uploaded asset if this call
   * throws, so we don't accumulate orphaned blobs.
   *
   * Accepts `postIds` and/or legacy `postId` (coerced to `postIds: [postId]`).
   */
  async create({
    title,
    postId,
    postIds,
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

    const oids = await assertAllPostsActiveByIds(
      resolveInputPostIds({ postId, postIds })
    );

    const firstPostId = oids[0];
    const created = await pdfNoteRepository.create({
      title: trimmedTitle,
      postIds: oids,
      postId: firstPostId,
      fileUrl,
      fileName,
      storedName,
      fileSize,
      mimeType,
      uploadedBy,
    });
    return normalizePdfNoteDoc(created);
  },

  /**
   * Partial update: `isActive` and/or `postIds` (replacements the full set
   * of applicable posts; deduped and validated on the server).
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
    if (Array.isArray(patch.postIds)) {
      if (patch.postIds.length < 1) {
        throw new AppError('postIds must include at least one post', HTTP_STATUS.BAD_REQUEST);
      }
      const oids = await assertAllPostsActiveByIds(uniqueObjectIds(patch.postIds));
      update.postIds = oids;
      update.postId = oids[0];
    }

    if (Object.keys(update).length === 0) {
      throw new AppError(
        'No valid fields provided to update',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const updated = await pdfNoteRepository.updateById(id, update);
    const out = normalizePdfNoteDoc(updated);

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

    return out;
  },
};
