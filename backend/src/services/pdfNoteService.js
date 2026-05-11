import mongoose from 'mongoose';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { pdfNoteRepository } from '../repositories/pdfNoteRepository.js';
import { postRepository } from '../repositories/postRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { ROLES } from '../constants/roles.js';
import { isPremiumUser } from '../utils/freeTierAccess.js';
import { logger } from '../utils/logger.js';
import { pdfSigningBatchEnd, pdfSigningBatchStart } from '../utils/pdfSigningMetrics.js';
import { getSignedPdfUrl } from './pdfSupabaseStorage.js';

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

async function loadPostTitleMap(postIdStrings) {
  const unique = [...new Set((postIdStrings || []).filter(Boolean))];
  if (!unique.length) return new Map();
  const oids = unique.map((id) => new mongoose.Types.ObjectId(String(id)));
  const posts = await postRepository.findByIds(oids);
  return new Map(posts.map((p) => [String(p._id), p.name || p.slug || '']));
}

/**
 * Wire shape for PDF notes: no permanent `fileUrl`, no storage `storedName`.
 * `signedUrl` is short-lived (see env `pdfSignedUrlTtlSeconds`).
 */
async function pdfDocToClientDto(doc, postTitleMap) {
  if (!doc) return doc;
  const normalized = normalizePdfNoteDoc(doc);
  const path = typeof normalized.storedName === 'string' ? normalized.storedName.trim() : '';
  if (!path) {
    logger.warn('[PdfNote] skipping PDF without storedName', { id: String(normalized._id) });
    return null;
  }
  const first = normalized.postIds?.[0] || normalized.postId;
  const postTitle = first ? postTitleMap.get(String(first)) || '' : '';
  let signedUrl = '';
  try {
    signedUrl = await getSignedPdfUrl(path);
  } catch (e) {
    logger.warn('[PdfNote] createSignedUrl failed', {
      id: String(normalized._id),
      message: e?.message,
    });
  }
  return {
    _id: normalized._id,
    pdfId: String(normalized._id),
    title: normalized.title,
    fileName: normalized.fileName,
    fileSize: normalized.fileSize,
    mimeType: normalized.mimeType,
    postIds: normalized.postIds,
    postId: normalized.postId,
    isActive: normalized.isActive !== false,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    signedUrl,
    postTitle,
  };
}

async function enrichSinglePdfForClient(doc) {
  const normalized = normalizePdfNoteDoc(doc);
  const path = typeof normalized.storedName === 'string' ? normalized.storedName.trim() : '';
  if (!path) {
    return null;
  }
  const first = normalized.postIds?.[0] || normalized.postId;
  const postTitleMap = first ? await loadPostTitleMap([String(first)]) : new Map();
  return pdfDocToClientDto(normalized, postTitleMap);
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
   * One fresh signed URL for a single PDF (premium/admin). Uses the same
   * signing + cache stack as list; avoids refetching the full catalog when
   * a client only needs to refresh one expired link.
   */
  async getSignedUrlForViewer({ actingUser, pdfId }) {
    const doc = await pdfNoteRepository.findById(pdfId);
    if (!doc || doc.isActive === false) {
      throw new AppError('PDF note not found', HTTP_STATUS.NOT_FOUND);
    }
    const user = await userRepository.findById(actingUser.id);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }
    const isAdmin = actingUser.role === ROLES.ADMIN;
    if (!isPremiumUser(user) && !isAdmin) {
      throw new AppError('Premium required', HTTP_STATUS.FORBIDDEN);
    }
    const normalized = normalizePdfNoteDoc(doc);
    const path = typeof normalized.storedName === 'string' ? normalized.storedName.trim() : '';
    if (!path) {
      throw new AppError(
        'PDF note is missing storage metadata',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
    const signedUrl = await getSignedPdfUrl(path);
    return { signedUrl, pdfId: String(normalized._id) };
  },

  /**
   * List PDF notes for authorized clients (premium or admin).
   * Each row includes a short-lived `signedUrl`; never exposes `fileUrl` or `storedName`.
   */
  async listForClient({ postId, includeInactive = false } = {}) {
    pdfSigningBatchStart();
    const wall = Date.now();
    try {
      const filter = {};
      if (postId) {
        Object.assign(filter, buildListFilterForPost(postId));
      }
      if (!includeInactive) filter.isActive = true;
      const rows = await pdfNoteRepository.findAll(filter, { clientListProjection: true });
      const normalized = mapList(rows);
      const firstPostKeys = normalized
        .map((d) => {
          const first = d.postIds?.[0] || d.postId;
          return first ? String(first) : null;
        })
        .filter(Boolean);
      const postTitleMap = await loadPostTitleMap(firstPostKeys);
      const items = await Promise.all(
        normalized.map((doc) => pdfDocToClientDto(doc, postTitleMap))
      );
      return items.filter(Boolean);
    } finally {
      const stats = pdfSigningBatchEnd();
      const durationMs = Date.now() - wall;
      if (
        stats &&
        (stats.signCalls > 1 ||
          stats.cacheHits > 0 ||
          stats.waitDedupes > 0 ||
          durationMs > 300)
      ) {
        logger.debug(
          {
            msg: '[pdf-sign] listForClient',
            durationMs,
            signCalls: stats.signCalls,
            cacheHits: stats.cacheHits,
            waitDedupes: stats.waitDedupes,
          },
          'pdf list signing summary'
        );
      }
    }
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
      fileUrl: fileUrl || '',
      fileName,
      storedName,
      fileSize,
      mimeType,
      uploadedBy,
    });
    const out = await enrichSinglePdfForClient(created);
    if (!out) {
      throw new AppError(
        'PDF record is missing storage metadata (storedName)',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
    return out;
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
    const out = await enrichSinglePdfForClient(updated);
    if (!out) {
      throw new AppError(
        'PDF note is missing storage metadata (storedName)',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }

    if (
      typeof update.isActive === 'boolean' &&
      update.isActive !== before.isActive
    ) {
      const actorId = actor?.id ? String(actor.id) : 'unknown';
      logger.info(
        `[ADMIN] PDF note ${update.isActive ? 'enabled' : 'disabled'}:`,
        { id: String(id), userId: actorId }
      );
    }

    return out;
  },
};
