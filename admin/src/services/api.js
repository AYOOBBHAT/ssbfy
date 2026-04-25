import axios from 'axios';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://ssbfy.onrender.com/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
});

let authToken = null;

export function setAuthToken(token) {
  authToken = token || null;
}

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const payload = error?.response?.data;
    console.log('[API ERROR]:', status || '', payload || error.message);
    if (status === 401) {
      console.log('[AUTH] Token expired or invalid');
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    'Something went wrong'
  );
}

/* ---------------- Resource helpers ---------------- */

// Backend wraps payloads as { success, message, data }.
// Each helper unwraps `data` so callers get clean values.
function unwrap(res) {
  return res?.data?.data ?? res?.data ?? null;
}

/* ---------------- Auth ---------------- */

/** Login with email + password. Returns { user, token }. */
export async function login({ email, password }) {
  const res = await api.post('/auth/login', { email, password });
  return unwrap(res);
}

/** Fetch the current user using the active token. */
export async function fetchMe() {
  const res = await api.get('/users/me');
  const data = unwrap(res);
  return data?.user ?? data;
}

/**
 * Create a new question (admin only).
 * @param {object} payload  questionText, options, correctAnswerIndex,
 *                          correctAnswerValue, explanation, subjectId,
 *                          topicId, postIds, year, difficulty
 */
export async function createQuestion(payload) {
  const res = await api.post('/questions', payload);
  return unwrap(res);
}

/** List all posts (exams). */
export async function getPosts() {
  const res = await api.get('/posts');
  return unwrap(res);
}

/**
 * Create a new post (admin only). `slug` is optional — the server derives it
 * from `name` when missing. Returns the created post under `{ post }`.
 */
export async function createPost({ name, slug, description } = {}) {
  const payload = { name };
  if (slug) payload.slug = slug;
  if (description) payload.description = description;
  const res = await api.post('/posts', payload);
  return unwrap(res);
}

/**
 * List subjects. Pass `{ postId }` to filter by post, or nothing to list all.
 * @param {{ postId?: string }} [params]
 */
export async function getSubjects(params = {}) {
  const res = await api.get('/subjects', { params });
  return unwrap(res);
}

/**
 * Create a new subject under a post (admin only).
 * `postId` is required — the server enforces Post → Subject hierarchy.
 */
export async function createSubject({ name, postId, order } = {}) {
  if (!postId) {
    throw new Error('postId is required to create a subject.');
  }
  const payload = { name, postId };
  if (typeof order === 'number') payload.order = order;
  const res = await api.post('/subjects', payload);
  return unwrap(res);
}

/**
 * List topics. Pass `{ subjectId }` to scope to a subject, or nothing to list all.
 * @param {{ subjectId?: string }} [params]
 */
export async function getTopics(params = {}) {
  const res = await api.get('/topics', { params });
  return unwrap(res);
}

/** Create a new topic under a subject (admin only). */
export async function createTopic({ name, subjectId, order } = {}) {
  const payload = { name, subjectId };
  if (typeof order === 'number') payload.order = order;
  const res = await api.post('/topics', payload);
  return unwrap(res);
}

/**
 * Patch a subject (admin only). Pass any of `name`, `order`, `isActive`.
 * Fields left `undefined` are not sent and remain unchanged on the server.
 */
export async function updateSubject(id, { name, order, isActive } = {}) {
  if (!id) throw new Error('updateSubject requires an id.');
  const payload = {};
  if (name !== undefined) payload.name = name;
  if (typeof order === 'number') payload.order = order;
  if (typeof isActive === 'boolean') payload.isActive = isActive;
  const res = await api.patch(`/subjects/${id}`, payload);
  return unwrap(res);
}

/** Patch a topic (admin only). Same shape as `updateSubject`. */
export async function updateTopic(id, { name, order, isActive } = {}) {
  if (!id) throw new Error('updateTopic requires an id.');
  const payload = {};
  if (name !== undefined) payload.name = name;
  if (typeof order === 'number') payload.order = order;
  if (typeof isActive === 'boolean') payload.isActive = isActive;
  const res = await api.patch(`/topics/${id}`, payload);
  return unwrap(res);
}

