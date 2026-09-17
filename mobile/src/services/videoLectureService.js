import api from './api.js';
import { resolveMongoId } from '../utils/mongoId.js';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? null;
}

/**
 * Published lecture catalog. Never contains playback URLs.
 */
export async function listVideoLectures(params = {}, opts = {}) {
  const { signal } = opts;
  const query = {};
  if (params.subjectId) {
    const subjectId = resolveMongoId(params.subjectId, 'subjectId');
    if (subjectId) query.subjectId = subjectId;
  }
  if (params.topicId) {
    const topicId = resolveMongoId(params.topicId, 'topicId');
    if (topicId) query.topicId = topicId;
  }
  if (params.page) query.page = params.page;
  if (params.pageSize) query.pageSize = params.pageSize;
  const res = await api.get('/video-lectures', { params: query, signal });
  const data = unwrap(res) ?? {};
  return {
    lectures: Array.isArray(data.lectures) ? data.lectures : [],
    pagination: data.pagination || {},
  };
}

export async function getVideoLecture(id, opts = {}) {
  const lectureId = resolveMongoId(id, 'lectureId');
  if (!lectureId) throw new Error('getVideoLecture requires an id.');
  const res = await api.get(`/video-lectures/${lectureId}`, { signal: opts.signal });
  const data = unwrap(res);
  return data?.lecture ?? data;
}

/**
 * Short-lived signed HLS authorization. Do not persist the returned URL.
 */
export async function requestLecturePlayback(id, opts = {}) {
  const lectureId = resolveMongoId(id, 'lectureId');
  if (!lectureId) throw new Error('requestLecturePlayback requires an id.');
  const res = await api.post(`/video-lectures/${lectureId}/playback`, {}, { signal: opts.signal });
  return unwrap(res);
}
