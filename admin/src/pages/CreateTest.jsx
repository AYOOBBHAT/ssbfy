import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createTest,
  listQuestionsAdmin,
  getSubjects,
  getTopics,
  getPosts,
  getApiErrorMessage,
} from '../services/api';

const DIFFICULTIES = ['', 'easy', 'medium', 'hard'];
const PAGE_SIZE = 30;

const initialForm = {
  title: '',
  duration: 30,
  negativeMarking: 0,
};

function inferPreviewType(metaById) {
  const entries = Object.values(metaById || {});
  if (entries.length === 0) return null;
  const topicIds = new Set(entries.map((e) => e.topicId).filter(Boolean));
  const subjectIds = new Set(entries.map((e) => e.subjectId).filter(Boolean));
  const postIds = new Set(entries.map((e) => e.postId).filter(Boolean));
  if (topicIds.size === 1) return 'topic';
  if (subjectIds.size === 1) return 'subject';
  if (postIds.size === 1) return 'post';
  return 'mixed';
}

function labelForInferred(t) {
  if (!t) return '—';
  if (t === 'topic') return 'Topic focus (single topic)';
  if (t === 'subject') return 'Subject focus';
  if (t === 'post') return 'Exam / post focus';
  return 'Mixed scope';
}

export default function CreateTest() {
  const [form, setForm] = useState(initialForm);
  const [selected, setSelected] = useState(() => new Set());
  /** @type {Record<string, { topicId: string, subjectId: string, postId: string|null }>} */
  const [selectionMeta, setSelectionMeta] = useState({});

  const [posts, setPosts] = useState([]);
  const [selectedPostId, setSelectedPostId] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);

  const [filterSubjectId, setFilterSubjectId] = useState('');
  const [filterTopicId, setFilterTopicId] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterPostTag, setFilterPostTag] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [topicSearchText, setTopicSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debouncedTopicSearch, setDebouncedTopicSearch] = useState('');

  const [questions, setQuestions] = useState([]);
  const [page, setPage] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionsError, setQuestionsError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText.trim()), 320);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTopicSearch(topicSearchText.trim()), 320);
    return () => clearTimeout(t);
  }, [topicSearchText]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingPosts(true);
        const res = await getPosts();
        if (cancelled) return;
        const list = Array.isArray(res) ? res : res?.posts || [];
        setPosts(list);
        if (list.length && !selectedPostId) {
          setSelectedPostId(String(list[0]._id));
        }
      } catch (e) {
        if (!cancelled) setErrorMsg(getApiErrorMessage(e));
      } finally {
        if (!cancelled) setLoadingPosts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!selectedPostId) {
      setSubjects([]);
      return undefined;
    }
    (async () => {
      try {
        setLoadingSubjects(true);
        const res = await getSubjects({ postId: selectedPostId, includeInactive: true });
        if (cancelled) return;
        const list = Array.isArray(res) ? res : res?.subjects || [];
        setSubjects(list);
      } catch (e) {
        if (!cancelled) {
          setSubjects([]);
          setErrorMsg(getApiErrorMessage(e));
        }
      } finally {
        if (!cancelled) setLoadingSubjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPostId]);

  useEffect(() => {
    let cancelled = false;
    if (!filterSubjectId) {
      setTopics([]);
      return undefined;
    }
    (async () => {
      try {
        setLoadingTopics(true);
        const res = await getTopics({ subjectId: filterSubjectId, includeInactive: true });
        if (cancelled) return;
        const list = Array.isArray(res) ? res : res?.topics || [];
        setTopics(list);
      } catch (e) {
        if (!cancelled) {
          setTopics([]);
          setQuestionsError(getApiErrorMessage(e));
        }
      } finally {
        if (!cancelled) setLoadingTopics(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterSubjectId]);

  const fetchPage = useCallback(
    async (pageNum, append) => {
      try {
        setLoadingQuestions(true);
        setQuestionsError('');
        const params = {
          page: pageNum,
          pageSize: PAGE_SIZE,
          includeInactive: false,
          projection: 'picker',
        };
        if (filterSubjectId) params.subjectId = filterSubjectId;
        if (filterTopicId) params.topicId = filterTopicId;
        if (filterDifficulty) params.difficulty = filterDifficulty;
        if (debouncedSearch) params.search = debouncedSearch;
        if (debouncedTopicSearch && filterSubjectId) {
          params.topicSearch = debouncedTopicSearch;
        }
        if (filterPostTag && selectedPostId) {
          params.postId = selectedPostId;
        }

        const res = await listQuestionsAdmin(params);
        const list = res?.questions ?? [];
        const pagination = res?.pagination ?? {};
        const total = Number(pagination.total) || 0;
        const totalPages = Number(pagination.totalPages) || 0;

        setTotalFiltered(total);
        setHasMore(pageNum < totalPages);

        setQuestions((prev) => {
          if (!append) return list;
          const seen = new Set(prev.map((q) => String(q._id)));
          const merged = [...prev];
          for (const q of list) {
            const id = String(q._id);
            if (!seen.has(id)) {
              seen.add(id);
              merged.push(q);
            }
          }
          return merged;
        });
      } catch (e) {
        setQuestionsError(getApiErrorMessage(e));
        if (!append) setQuestions([]);
        setTotalFiltered(0);
        setHasMore(false);
      } finally {
        setLoadingQuestions(false);
      }
    },
    [
      filterSubjectId,
      filterTopicId,
      filterDifficulty,
      debouncedSearch,
      debouncedTopicSearch,
      filterPostTag,
      selectedPostId,
    ]
  );

  useEffect(() => {
    if (!selectedPostId) return;
    setPage(1);
    fetchPage(1, false);
  }, [
    selectedPostId,
    filterSubjectId,
    filterTopicId,
    filterDifficulty,
    debouncedSearch,
    debouncedTopicSearch,
    filterPostTag,
    fetchPage,
  ]);

  useEffect(() => {
    if (page <= 1) return;
    fetchPage(page, true);
  }, [page, fetchPage]);

  const subjectMap = useMemo(() => {
    const m = {};
    for (const s of subjects) m[String(s._id)] = s.name || s.title || s._id;
    return m;
  }, [subjects]);

  const topicMap = useMemo(() => {
    const m = {};
    for (const t of topics) m[String(t._id)] = t.name || t._id;
    return m;
  }, [topics]);

  const inferredType = useMemo(
    () => inferPreviewType(selectionMeta),
    [selectionMeta]
  );

  const selectedQuestionsOnPage = useMemo(
    () => questions.filter((q) => selected.has(String(q._id))),
    [questions, selected]
  );

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function extractMeta(q) {
    const subjectRef = q.subjectId;
    const topicRef = q.topicId;
    const sid =
      subjectRef && typeof subjectRef === 'object'
        ? String(subjectRef._id ?? '')
        : String(subjectRef || '');
    const tid =
      topicRef && typeof topicRef === 'object' ? String(topicRef._id ?? '') : String(topicRef || '');
    let postId = null;
    if (subjectRef && typeof subjectRef === 'object' && subjectRef.postId) {
      postId = String(subjectRef.postId);
    } else {
      const subj = subjects.find((s) => String(s._id) === sid);
      if (subj?.postId) postId = String(subj.postId);
    }
    return { subjectId: sid, topicId: tid, postId };
  }

  function toggleSelect(q) {
    const id = String(q._id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setSelectionMeta((m) => {
          const copy = { ...m };
          delete copy[id];
          return copy;
        });
      } else {
        next.add(id);
        setSelectionMeta((m) => ({ ...m, [id]: extractMeta(q) }));
      }
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      const meta = { ...selectionMeta };
      for (const q of questions) {
        const id = String(q._id);
        if (!next.has(id)) {
          next.add(id);
          meta[id] = extractMeta(q);
        }
      }
      setSelectionMeta(meta);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setSelectionMeta({});
  }

  function resetForm() {
    setForm(initialForm);
    setSelected(new Set());
    setSelectionMeta({});
    setSuccessMsg('');
    setErrorMsg('');
  }

  function validate() {
    if (!form.title.trim()) return 'Title is required.';
    if (selected.size === 0) return 'Select at least one question.';
    const dur = Number(form.duration);
    if (!Number.isFinite(dur) || dur < 1) {
      return 'Duration must be a positive number of minutes.';
    }
    const neg = Number(form.negativeMarking);
    if (!Number.isFinite(neg) || neg < 0) {
      return 'Negative marking must be 0 or greater.';
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSuccessMsg('');
    setErrorMsg('');

    const validationError = validate();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    const payload = {
      title: form.title.trim(),
      questionIds: Array.from(selected),
      duration: Number(form.duration),
      negativeMarking: Number(form.negativeMarking) || 0,
    };

    try {
      setSubmitting(true);
      await createTest(payload);
      setSuccessMsg(
        `Test "${payload.title}" created with ${payload.questionIds.length} question(s).`
      );
      resetForm();
    } catch (err) {
      setErrorMsg(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function onPostChange(postId) {
    setSelectedPostId(postId);
    setFilterSubjectId('');
    setFilterTopicId('');
    setTopics([]);
  }

  function onSubjectChange(subjectId) {
    setFilterSubjectId(subjectId);
    setFilterTopicId('');
  }

  function loadMore() {
    if (loadingQuestions || !hasMore) return;
    setPage((p) => p + 1);
  }

  return (
    <div>
      <h1 className="page-title">Create Test</h1>
      <p className="page-subtitle">
        Post → Subject → Topic hierarchy filters the question bank. Optional post tag narrows to
        questions that reference this exam in <code>postIds</code>. Test type is inferred on save.
      </p>

      <form className="form" onSubmit={handleSubmit}>
        <div className="card form">
          {successMsg ? <div className="alert alert-success">{successMsg}</div> : null}
          {errorMsg ? <div className="alert alert-error">{errorMsg}</div> : null}

          <div className="form-row">
            <label className="label" htmlFor="title">
              Title *
            </label>
            <input
              id="title"
              type="text"
              className="input"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="e.g. JKSSB JE — Mock Test 1"
              disabled={submitting}
            />
          </div>

          <div className="form-grid">
            <div className="form-row">
              <label className="label" htmlFor="duration">
                Duration (minutes) *
              </label>
              <input
                id="duration"
                type="number"
                min="1"
                className="input"
                value={form.duration}
                onChange={(e) => updateField('duration', e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="form-row">
              <label className="label" htmlFor="negativeMarking">
                Negative marking
              </label>
              <input
                id="negativeMarking"
                type="number"
                min="0"
                step="0.25"
                className="input"
                value={form.negativeMarking}
                onChange={(e) => updateField('negativeMarking', e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="form-row">
            <span className="label">Inferred test type (preview)</span>
            <p className="helper" style={{ marginTop: 4 }}>
              {labelForInferred(inferredType)} — the server stores the same classification from your
              selected questions when you omit <code>type</code>.
            </p>
          </div>
        </div>

        <div className="card form">
          <div className="picker-header">
            <div>
              <h3 className="card-title">Select questions *</h3>
              <p className="card-desc">
                Total matching filters: <strong>{totalFiltered}</strong>
                {' · '}
                Selected: <strong>{selected.size}</strong>
                {questions.length > 0
                  ? ` · Loaded ${questions.length}${totalFiltered > questions.length ? ` (page ${page})` : ''}`
                  : null}
              </p>
            </div>
            <div className="picker-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={selectAllVisible}
                disabled={submitting || loadingQuestions || questions.length === 0}
              >
                Add visible to selection
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={clearSelection}
                disabled={submitting || selected.size === 0}
              >
                Clear ({selected.size})
              </button>
            </div>
          </div>

          <div className="hierarchy-hint muted" style={{ marginBottom: 12 }}>
            <strong>Hierarchy:</strong> Post → Subject → Topic → Questions. Pick a post first; then
            narrow subject and topic. Search matches question wording; topic search matches topic
            names within the selected subject.
          </div>

          <div className="form-grid">
            <div className="form-row">
              <label className="label" htmlFor="postPick">
                Post (exam) *
              </label>
              <select
                id="postPick"
                className="input"
                value={selectedPostId}
                onChange={(e) => onPostChange(e.target.value)}
                disabled={submitting || loadingPosts}
              >
                <option value="">
                  {loadingPosts ? 'Loading posts…' : '— Select post —'}
                </option>
                {posts.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name || p.slug || p._id}
                  </option>
                ))}
              </select>
              {!loadingPosts && posts.length === 0 ? (
                <p className="helper">No posts yet. Create one in Manage Subjects &amp; Topics.</p>
              ) : null}
            </div>

            <div className="form-row">
              <label className="label" htmlFor="filterSubject">
                Subject
              </label>
              <select
                id="filterSubject"
                className="input"
                value={filterSubjectId}
                onChange={(e) => onSubjectChange(e.target.value)}
                disabled={submitting || !selectedPostId || loadingSubjects}
              >
                <option value="">
                  {!selectedPostId
                    ? '— Select a post first —'
                    : loadingSubjects
                      ? 'Loading subjects…'
                      : 'All subjects under this post'}
                </option>
                {subjects.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name || s.title || s._id}
                  </option>
                ))}
              </select>
              {selectedPostId && !loadingSubjects && subjects.length === 0 ? (
                <p className="helper">No subjects for this post yet.</p>
              ) : null}
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
                disabled={submitting || !filterSubjectId || loadingTopics}
              >
                <option value="">
                  {!filterSubjectId
                    ? '— Select a subject first —'
                    : loadingTopics
                      ? 'Loading topics…'
                      : 'All topics'}
                </option>
                {topics.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name || t._id}
                  </option>
                ))}
              </select>
              {filterSubjectId && !loadingTopics && topics.length === 0 ? (
                <p className="helper">No topics for this subject.</p>
              ) : null}
            </div>

            <div className="form-row">
              <label className="label" htmlFor="filterDifficulty">
                Difficulty
              </label>
              <select
                id="filterDifficulty"
                className="input"
                value={filterDifficulty}
                onChange={(e) => setFilterDifficulty(e.target.value)}
                disabled={submitting}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d || 'all'} value={d}>
                    {d ? d.charAt(0).toUpperCase() + d.slice(1) : 'All difficulties'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-row">
              <label className="label" htmlFor="searchText">
                Search question text
              </label>
              <input
                id="searchText"
                type="search"
                className="input"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Keywords from the stem…"
                disabled={submitting}
              />
            </div>
            <div className="form-row">
              <label className="label" htmlFor="topicSearchText">
                Search topic name
              </label>
              <input
                id="topicSearchText"
                type="search"
                className="input"
                value={topicSearchText}
                onChange={(e) => setTopicSearchText(e.target.value)}
                placeholder={filterSubjectId ? 'Topic name contains…' : 'Pick a subject first'}
                disabled={submitting || !filterSubjectId}
              />
            </div>
            <div className="form-row" style={{ alignSelf: 'end' }}>
              <label className="checkbox-label" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={filterPostTag}
                  onChange={(e) => setFilterPostTag(e.target.checked)}
                  disabled={submitting || !selectedPostId}
                />
                Limit to questions tagged with this post
              </label>
              <p className="helper">
                Uses <code>postIds</code> containment. Turn off to include shared questions tagged only
                with other exams (same subject/topic filters still apply).
              </p>
            </div>
          </div>

          {questionsError ? <div className="alert alert-error">{questionsError}</div> : null}

          {loadingQuestions && questions.length === 0 ? (
            <p className="muted">Loading questions…</p>
          ) : questions.length === 0 ? (
            <p className="muted">No questions match the current filters.</p>
          ) : (
            <ul className="question-list">
              {questions.map((q) => {
                const id = String(q._id);
                const isSelected = selected.has(id);
                const sid =
                  typeof q.subjectId === 'object' ? q.subjectId?._id : q.subjectId;
                const tid = typeof q.topicId === 'object' ? q.topicId?._id : q.topicId;
                const topicLabel =
                  typeof q.topicId === 'object' && q.topicId?.name
                    ? q.topicId.name
                    : topicMap[String(tid)] || '';
                return (
                  <li
                    key={id}
                    className={`question-item ${isSelected ? 'question-item-selected' : ''}`}
                  >
                    <label className="question-label">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(q)}
                        disabled={submitting}
                      />
                      <div className="question-body">
                        <div className="question-text">{q.questionText}</div>
                        <div className="question-meta">
                          {q.difficulty ? (
                            <span className={`badge badge-${q.difficulty}`}>{q.difficulty}</span>
                          ) : null}
                          {sid ? (
                            <span className="meta-text">
                              {subjectMap[String(sid)] || 'Subject'}
                            </span>
                          ) : null}
                          {topicLabel ? <span className="meta-text">{topicLabel}</span> : null}
                          {q.year ? <span className="meta-text">{q.year}</span> : null}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {hasMore ? (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadMore}
                disabled={loadingQuestions}
              >
                {loadingQuestions ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}

          {selected.size > 0 && selected.size > selectedQuestionsOnPage.length ? (
            <p className="muted">
              {selected.size - selectedQuestionsOnPage.length} selected question(s) are not in the
              current loaded page — they stay selected for the test.
            </p>
          ) : null}
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={submitting}>
            Reset
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : `Create test (${selected.size})`}
          </button>
        </div>
      </form>
    </div>
  );
}