/**
 * List questions with optional filters/pagination.
 * @param {object} params  subjectId, topicId, difficulty, year, limit, skip, sort
 */
export async function getQuestions(params = {}) {
  const res = await api.get('/questions', { params });
  return unwrap(res);
}

/**
 * Create a new test (admin only).
 * @param {object} payload  title, type, questionIds, duration, negativeMarking
 */
export async function createTest(payload) {
  const res = await api.post('/tests', payload);
  return unwrap(res);
}

/* ---------------- Notes ---------------- */

/**
 * List notes. Any combination of { postId, subjectId, topicId } may be
 * passed to scope the results; omit them all for a full list.
 */
export async function getNotes(params = {}) {
  const res = await api.get('/notes', { params });
  return unwrap(res);
}

/**
 * Create a topic-wise study note (admin only). All four ids are required
 * by the server — the service validates that topic ⊂ subject ⊂ post.
 */
export async function createNote({
  title,
  content,
  postId,
  subjectId,
  topicId,
} = {}) {
  const res = await api.post('/notes', {
    title,
    content,
    postId,
    subjectId,
    topicId,
  });
  return unwrap(res);
}

/**
 * Patch a note (admin only). Any subset of `title`, `content`, `isActive`
 * may be supplied; the server rejects an empty patch. The hierarchy
 * (post/subject/topic) is immutable on purpose — moving a note across
 * the hierarchy is a re-create, not an edit.
 */
export async function updateNote(id, { title, content, isActive } = {}) {
  if (!id) throw new Error('updateNote requires an id.');
  const payload = {};
  if (typeof title === 'string') payload.title = title;
  if (typeof content === 'string') payload.content = content;
  if (typeof isActive === 'boolean') payload.isActive = isActive;
  const res = await api.patch(`/notes/${id}`, payload);
  return unwrap(res);
}

/* ---------------- PDF Notes ---------------- */

/**
 * List uploaded PDF notes. Pass `{ postId }` to scope to a post and
 * `{ includeInactive: true }` to include disabled uploads (admin-only
 * on the server; the server silently drops the flag for non-admins).
 * PDFs with `postIds` containing that post are included.
 */
export async function getPdfNotes(params = {}) {
  const query = {};
  if (params.postId) query.postId = params.postId;
  if (params.includeInactive) query.includeInactive = 'true';
  const res = await api.get('/notes/pdfs', { params: query });
  return unwrap(res);
}

/**
 * Upload a PDF note (admin only). `file` must be a `File`/`Blob` from
 * an <input type="file">. Send `postIds` (string ids) for applicable
 * posts, or legacy single `postId`. The request uses multipart/form-data.
 */
export async function uploadPdfNote({ title, postId, postIds, file } = {}) {
  if (!title) throw new Error('title is required to upload a PDF.');
  if (!file) throw new Error('file is required to upload a PDF.');

  const ids =
    Array.isArray(postIds) && postIds.length > 0
      ? postIds
      : postId
        ? [postId]
        : [];
  if (!ids.length) throw new Error('Select at least one post for this PDF.');

  const formData = new FormData();
  formData.append('title', title);
  formData.append('postIds', JSON.stringify(ids));
  formData.append('file', file);

  // Do not set Content-Type. The runtime must set
  // `multipart/form-data; boundary=----…` or the body will not parse and
  // multer will see no file/fields (500 / broken uploads on Render).
  const res = await api.post('/notes/upload-pdf', formData, {
    timeout: 120000,
  });
  return unwrap(res);
}

/**
 * Patch a PDF note (admin only). Toggle `isActive` and/or replace
 * the full `postIds` list. File content is not modified here.
 */
export async function updatePdfNote(id, { isActive, postIds } = {}) {
  if (!id) throw new Error('updatePdfNote requires an id.');
  const payload = {};
  if (typeof isActive === 'boolean') payload.isActive = isActive;
  if (Array.isArray(postIds) && postIds.length > 0) payload.postIds = postIds;
  if (Object.keys(payload).length === 0) {
    throw new Error('updatePdfNote requires isActive and/or postIds.');
  }
  const res = await api.patch(`/notes/pdfs/${id}`, payload);
  return unwrap(res);
}

export default api;
