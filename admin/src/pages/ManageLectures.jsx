import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  archiveAdminLecture,
  getApiErrorMessage,
  getSubjects,
  getTopics,
  listAdminLectures,
  updateAdminLecture,
} from '../services/api';
import {
  LECTURE_ACCESS,
  LECTURE_DESCRIPTION_MAX,
  LECTURE_STATUS,
  LECTURE_TITLE_MAX,
  LECTURE_TITLE_MIN,
} from '../constants/videoLectureUi';

function asArray(res, key) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res[key])) return res[key];
  return [];
}

function lectureKey(row) {
  return String(row?.id || row?._id || '');
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatDuration(seconds) {
  if (seconds == null || seconds === '') return '—';
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return '—';
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${mm}m`;
  }
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function statusBadgeClass(status) {
  if (status === LECTURE_STATUS.PUBLISHED) return 'status-badge status-active';
  if (status === LECTURE_STATUS.FAILED) return 'status-badge status-inactive';
  if (status === LECTURE_STATUS.ARCHIVED) return 'status-badge status-archived';
  if (status === LECTURE_STATUS.PROCESSING || status === LECTURE_STATUS.UPLOADING) {
    return 'status-badge status-processing';
  }
  return 'status-badge';
}

function confirmArchive(title) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true;
  }
  return window.confirm(
    `Archive "${title}"? It will no longer be offered as an active lecture. The Cloudflare video is not deleted.`
  );
}

const PAGE_SIZE = 20;
const STATUS_FILTERS = [
  '',
  LECTURE_STATUS.UPLOADING,
  LECTURE_STATUS.PROCESSING,
  LECTURE_STATUS.PUBLISHED,
  LECTURE_STATUS.FAILED,
  LECTURE_STATUS.ARCHIVED,
  LECTURE_STATUS.DRAFT,
];

export default function ManageLectures() {
  const [filterSubjectId, setFilterSubjectId] = useState('');
  const [filterTopicId, setFilterTopicId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAccess, setFilterAccess] = useState('');
  const [page, setPage] = useState(1);

  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [refLoading, setRefLoading] = useState(true);
  const [refError, setRefError] = useState('');

  const [lectures, setLectures] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 0 });
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [archivingId, setArchivingId] = useState('');

  const [edit, setEdit] = useState(null);
  const [editTopics, setEditTopics] = useState([]);
  const [editLoadingTopics, setEditLoadingTopics] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editErr, setEditErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setRefLoading(true);
        setRefError('');
        const [subjectsRes, topicsRes] = await Promise.all([
          getSubjects({ includeInactive: true }),
          getTopics({ includeInactive: true }),
        ]);
        if (cancelled) return;
        setSubjects(asArray(subjectsRes, 'subjects'));
        setTopics(asArray(topicsRes, 'topics'));
      } catch (e) {
        if (!cancelled) setRefError(getApiErrorMessage(e));
      } finally {
        if (!cancelled) setRefLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadLectures = useCallback(async () => {
    setListError('');
    setListLoading(true);
    try {
      const params = { page, pageSize: PAGE_SIZE };
      if (filterSubjectId) params.subjectId = filterSubjectId;
      if (filterTopicId) params.topicId = filterTopicId;
      if (filterStatus) params.status = filterStatus;
      if (filterAccess) params.access = filterAccess;
      const res = await listAdminLectures(params);
      setLectures(asArray(res, 'lectures'));
      setPagination(res?.pagination ?? { total: 0, page, pageSize: PAGE_SIZE, totalPages: 0 });
    } catch (e) {
      setListError(getApiErrorMessage(e));
      setLectures([]);
    } finally {
      setListLoading(false);
    }
  }, [page, filterSubjectId, filterTopicId, filterStatus, filterAccess]);

  useEffect(() => {
    loadLectures();
  }, [loadLectures]);

  const subjectsById = useMemo(() => {
    const m = new Map();
    for (const s of subjects) m.set(String(s._id), s);
    return m;
  }, [subjects]);

  const topicsById = useMemo(() => {
    const m = new Map();
    for (const t of topics) m.set(String(t._id), t);
    return m;
  }, [topics]);

  const topicFilterOptions = useMemo(() => {
    if (!filterSubjectId) return [];
    return topics.filter((t) => String(t.subjectId) === String(filterSubjectId));
  }, [topics, filterSubjectId]);

  function nameFor(map, id) {
    if (!id) return '—';
    return map.get(String(id))?.name || '—';
  }

  function handleSubjectFilter(value) {
    setFilterSubjectId(value);
    setFilterTopicId('');
    setPage(1);
  }

  function handleClearFilters() {
    setFilterSubjectId('');
    setFilterTopicId('');
    setFilterStatus('');
    setFilterAccess('');
    setPage(1);
  }

  async function handleArchive(row) {
    const id = lectureKey(row);
    if (!id || archivingId) return;
    if (row.status === LECTURE_STATUS.ARCHIVED) return;
    if (!confirmArchive(row.title || 'this lecture')) return;
    setActionErr('');
    setActionMsg('');
    setArchivingId(id);
    try {
      const updated = await archiveAdminLecture(id);
      setLectures((prev) =>
        prev.map((l) => (lectureKey(l) === id ? { ...l, ...updated } : l))
      );
      setActionMsg('Lecture archived. Cloudflare video was not deleted.');
    } catch (e) {
      setActionErr(getApiErrorMessage(e));
    } finally {
      setArchivingId('');
    }
  }

  function openEdit(row) {
    setEditErr('');
    setEdit({
      id: lectureKey(row),
      title: row.title || '',
      description: row.description || '',
      subjectId: row.subjectId ? String(row.subjectId) : '',
      topicId: row.topicId ? String(row.topicId) : '',
      access: row.access || LECTURE_ACCESS.FREE,
      order: Number.isFinite(Number(row.order)) ? String(row.order) : '0',
    });
  }

  function closeEdit() {
    if (editSubmitting) return;
    setEdit(null);
    setEditTopics([]);
    setEditErr('');
  }

  useEffect(() => {
    let cancelled = false;
    if (!edit?.subjectId) {
      setEditTopics([]);
      return undefined;
    }
    (async () => {
      try {
        setEditLoadingTopics(true);
        const res = await getTopics({ subjectId: edit.subjectId });
        if (cancelled) return;
        const list = asArray(res, 'topics');
        setEditTopics(list);
        setEdit((prev) => {
          if (!prev) return prev;
          const stillValid = list.some((t) => String(t._id) === String(prev.topicId));
          return stillValid ? prev : { ...prev, topicId: '' };
        });
      } catch (e) {
        if (!cancelled) {
          setEditErr(getApiErrorMessage(e));
          setEditTopics([]);
        }
      } finally {
        if (!cancelled) setEditLoadingTopics(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [edit?.subjectId]);

  async function saveEdit() {
    if (!edit?.id) return;
    const title = edit.title.trim();
    if (title.length < LECTURE_TITLE_MIN || title.length > LECTURE_TITLE_MAX) {
      setEditErr(`Title must be ${LECTURE_TITLE_MIN}–${LECTURE_TITLE_MAX} characters.`);
      return;
    }
    if (!edit.subjectId) {
      setEditErr('Please select a subject.');
      return;
    }
    if (!edit.topicId) {
      setEditErr('Please select a topic that belongs to this subject.');
      return;
    }
    const orderNum = Number(edit.order);
    if (!Number.isInteger(orderNum) || orderNum < 0) {
      setEditErr('Order must be a non-negative integer.');
      return;
    }
    setEditSubmitting(true);
    setEditErr('');
    try {
      const updated = await updateAdminLecture(edit.id, {
        title,
        description: edit.description.trim(),
        subjectId: edit.subjectId,
        topicId: edit.topicId,
        access: edit.access,
        order: orderNum,
      });
      setLectures((prev) =>
        prev.map((l) => (lectureKey(l) === edit.id ? { ...l, ...updated } : l))
      );
      setActionMsg('Lecture updated.');
      setEditSubmitting(false);
      setEdit(null);
    } catch (e) {
      setEditErr(getApiErrorMessage(e));
      setEditSubmitting(false);
    }
  }

  const hasFilters = Boolean(
    filterSubjectId || filterTopicId || filterStatus || filterAccess
  );
  const totalPages = pagination?.totalPages ?? 0;
  const total = pagination?.total ?? 0;

  return (
    <div>
      <h1 className="page-title">Manage Lectures</h1>
      <p className="page-subtitle">
        Library of reusable video lectures (Subject → Topic). Status is updated by
        Cloudflare processing. Archive hides a lecture without deleting the Stream
        file.{' '}
        <Link to="/add-lecture">Add Lecture</Link>
      </p>

      {refError ? <div className="alert alert-error">{refError}</div> : null}

      <div className="card form" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="form-row">
            <label className="label" htmlFor="ml-subject">
              Subject
            </label>
            <select
              id="ml-subject"
              className="input"
              value={filterSubjectId}
              onChange={(e) => handleSubjectFilter(e.target.value)}
              disabled={refLoading}
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label className="label" htmlFor="ml-topic">
              Topic
            </label>
            <select
              id="ml-topic"
              className="input"
              value={filterTopicId}
              onChange={(e) => {
                setFilterTopicId(e.target.value);
                setPage(1);
              }}
              disabled={refLoading || !filterSubjectId}
            >
              <option value="">
                {!filterSubjectId ? 'Select a subject first' : 'All topics'}
              </option>
              {topicFilterOptions.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label className="label" htmlFor="ml-status">
              Status
            </label>
            <select
              id="ml-status"
              className="input"
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s || 'all'} value={s}>
                  {s ? s : 'All statuses'}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label className="label" htmlFor="ml-access">
              Access
            </label>
            <select
              id="ml-access"
              className="input"
              value={filterAccess}
              onChange={(e) => {
                setFilterAccess(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              <option value={LECTURE_ACCESS.FREE}>Free</option>
              <option value={LECTURE_ACCESS.PREMIUM}>Premium</option>
            </select>
          </div>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClearFilters}
            disabled={!hasFilters}
          >
            Clear filters
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={loadLectures}
            disabled={listLoading}
          >
            {listLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {actionMsg ? <div className="alert alert-success">{actionMsg}</div> : null}
      {actionErr ? <div className="alert alert-error">{actionErr}</div> : null}
      {listError ? <div className="alert alert-error">{listError}</div> : null}

      <div className="card">
        {listLoading ? (
          <p className="helper">Loading lectures…</p>
        ) : lectures.length === 0 ? (
          <p className="helper">
            {hasFilters
              ? 'No lectures match the current filters.'
              : 'No lectures yet. Use Add Lecture to upload one.'}
          </p>
        ) : (
          <ul className="row-list">
            {lectures.map((row) => {
              const id = lectureKey(row);
              const archived = row.status === LECTURE_STATUS.ARCHIVED;
              return (
                <li
                  key={id}
                  className={`row-item${archived ? ' row-item-inactive' : ''}`}
                >
                  {row.thumbnailUrl ? (
                    <img
                      className="lecture-thumb"
                      src={row.thumbnailUrl}
                      alt=""
                    />
                  ) : (
                    <div className="lecture-thumb lecture-thumb-empty" />
                  )}
                  <div
                    className="row-main row-main-static"
                    style={{
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 2,
                    }}
                  >
                    <div className="row-name" style={{ whiteSpace: 'normal' }}>
                      {row.title || 'Untitled lecture'}
                    </div>
                    <div className="helper">
                      {nameFor(subjectsById, row.subjectId)}
                      {' · '}
                      {nameFor(topicsById, row.topicId)}
                      {' · '}
                      <span
                        className={
                          row.access === LECTURE_ACCESS.PREMIUM
                            ? 'badge badge-premium'
                            : 'badge badge-free'
                        }
                      >
                        {row.access === LECTURE_ACCESS.PREMIUM ? 'Premium' : 'Free'}
                      </span>
                    </div>
                    <div className="helper">
                      {formatDuration(row.durationSeconds)} · {formatDate(row.createdAt)}
                    </div>
                  </div>
                  <span className={statusBadgeClass(row.status)}>{row.status || '—'}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => openEdit(row)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => handleArchive(row)}
                      disabled={archived || archivingId === id}
                    >
                      {archivingId === id ? '…' : archived ? 'Archived' : 'Archive'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="form-row" style={{ marginTop: '1rem', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={page <= 1 || listLoading}
            onClick={() => setPage((x) => Math.max(1, x - 1))}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={listLoading || page >= totalPages}
            onClick={() => setPage((x) => x + 1)}
          >
            Next
          </button>
        </div>
      ) : null}

      {edit ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-lecture-title"
          onClick={closeEdit}
        >
          <div className="modal-card form" onClick={(e) => e.stopPropagation()}>
            <h3 id="edit-lecture-title">Edit lecture</h3>
            {editErr ? <div className="alert alert-error">{editErr}</div> : null}
            <div className="form-row">
              <label className="label" htmlFor="el-title">
                Title *
              </label>
              <input
                id="el-title"
                className="input"
                value={edit.title}
                maxLength={LECTURE_TITLE_MAX}
                onChange={(e) => setEdit((p) => ({ ...p, title: e.target.value }))}
                disabled={editSubmitting}
              />
            </div>
            <div className="form-row">
              <label className="label" htmlFor="el-desc">
                Description
              </label>
              <textarea
                id="el-desc"
                className="input"
                rows={3}
                maxLength={LECTURE_DESCRIPTION_MAX}
                value={edit.description}
                onChange={(e) => setEdit((p) => ({ ...p, description: e.target.value }))}
                disabled={editSubmitting}
              />
            </div>
            <div className="form-row">
              <label className="label" htmlFor="el-subject">
                Subject *
              </label>
              <select
                id="el-subject"
                className="input"
                value={edit.subjectId}
                onChange={(e) =>
                  setEdit((p) => ({ ...p, subjectId: e.target.value, topicId: '' }))
                }
                disabled={editSubmitting}
              >
                <option value="">— Select subject —</option>
                {subjects.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label className="label" htmlFor="el-topic">
                Topic *
              </label>
              <select
                id="el-topic"
                className="input"
                value={edit.topicId}
                onChange={(e) => setEdit((p) => ({ ...p, topicId: e.target.value }))}
                disabled={editSubmitting || !edit.subjectId || editLoadingTopics}
              >
                <option value="">
                  {!edit.subjectId
                    ? '— Select a subject first —'
                    : editLoadingTopics
                      ? 'Loading topics…'
                      : '— Select topic —'}
                </option>
                {editTopics.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label className="label" htmlFor="el-access">
                Access
              </label>
              <select
                id="el-access"
                className="input"
                value={edit.access}
                onChange={(e) => setEdit((p) => ({ ...p, access: e.target.value }))}
                disabled={editSubmitting}
              >
                <option value={LECTURE_ACCESS.FREE}>Free</option>
                <option value={LECTURE_ACCESS.PREMIUM}>Premium</option>
              </select>
            </div>
            <div className="form-row">
              <label className="label" htmlFor="el-order">
                Order
              </label>
              <input
                id="el-order"
                className="input"
                type="number"
                min={0}
                step={1}
                value={edit.order}
                onChange={(e) => setEdit((p) => ({ ...p, order: e.target.value }))}
                disabled={editSubmitting}
              />
            </div>
            <p className="helper">
              Video file, Cloudflare ID, thumbnail, duration, and status cannot be
              changed here.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeEdit}
                disabled={editSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveEdit}
                disabled={editSubmitting}
              >
                {editSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
