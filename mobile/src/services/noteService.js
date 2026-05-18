import api from './api.js';
import { resolveMongoId, sanitizeNotesQueryParams } from '../utils/mongoId.js';

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
  const clean = sanitizeNotesQueryParams(params);
  const { data } = await api.get('/notes', { params: clean, signal });
  const payload = data?.data ?? {};
  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  return { notes };
}

/**
 * Fetch the global subject catalog.
 *
 * Notes are organized by Subject → Topic. Posts are optional exam tags
 * (filters) and must NOT control subject visibility.
 */
export async function getSubjects(opts = {}) {
  const { signal } = opts;
  const { data } = await api.get('/subjects', { signal });
  const payload = data?.data ?? {};
  const subjects = Array.isArray(payload.subjects) ? payload.subjects : [];
  return { subjects };
}

export async function getTopicsForSubject(subjectId, opts = {}) {
  const id = resolveMongoId(subjectId, 'subjectId');
  if (!id) return { topics: [] };
  const { signal } = opts;
  const { data } = await api.get('/topics', { params: { subjectId: id }, signal });
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
