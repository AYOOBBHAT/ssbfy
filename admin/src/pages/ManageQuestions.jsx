import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  bulkSetQuestionStatus,
  getApiErrorMessage,
  getPosts,
  getQuestionUsage,
  getSubjects,
  getTopics,
  listQuestionsAdmin,
  updateQuestion,
} from '../services/api';

const QUESTION_TYPE_LABELS = {
  single_correct: 'Single',
  multiple_correct: 'Multiple',
  image_based: 'Image',
};

const DIFFICULTY_LABELS = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

const PAGE_SIZE = 20;
const BULK_TYPED_CONFIRM_THRESHOLD = 10;

function asArray(res, key) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res[key])) return res[key];
  return [];
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

function previewText(s, max = 72) {
  if (typeof s !== 'string' || !s.trim()) return '—';
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * Manage Questions: search, filter, bulk enable/disable, lazy usage info,
 * styled confirmations. Single-question edit reuses the existing
 * AddQuestion form via `?edit=<id>` so we don't fork the create flow.
 *
 * Why bulk-action and single disable both go through the same pattern:
 *   - downstream (tests, attempts, daily/weak/smart practice) already filter
 *     by `isActive: true`, so a soft-disable is the correct primitive.
 *   - hard delete was removed at the route layer; toggling `isActive` is the
 *     ONLY destructive operation now, which means undo is always possible.
 */
export default function ManageQuestions() {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [filterPostId, setFilterPostId] = useState('');
  const [filterSubjectId, setFilterSubjectId] = useState('');
  const [filterTopicId, setFilterTopicId] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterQuestionType, setFilterQuestionType] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [page, setPage] = useState(1);

  const [posts, setPosts] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [refLoading, setRefLoading] = useState(true);
  const [refError, setRefError] = useState('');

  const [questions, setQuestions] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [togglingId, setTogglingId] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusErr, setStatusErr] = useState('');

  const [expanded, setExpanded] = useState(() => new Set());
  const [usageById, setUsageById] = useState(() => new Map());
  const usageInflight = useRef(new Set());

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [confirmDialog, setConfirmDialog] = useState(null); // { type, payload, title, body, requireTyping, danger }
  const [typedConfirm, setTypedConfirm] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [
    debouncedSearch,
    filterPostId,
    filterSubjectId,
    filterTopicId,
    filterDifficulty,
    filterQuestionType,
    statusFilter,
  ]);

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

  const loadList = useCallback(async () => {
    setListError('');
    setListLoading(true);
    try {
      const params = {
        page,
        pageSize: PAGE_SIZE,
        includeInactive: 'true',
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (filterPostId) params.postId = filterPostId;
      if (filterSubjectId) params.subjectId = filterSubjectId;
      if (filterTopicId) params.topicId = filterTopicId;
      if (filterDifficulty) params.difficulty = filterDifficulty;
      if (filterQuestionType) params.questionType = filterQuestionType;
      if (statusFilter === 'active') params.isActive = 'true';
      else if (statusFilter === 'inactive') params.isActive = 'false';

      const res = await listQuestionsAdmin(params);
      const qs = asArray(res, 'questions');
      setQuestions(qs);
      setPagination(res?.pagination ?? null);
    } catch (e) {
      setListError(getApiErrorMessage(e));
      setQuestions([]);
      setPagination(null);
    } finally {
      setListLoading(false);
    }
  }, [
    page,
    debouncedSearch,
    filterPostId,
    filterSubjectId,
    filterTopicId,
    filterDifficulty,
    filterQuestionType,
    statusFilter,
  ]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const subjectOptions = useMemo(() => {
    if (!filterPostId) return subjects;
    return subjects.filter(
      (s) => !s.postId || String(s.postId) === String(filterPostId)
    );
  }, [subjects, filterPostId]);

  const topicOptions = useMemo(() => {
    if (!filterSubjectId) {
      if (!filterPostId) return topics;
      const subs = new Set(
        subjects
          .filter((s) => !s.postId || String(s.postId) === String(filterPostId))
          .map((s) => String(s._id))
      );
      return topics.filter((t) => subs.has(String(t.subjectId)));
    }
    return topics.filter((t) => String(t.subjectId) === String(filterSubjectId));
  }, [topics, subjects, filterSubjectId, filterPostId]);

  function handlePostChange(e) {
    const next = e.target.value;
    setFilterPostId(next);
    setFilterSubjectId('');
    setFilterTopicId('');
  }

  function handleSubjectChange(e) {
    setFilterSubjectId(e.target.value);
    setFilterTopicId('');
  }

  const hasTextFilters =
    Boolean(debouncedSearch.trim()) ||
    Boolean(filterPostId) ||
    Boolean(filterSubjectId) ||
    Boolean(filterTopicId) ||
    Boolean(filterDifficulty) ||
    Boolean(filterQuestionType) ||
    statusFilter !== 'all';

  function clearFilters() {
    setSearch('');
    setDebouncedSearch('');
    setFilterPostId('');
    setFilterSubjectId('');
    setFilterTopicId('');
    setFilterDifficulty('');
    setFilterQuestionType('');
    setStatusFilter('all');
  }

  function clearAlerts() {
    setStatusMsg('');
    setStatusErr('');
  }

  // ---------------- Selection ----------------

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const pageIds = questions.map((q) => String(q._id));
      const allOnPageSelected = pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const allOnPageSelected = useMemo(() => {
    if (questions.length === 0) return false;
    return questions.every((q) => selectedIds.has(String(q._id)));
  }, [questions, selectedIds]);

  // ---------------- Single toggle ----------------

  function askToggle(q) {
    const nextActive = !q.isActive;
    setConfirmDialog({
      type: 'single-toggle',
      payload: { id: q._id, isActive: nextActive, label: q.questionText },
      title: nextActive ? 'Enable question?' : 'Disable question?',
      body: nextActive
        ? 'Students, Smart Practice, and new test picks will start using it again.'
        : 'Students, Smart Practice, and new test picks will stop using it. Old results and history are preserved.',
      requireTyping: false,
      danger: !nextActive,
    });
  }

  async function applySingleToggle(payload) {
    if (togglingId) return;
    clearAlerts();
    setTogglingId(payload.id);

    setQuestions((prev) =>
      prev.map((row) =>
        String(row._id) === String(payload.id)
          ? { ...row, isActive: payload.isActive }
          : row
      )
    );

    try {
      const res = await updateQuestion(payload.id, { isActive: payload.isActive });
      const updated = res?.question || res;
      if (updated && updated._id) {
        setQuestions((prev) =>
          prev.map((row) =>
            String(row._id) === String(updated._id) ? { ...row, ...updated } : row
          )
        );
      }
      setStatusMsg(payload.isActive ? 'Question enabled.' : 'Question disabled.');
    } catch (e) {
      setQuestions((prev) =>
        prev.map((row) =>
          String(row._id) === String(payload.id)
            ? { ...row, isActive: !payload.isActive }
            : row
        )
      );
      setStatusErr(getApiErrorMessage(e));
    } finally {
      setTogglingId(null);
    }
  }

  // ---------------- Bulk actions ----------------

  function askBulkSetStatus(nextActive) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const requireTyping = ids.length >= BULK_TYPED_CONFIRM_THRESHOLD && !nextActive;
    setTypedConfirm('');
    setConfirmDialog({
      type: 'bulk-status',
      payload: { ids, isActive: nextActive },
      title: nextActive
        ? `Enable ${ids.length} question${ids.length === 1 ? '' : 's'}?`
        : `Disable ${ids.length} question${ids.length === 1 ? '' : 's'}?`,
      body: nextActive
        ? 'They will be visible again to students, Smart Practice, and new test picks.'
        : 'They will be hidden from students, Smart Practice, and new test picks. Old results and history stay intact.',
      requireTyping,
      danger: !nextActive,
    });
  }

  async function applyBulkSetStatus(payload) {
    if (bulkBusy) return;
    clearAlerts();
    setBulkBusy(true);
    try {
      const result = await bulkSetQuestionStatus(payload);
      // Optimistic local update — the server returns counts, not the docs.
      setQuestions((prev) =>
        prev.map((row) => {
          if (!payload.ids.includes(String(row._id))) return row;
          return { ...row, isActive: Boolean(payload.isActive) };
        })
      );
      const matched = result?.matched ?? 0;
      const modified = result?.modified ?? 0;
      const requested = result?.requested ?? payload.ids.length;
      const verb = payload.isActive ? 'Enabled' : 'Disabled';
      setStatusMsg(
        `${verb} ${modified} of ${requested} question(s).` +
          (matched < requested
            ? ` ${requested - matched} id(s) didn't match any question.`
            : '')
      );
      setSelectedIds(new Set());
    } catch (e) {
      setStatusErr(getApiErrorMessage(e));
    } finally {
      setBulkBusy(false);
    }
  }

  // ---------------- Confirm dialog dispatcher ----------------

  function closeConfirm() {
    setConfirmDialog(null);
    setTypedConfirm('');
  }

  async function handleConfirm() {
    if (!confirmDialog) return;
    if (
      confirmDialog.requireTyping &&
      typedConfirm.trim().toUpperCase() !== 'CONFIRM'
    ) {
      return;
    }
    const dialog = confirmDialog;
    closeConfirm();
    if (dialog.type === 'single-toggle') {
      await applySingleToggle(dialog.payload);
    } else if (dialog.type === 'bulk-status') {
      await applyBulkSetStatus(dialog.payload);
    }
  }

  // ---------------- Expand / lazy usage ----------------

  function toggleExpand(id) {
    setExpanded((prev) => {
      const n = new Set(prev);
      const k = String(id);
      if (n.has(k)) n.delete(k);
      else {
        n.add(k);
        // Fetch usage on first expand. We never refetch automatically — these
        // numbers don't change every second and the admin can re-collapse +
        // re-expand to retry on error.
        if (!usageById.has(k) && !usageInflight.current.has(k)) {
          usageInflight.current.add(k);
          getQuestionUsage(k)
            .then((u) => {
              setUsageById((prev2) => {
                const m = new Map(prev2);
                m.set(k, { ok: true, tests: u.tests ?? 0, attempts: u.attempts ?? 0 });
                return m;
              });
            })
            .catch((e) => {
              setUsageById((prev2) => {
                const m = new Map(prev2);
                m.set(k, { ok: false, error: getApiErrorMessage(e) });
                return m;
              });
            })
            .finally(() => {
              usageInflight.current.delete(k);
            });
        }
      }
      return n;
    });
  }

  const totalPages = pagination?.totalPages ?? 0;
  const total = pagination?.total ?? 0;
  const selectedCount = selectedIds.size;

  return (
    <div>
      <h1 className="page-title">Manage Questions</h1>
      <p className="page-subtitle">
        Search, filter, edit, and enable/disable questions. Disabled
        questions stay in old test history but are hidden from students and
        from Smart / weak / daily practice. Bulk-disable is reversible — hard
        delete is not exposed by design.
      </p>

      {refError ? <div className="alert alert-error">{refError}</div> : null}

      <div className="card form" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <label className="label" htmlFor="mq-search">
            Search
          </label>
          <input
            id="mq-search"
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search in question text…"
            disabled={refLoading}
          />
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label className="label" htmlFor="mq-post">
              Post
            </label>
            <select
              id="mq-post"
              className="input"
              value={filterPostId}
              onChange={handlePostChange}
              disabled={refLoading}
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
            <label className="label" htmlFor="mq-subject">
              Subject
            </label>
            <select
              id="mq-subject"
              className="input"
              value={filterSubjectId}
              onChange={handleSubjectChange}
              disabled={refLoading}
            >
              <option value="">
                {!filterPostId ? 'All subjects' : 'All subjects (this post)'}
              </option>
              {subjectOptions.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label className="label" htmlFor="mq-topic">
              Topic
            </label>
            <select
              id="mq-topic"
              className="input"
              value={filterTopicId}
              onChange={(e) => setFilterTopicId(e.target.value)}
              disabled={refLoading}
            >
              <option value="">
                {!filterSubjectId ? 'All topics' : 'All topics (this subject)'}
              </option>
              {topicOptions.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label className="label" htmlFor="mq-diff">
              Difficulty
            </label>
            <select
              id="mq-diff"
              className="input"
              value={filterDifficulty}
              onChange={(e) => setFilterDifficulty(e.target.value)}
            >
              <option value="">All</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div className="form-row">
            <label className="label" htmlFor="mq-type">
              Type
            </label>
            <select
              id="mq-type"
              className="input"
              value={filterQuestionType}
              onChange={(e) => setFilterQuestionType(e.target.value)}
            >
              <option value="">All</option>
              <option value="single_correct">Single correct</option>
              <option value="multiple_correct">Multiple correct</option>
              <option value="image_based">Image based</option>
            </select>
          </div>
          <div className="form-row">
            <label className="label" htmlFor="mq-status">
              Status
            </label>
            <select
              id="mq-status"
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Active + inactive</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={clearFilters}
            disabled={!hasTextFilters}
          >
            Clear filters
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={loadList}
            disabled={listLoading}
          >
            {listLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {selectedCount > 0 ? (
        <div className="bulk-bar">
          <span className="bulk-bar-count">
            {selectedCount} selected
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => askBulkSetStatus(true)}
            disabled={bulkBusy}
          >
            Enable selected
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => askBulkSetStatus(false)}
            disabled={bulkBusy}
          >
            Disable selected
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={clearSelection}
            disabled={bulkBusy}
          >
            Clear selection
          </button>
        </div>
      ) : null}

      {statusMsg ? <div className="alert alert-success">{statusMsg}</div> : null}
      {statusErr ? <div className="alert alert-error">{statusErr}</div> : null}
      {listError ? <div className="alert alert-error">{listError}</div> : null}

      <div className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 8,
          }}
        >
          <label
            className="helper"
            style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}
          >
            <input
              type="checkbox"
              checked={allOnPageSelected}
              onChange={toggleSelectAllOnPage}
              disabled={listLoading || questions.length === 0}
            />
            Select all on this page
          </label>
          <p className="helper" style={{ margin: 0 }}>
            {!listLoading && total > 0
              ? `Showing page ${page}${totalPages ? ` of ${totalPages}` : ''} · ${total} total`
              : null}
          </p>
        </div>

        {listLoading ? (
          <p className="helper">Loading questions…</p>
        ) : questions.length === 0 ? (
          <p className="helper">No questions match the current filters.</p>
        ) : (
          <ul className="row-list" style={{ flexDirection: 'column', gap: 0 }}>
            {questions.map((q) => {
              const id = String(q._id);
              const active = q.isActive !== false;
              const isToggling = String(togglingId) === id;
              const isOpen = expanded.has(id);
              const isSelected = selectedIds.has(id);
              const typeLabel = QUESTION_TYPE_LABELS[q.questionType] || q.questionType || '—';
              const diffLabel = q.difficulty
                ? DIFFICULTY_LABELS[q.difficulty] || q.difficulty
                : '—';
              const usage = usageById.get(id);
              return (
                <li
                  key={id}
                  className={`row-item${active ? '' : ' row-item-inactive'}${
                    isSelected ? ' row-item-selected' : ''
                  }`}
                  style={{ flexDirection: 'column', alignItems: 'stretch' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      alignItems: 'center',
                      width: '100%',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(id)}
                      aria-label="Select question"
                    />
                    <div
                      className="row-main row-main-static"
                      style={{ flex: '1 1 220px', minWidth: 0 }}
                    >
                      <div
                        className="row-name"
                        style={{ whiteSpace: 'normal', fontSize: '0.95rem' }}
                        title={q.questionText}
                      >
                        {isOpen
                          ? q.questionText
                          : previewText(q.questionText, 100)}
                        {q.questionText && q.questionText.length > 100 ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            style={{ marginLeft: 8, verticalAlign: 'baseline' }}
                            onClick={() => toggleExpand(id)}
                          >
                            {isOpen ? 'Show less' : 'Expand'}
                          </button>
                        ) : null}
                      </div>
                      <div className="helper" style={{ marginTop: 4 }}>
                        {q.topic?.name || '—'} · {q.subject?.name || '—'}
                        {q.posts && q.posts.length > 0
                          ? ` · ${q.posts.map((p) => p.name || p.slug).join(', ')}`
                          : ''}
                        {q.createdAt ? ` · ${formatDate(q.createdAt)}` : ''}
                      </div>
                    </div>
                    <div
                      className="helper"
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {diffLabel} · {typeLabel}
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
                      onClick={() => navigate(`/add-question?edit=${encodeURIComponent(id)}`)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`btn btn-small ${active ? 'btn-danger' : 'btn-ghost'}`}
                      onClick={() => askToggle(q)}
                      disabled={isToggling || bulkBusy}
                    >
                      {isToggling ? '…' : active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                  {isOpen ? (
                    <div className="helper" style={{ marginTop: 8 }}>
                      {usage ? (
                        usage.ok ? (
                          <>
                            Used in <strong>{usage.tests}</strong> test
                            {usage.tests === 1 ? '' : 's'} ·{' '}
                            <strong>{usage.attempts}</strong> attempt
                            {usage.attempts === 1 ? '' : 's'} so far.
                          </>
                        ) : (
                          <>Couldn't load usage info: {usage.error}</>
                        )
                      ) : (
                        'Loading usage info…'
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {totalPages > 1 ? (
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={listLoading || page <= 1}
            >
              Previous
            </button>
            <span className="helper">
              Page {page} / {Math.max(1, totalPages)}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPage((p) => p + 1)}
              disabled={listLoading || page >= totalPages}
            >
              Next
            </button>
          </div>
        ) : null}

        <p className="helper" style={{ marginTop: 16 }}>
          Tip: <Link to="/add-question">Add Question</Link> for one-off rows;{' '}
          <Link to="/import-questions">Import Questions</Link> for bulk CSV
          uploads.
        </p>
      </div>

      {confirmDialog ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>{confirmDialog.title}</h3>
            <p className="helper">{confirmDialog.body}</p>

            {confirmDialog.requireTyping ? (
              <div className="form-row">
                <label className="label" htmlFor="bulk-confirm-input">
                  Type <strong>CONFIRM</strong> to proceed:
                </label>
                <input
                  id="bulk-confirm-input"
                  className="input"
                  value={typedConfirm}
                  onChange={(e) => setTypedConfirm(e.target.value)}
                  autoFocus
                />
              </div>
            ) : null}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeConfirm}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${confirmDialog.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={handleConfirm}
                disabled={
                  confirmDialog.requireTyping &&
                  typedConfirm.trim().toUpperCase() !== 'CONFIRM'
                }
              >
                {confirmDialog.danger ? 'Yes, disable' : 'Yes, continue'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
