import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getApiErrorMessage,
  getNotes,
  getPosts,
  getSubjects,
  getTopics,
  updateNote,
} from '../services/api';

function asArray(res, key) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res[key])) return res[key];
  return [];
}

/**
 * Admin confirmation for disables (enables skip the prompt — they're
 * strictly re-enabling content and never hurt).
 */
function confirmDisable(title) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true;
  }
  return window.confirm(
    `Disable "${title}"? Students will no longer see this note.`
  );
}

/**
 * Manage Notes page.
 *
 * - Loads posts/subjects/topics once on mount with `includeInactive=true`
 *   so the filter dropdowns include everything AND we have name lookups
 *   for the list cards (the /notes endpoint only returns ids).
 * - Filter changes hit the backend (`GET /notes?postId=…`) — we don't
 *   client-side filter because the number of notes is unbounded.
 * - Toggle uses optimistic UI: the row updates instantly and rolls back
 *   on error.
 */
export default function ManageNotes() {
  // ---- Filter state ----
  const [filterPostId, setFilterPostId] = useState('');
  const [filterSubjectId, setFilterSubjectId] = useState('');
  const [filterTopicId, setFilterTopicId] = useState('');

  // ---- Reference data (posts/subjects/topics) ----
  const [posts, setPosts] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [refLoading, setRefLoading] = useState(true);
  const [refError, setRefError] = useState('');

  // ---- Notes list ----
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState('');

  // ---- Per-row toggling state ----
  const [togglingId, setTogglingId] = useState(null);
  const [toggleMsg, setToggleMsg] = useState('');
  const [toggleErr, setToggleErr] = useState('');

  // ---- Load reference data once ---------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setRefLoading(true);
        setRefError('');
        const [postsRes, subjectsRes, topicsRes] = await Promise.all([
          getPosts(),
          getSubjects({ includeInactive: true }),
          getTopics({ includeInactive: true }),
        ]);
        if (cancelled) return;
        setPosts(asArray(postsRes, 'posts'));
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

  // ---- Load notes whenever a filter changes --------------------------
  const loadNotes = useCallback(async () => {
    setNotesError('');
    setNotesLoading(true);
    try {
      const params = { includeInactive: true };
      if (filterPostId) params.postId = filterPostId;
      if (filterSubjectId) params.subjectId = filterSubjectId;
      if (filterTopicId) params.topicId = filterTopicId;
      const res = await getNotes(params);
      setNotes(asArray(res, 'notes'));
    } catch (e) {
      setNotesError(getApiErrorMessage(e));
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, [filterPostId, filterSubjectId, filterTopicId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // ---- Lookup maps ----------------------------------------------------
  const postsById = useMemo(() => {
    const m = new Map();
    for (const p of posts) m.set(String(p._id), p);
    return m;
  }, [posts]);

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

  // ---- Filter option sets scoped by parent ---------------------------
  const subjectOptions = useMemo(() => {
    return subjects;
  }, [subjects]);

  const topicOptions = useMemo(() => {
    if (!filterSubjectId) return topics;
    return topics.filter((t) => String(t.subjectId) === String(filterSubjectId));
  }, [topics, filterSubjectId]);

  // ---- Handlers -------------------------------------------------------
  function handlePostChange(e) {
    const next = e.target.value;
    setFilterPostId(next);
    // Clear children when the parent changes — selected child may no
    // longer belong to the new parent.
    setFilterSubjectId('');
    setFilterTopicId('');
  }

  function handleSubjectChange(e) {
    setFilterSubjectId(e.target.value);
    setFilterTopicId('');
  }

  function handleClearFilters() {
    setFilterPostId('');
    setFilterSubjectId('');
    setFilterTopicId('');
  }

  async function handleToggle(note) {
    if (togglingId) return;
    const nextActive = !note.isActive;
    if (!nextActive && !confirmDisable(note.title || 'this note')) return;

    setToggleErr('');
    setToggleMsg('');
    setTogglingId(note._id);

    // Optimistic update.
    setNotes((prev) =>
      prev.map((n) =>
        String(n._id) === String(note._id) ? { ...n, isActive: nextActive } : n
      )
    );

    try {
      const res = await updateNote(note._id, { isActive: nextActive });
      const updated = res?.note || res;
      // Replace with server truth so any server-side coercion (trims
      // etc.) is reflected in the UI.
      if (updated && updated._id) {
        setNotes((prev) =>
          prev.map((n) =>
            String(n._id) === String(updated._id) ? { ...n, ...updated } : n
          )
        );
      }
      setToggleMsg(
        nextActive ? 'Note enabled.' : 'Note disabled.'
      );
    } catch (e) {
      // Roll back optimistic change.
      setNotes((prev) =>
        prev.map((n) =>
          String(n._id) === String(note._id)
            ? { ...n, isActive: !nextActive }
            : n
        )
      );
      setToggleErr(getApiErrorMessage(e));
    } finally {
      setTogglingId(null);
    }
  }

  // ---- Derived helpers for rendering ---------------------------------
  function nameFor(map, id, fallback = '—') {
    if (!id) return fallback;
    return map.get(String(id))?.name || fallback;
  }

  function postNamesFor(note) {
    const ids = Array.isArray(note?.postIds) && note.postIds.length > 0
      ? note.postIds
      : note?.postId
        ? [note.postId]
        : [];
    const labels = ids
      .map((id) => nameFor(postsById, id, ''))
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    return labels.length > 0 ? labels.join(', ') : '';
  }

  const hasActiveFilters =
    Boolean(filterPostId) ||
    Boolean(filterSubjectId) ||
    Boolean(filterTopicId);

  return (
    <div>
      <h1 className="page-title">Manage Notes</h1>
      <p className="page-subtitle">
        Browse existing notes, filter by post/subject/topic, and
        enable/disable individual notes.
      </p>

      {refError ? (
        <div className="alert alert-error">{refError}</div>
      ) : null}

      {/* ---------- Filters ---------- */}
      <div className="card form" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="form-row">
            <label className="label" htmlFor="filterPost">
              Post
            </label>
            <select
              id="filterPost"
              className="input"
              value={filterPostId}
              onChange={handlePostChange}
              disabled={refLoading || posts.length === 0}
            >
              <option value="">All posts</option>
              {posts.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name || p.slug || p._id}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label className="label" htmlFor="filterSubject">
              Subject
            </label>
            <select
              id="filterSubject"
              className="input"
              value={filterSubjectId}
              onChange={handleSubjectChange}
              disabled={refLoading}
            >
              <option value="">
                {subjectOptions.length === 0
                  ? 'No subjects for this post'
                  : 'All subjects'}
              </option>
              {subjectOptions.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label className="label" htmlFor="filterTopic">
              Topic
            </label>
            <select
              id="filterTopic"
              className="input"
              value={filterTopicId}
              onChange={(e) => setFilterTopicId(e.target.value)}
              disabled={refLoading || !filterSubjectId}
            >
              <option value="">
                {!filterSubjectId
                  ? 'Select a subject first'
                  : topicOptions.length === 0
                  ? 'No topics available'
                  : 'All topics'}
              </option>
              {topicOptions.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClearFilters}
            disabled={!hasActiveFilters}
          >
            Clear filters
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={loadNotes}
            disabled={notesLoading}
          >
            {notesLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ---------- Toggle feedback ---------- */}
      {toggleMsg ? (
        <div className="alert alert-success">{toggleMsg}</div>
      ) : null}
      {toggleErr ? (
        <div className="alert alert-error">{toggleErr}</div>
      ) : null}
      {notesError ? (
        <div className="alert alert-error">{notesError}</div>
      ) : null}

      {/* ---------- List ---------- */}
      <div className="card">
        {notesLoading ? (
          <p className="helper">Loading notes…</p>
        ) : notes.length === 0 ? (
          <p className="helper">
            {hasActiveFilters
              ? 'No notes match the current filters.'
              : 'No notes yet. Use Add Note to create one.'}
          </p>
        ) : (
          <ul className="row-list">
            {notes.map((note) => {
              const active = note.isActive !== false;
              const isToggling = String(togglingId) === String(note._id);
              return (
                <li
                  key={note._id}
                  className={`row-item${active ? '' : ' row-item-inactive'}`}
                >
                  <div
                    className="row-main row-main-static"
                    style={{
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 2,
                    }}
                  >
                    <div
                      className="row-name"
                      title={note.title}
                      style={{ whiteSpace: 'normal' }}
                    >
                      {note.title || 'Untitled note'}
                    </div>
                    <div className="helper">
                      {nameFor(topicsById, note.topicId, 'Unknown topic')}
                      {' · '}
                      {nameFor(subjectsById, note.subjectId, 'Unknown subject')}
                      {postNamesFor(note) ? ` · ${postNamesFor(note)}` : ''}
                    </div>
                  </div>

                  <span
                    className={`status-badge ${
                      active ? 'status-active' : 'status-inactive'
                    }`}
                  >
                    {active ? 'Active' : 'Inactive'}
                  </span>

                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => handleToggle(note)}
                    disabled={isToggling}
                  >
                    {isToggling
                      ? '…'
                      : active
                      ? 'Disable'
                      : 'Enable'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
