import api from './api.js';

/**
 * List notes scoped by any combination of post / subject / topic.
 *
 * `topicIds` (array) lets callers pull notes for multiple topics in a
 * single round trip — used by the "Weak Topic Resources" recommender on
 * ResultScreen. When both `topicId` and `topicIds` are given the array
 * form wins (the backend mirrors this rule).
 *
 * Always returns a `{ notes: [...] }` shape so callers can destructure
 * safely even when the backend returns an unexpected payload.
 */
export async function getNotes(params = {}, opts = {}) {
  const { signal } = opts;
  const clean = {};
  if (params.postId) clean.postId = params.postId;
  if (params.subjectId) clean.subjectId = params.subjectId;

  if (Array.isArray(params.topicIds)) {
    const ids = params.topicIds
      .map((t) => (t == null ? '' : String(t).trim()))
      .filter(Boolean);
    if (ids.length > 0) {
      // CSV form keeps the URL compact when the user has many weak
      // topics. The backend validator accepts CSV or repeated params.
      clean.topicIds = Array.from(new Set(ids)).join(',');
    }
  } else if (params.topicId) {
    clean.topicId = params.topicId;
  }

  const { data } = await api.get('/notes', { params: clean, signal });
  const payload = data?.data ?? {};
  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  return { notes };
}

/**
 * Small helpers used by NotesListScreen for its cascading picker.
 * These don't cache — the user can change filters often, so a stale
 * cache would be more annoying than a tiny network refetch.
 */
export async function getSubjectsForPost(postId, opts = {}) {
  const { signal } = opts;
  if (!postId) return { subjects: [] };
  const { data } = await api.get('/subjects', { params: { postId }, signal });
  const payload = data?.data ?? {};
  const subjects = Array.isArray(payload.subjects) ? payload.subjects : [];
  return { subjects };
}

export async function getTopicsForSubject(subjectId, opts = {}) {
  const { signal } = opts;
  if (!subjectId) return { topics: [] };
  const { data } = await api.get('/topics', { params: { subjectId }, signal });
  const payload = data?.data ?? {};
  const topics = Array.isArray(payload.topics) ? payload.topics : [];
  return { topics };
}

/**
 * Trim a note's content to a compact preview for list rows. Collapses
 * runs of whitespace so Markdown-ish content doesn't render as a
 * ragged blob.
 */
export function previewOf(content, maxChars = 100) {
  if (typeof content !== 'string' || !content) return '';
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trimEnd()}…`;
}
