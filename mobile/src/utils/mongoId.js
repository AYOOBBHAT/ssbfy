/**
 * Normalize MongoDB ObjectId references before backend API calls.
 * Accepts string ids, ObjectId-like values, and populated `{ _id, name }` refs.
 */

import logger from './logger.js';

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

function devWarn(label, message, meta) {
  if (__DEV__) {
    logger.debug(message, { label, ...(meta ?? {}) });
  }
}

/** @param {unknown} id */
export function isValidMongoObjectId(id) {
  return typeof id === 'string' && OBJECT_ID_RE.test(id);
}

/**
 * @param {unknown} ref
 * @param {string} [label='id']
 * @returns {string | null}
 */
export function resolveMongoId(ref, label = 'id') {
  if (ref == null) return null;

  if (typeof ref === 'object') {
    const raw = ref._id ?? ref.id;
    if (raw == null) {
      devWarn(label, '[mongoId] object ref missing _id', { ref });
      return null;
    }
    const s = String(raw).trim();
    if (!s || s === '[object Object]' || !isValidMongoObjectId(s)) {
      devWarn(label, '[mongoId] invalid id on object ref', { raw: s });
      return null;
    }
    return s;
  }

  const s = String(ref).trim();
  if (!s) return null;
  if (s === '[object Object]') {
    devWarn(label, '[mongoId] rejected [object Object] string');
    return null;
  }
  if (!isValidMongoObjectId(s)) {
    devWarn(label, '[mongoId] rejected malformed id string', { raw: s });
    return null;
  }
  return s;
}

/**
 * @param {unknown[]} ids
 * @param {string} [label='ids']
 * @returns {string[]}
 */
export function filterValidMongoIds(ids, label = 'ids') {
  if (!Array.isArray(ids)) return [];
  const out = [];
  const seen = new Set();
  for (const t of ids) {
    const id = resolveMongoId(t, label);
    if (!id) {
      if (t != null && t !== '') {
        devWarn(label, '[mongoId] filtered invalid id from list', { input: t });
      }
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * @param {unknown[]} ids
 * @param {string} [label='ids']
 * @returns {string}
 */
export function joinValidMongoIds(ids, label = 'ids') {
  return filterValidMongoIds(ids, label).join(',');
}

/**
 * @param {unknown} ref
 * @param {string} label
 * @returns {string | null} encoded path segment, or null if invalid
 */
export function encodeMongoIdPath(ref, label = 'id') {
  const id = resolveMongoId(ref, label);
  if (!id) {
    if (ref != null && ref !== '') {
      devWarn(label, '[mongoId] skipped path — invalid id', { input: ref });
    }
    return null;
  }
  return encodeURIComponent(id);
}

/**
 * @param {Array<{ questionId?: unknown, [key: string]: unknown }>} answers
 * @returns {object[]}
 */
export function sanitizeTestAnswers(answers) {
  if (!Array.isArray(answers)) return [];
  const out = [];
  for (const row of answers) {
    if (!row || typeof row !== 'object') continue;
    const questionId = resolveMongoId(row.questionId, 'questionId');
    if (!questionId) {
      if (row.questionId != null) {
        devWarn('questionId', '[mongoId] dropped answer row (invalid questionId)', {
          questionId: row.questionId,
        });
      }
      continue;
    }
    out.push({ ...row, questionId });
  }
  return out;
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
export function sanitizeSmartPracticeBody(body = {}) {
  if (!body || typeof body !== 'object') return {};
  const out = { ...body };
  for (const key of ['postId', 'subjectId', 'topicId']) {
    if (out[key] == null) continue;
    const id = resolveMongoId(out[key], key);
    if (id) {
      out[key] = id;
    } else {
      devWarn(key, `[mongoId] removed invalid ${key} from smart-practice body`, {
        [key]: out[key],
      });
      delete out[key];
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>} params
 * @returns {Record<string, string>}
 */
export function sanitizeNotesQueryParams(params = {}) {
  const clean = {};
  const postId = resolveMongoId(params.postId, 'postId');
  if (postId) clean.postId = postId;

  const subjectId = resolveMongoId(params.subjectId, 'subjectId');
  if (subjectId) clean.subjectId = subjectId;

  if (Array.isArray(params.topicIds)) {
    const ids = filterValidMongoIds(params.topicIds, 'topicIds');
    if (ids.length > 0) clean.topicIds = ids.join(',');
  } else if (params.topicId != null) {
    const topicId = resolveMongoId(params.topicId, 'topicId');
    if (topicId) clean.topicId = topicId;
  }

  return clean;
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown> | null} null when required id missing
 */
/**
 * Extract valid question ids from question documents for Test navigation / API.
 * @param {unknown[]} questions
 * @returns {string[]}
 */
export function questionIdsFromDocs(questions) {
  if (!Array.isArray(questions)) return [];
  return filterValidMongoIds(
    questions.map((q) => (q && typeof q === 'object' ? q._id : q)),
    'questionId'
  );
}

export function sanitizeSavedMaterialTogglePayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return null;
  const out = { ...payload };
  if (out.materialType === 'pdf') {
    const pdfId = resolveMongoId(out.pdfId, 'pdfId');
    if (!pdfId) {
      devWarn('pdfId', '[mongoId] skipped saved-material toggle — invalid pdfId', {
        pdfId: out.pdfId,
      });
      return null;
    }
    out.pdfId = pdfId;
    delete out.noteId;
  } else if (out.materialType === 'note') {
    const noteId = resolveMongoId(out.noteId, 'noteId');
    if (!noteId) {
      devWarn('noteId', '[mongoId] skipped saved-material toggle — invalid noteId', {
        noteId: out.noteId,
      });
      return null;
    }
    out.noteId = noteId;
    delete out.pdfId;
  }
  return out;
}
