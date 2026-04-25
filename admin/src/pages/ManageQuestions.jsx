import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getApiErrorMessage,
  getPosts,
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

function asArray(res, key) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res[key])) return res[key];
  return [];
}

function confirmDisable(preview) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true;
  }
  return window.confirm(
    `Disable this question? Students, Smart Practice, and new test picks will stop using it.`
  );
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
 * Admin: search, filter, enable/disable, and deep link to the shared
 * Add Question form in edit mode.
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
  const [toggleMsg, setToggleMsg] = useState('');
  const [toggleErr, setToggleErr] = useState('');

  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
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
    return subjects.filter((s) => String(s.postId) === String(filterPostId));
  }, [subjects, filterPostId]);

  const topicOptions = useMemo(() => {
    if (!filterSubjectId) {
      if (!filterPostId) return topics;
      const subs = new Set(
        subjects
          .filter((s) => String(s.postId) === String(filterPostId))
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

  async function handleToggle(q) {
    if (togglingId) return;
    const nextActive = !q.isActive;
    if (!nextActive && !confirmDisable(q.questionText)) return;

    setToggleErr('');
    setToggleMsg('');
    setTogglingId(q._id);

    setQuestions((prev) =>
      prev.map((row) =>
        String(row._id) === String(q._id) ? { ...row, isActive: nextActive } : row
      )
    );

    try {
      const res = await updateQuestion(q._id, { isActive: nextActive });
      const updated = res?.question || res;
      if (updated && updated._id) {
        setQuestions((prev) =>
          prev.map((row) =>
            String(row._id) === String(updated._id) ? { ...row, ...updated } : row
          )
        );
      }
      setToggleMsg(nextActive ? 'Question enabled.' : 'Question disabled.');
    } catch (e) {
      setQuestions((prev) =>
        prev.map((row) =>
          String(row._id) === String(q._id) ? { ...row, isActive: !nextActive } : row
        )
      );
      setToggleErr(getApiErrorMessage(e));
    } finally {
      setTogglingId(null);
    }
  }

  function toggleExpand(id) {
    setExpanded((prev) => {
      const n = new Set(prev);
      const k = String(id);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  const totalPages = pagination?.totalPages ?? 0;
  const total = pagination?.total ?? 0;

  return (
    <div>
      <h1 className="page-title">Manage Questions</h1>
      <p className="page-subtitle">
        Search and filter the question bank, edit in place, or enable/disable
        without deleting. Disabled questions stay in old test history but are
        hidden from students and from Smart / weak practice.
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

      {toggleMsg ? <div className="alert alert-success">{toggleMsg}</div> : null}
      {toggleErr ? <div className="alert alert-error">{toggleErr}</div> : null}
      {listError ? <div className="alert alert-error">{listError}</div> : null}

      <div className="card">
        <p className="helper" style={{ marginTop: 0 }}>
          {!listLoading && total > 0
            ? `Showing page ${page}${totalPages ? ` of ${totalPages}` : ''} · ${total} total`
            : null}
        </p>
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
              const typeLabel = QUESTION_TYPE_LABELS[q.questionType] || q.questionType || '—';
              const diffLabel = q.difficulty
                ? DIFFICULTY_LABELS[q.difficulty] || q.difficulty
                : '—';
              return (
                <li
                  key={id}
                  className={`row-item${active ? '' : ' row-item-inactive'}`}
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
                      className="btn btn-ghost btn-small"
                      onClick={() => handleToggle(q)}
                      disabled={isToggling}
                    >
                      {isToggling ? '…' : active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
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
          Tip: <Link to="/add-question">Add Question</Link> is unchanged; editing
          reuses the same form to avoid duplicate logic.
        </p>
      </div>
    </div>
  );
}
