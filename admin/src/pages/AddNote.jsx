import { useEffect, useMemo, useState } from 'react';
import {
  createNote,
  getPosts,
  getSubjects,
  getTopics,
  getApiErrorMessage,
} from '../services/api';

function asArray(res, key) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res[key])) return res[key];
  return [];
}

const initialForm = {
  title: '',
  content: '',
  postIds: [],
  subjectId: '',
  topicId: '',
};

/**
 * Topic-wise study note editor.
 *
 * Normalized hierarchy: Subject → Topic.
 *
 * Notes still store a required `postId` in the backend, but Posts are not
 * an ownership hierarchy for Subjects/Topics. So Subjects must be global
 * and Topics must depend only on Subject selection.
 */
export default function AddNote() {
  const [form, setForm] = useState(initialForm);

  const [posts, setPosts] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);

  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);

  const [metaError, setMetaError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // ---- Load posts once on mount ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingPosts(true);
        setMetaError('');
        const res = await getPosts();
        if (cancelled) return;
        setPosts(asArray(res, 'posts'));
      } catch (e) {
        if (!cancelled) setMetaError(getApiErrorMessage(e));
      } finally {
        if (!cancelled) setLoadingPosts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectablePosts = useMemo(
    () => posts.filter((p) => p && p.isActive !== false),
    [posts]
  );

  // ---- Load subjects once (global catalog) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingSubjects(true);
        const res = await getSubjects({ includeInactive: true });
        if (cancelled) return;
        setSubjects(asArray(res, 'subjects'));
      } catch (e) {
        if (!cancelled) {
          setMetaError(getApiErrorMessage(e));
          setSubjects([]);
        }
      } finally {
        if (!cancelled) setLoadingSubjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Reload topics whenever the selected subject changes ----
  useEffect(() => {
    let cancelled = false;
    if (!form.subjectId) {
      setTopics([]);
      return undefined;
    }
    (async () => {
      try {
        setLoadingTopics(true);
        const res = await getTopics({ subjectId: form.subjectId });
        if (cancelled) return;
        setTopics(asArray(res, 'topics'));
      } catch (e) {
        if (!cancelled) {
          setMetaError(getApiErrorMessage(e));
          setTopics([]);
        }
      } finally {
        if (!cancelled) setLoadingTopics(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.subjectId]);

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function resetForm() {
    setForm(initialForm);
  }

  function validate() {
    if (!form.title.trim()) return 'Title is required.';
    if (form.title.trim().length < 2) {
      return 'Title must be at least 2 characters.';
    }
    if (!form.content.trim()) return 'Content cannot be empty.';
    if (!form.subjectId) return 'Please select a subject.';
    // This is the spec's hard gate: "Cannot create note without topic".
    if (!form.topicId) return 'Please select a topic.';
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

    try {
      setSubmitting(true);
      await createNote({
        title: form.title.trim(),
        content: form.content,
        postIds: Array.isArray(form.postIds) ? form.postIds : [],
        subjectId: form.subjectId,
        topicId: form.topicId,
      });
      setSuccessMsg('Note added successfully.');
      resetForm();
    } catch (err) {
      setErrorMsg(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const topicPlaceholder = !form.subjectId
    ? '— Select a subject first —'
    : loadingTopics
    ? 'Loading topics…'
    : topics.length === 0
    ? 'No topics for this subject'
    : '— Select topic —';

  const subjectPlaceholder = loadingSubjects
    ? 'Loading subjects…'
    : subjects.length === 0
    ? 'No subjects available'
    : '— Select subject —';

  return (
    <div>
      <h1 className="page-title">Add Note</h1>
      <p className="page-subtitle">
        Create topic-wise study notes organized by{' '}
        <strong>Subject → Topic</strong>. Optionally tag notes to one or more exams (posts) for filtering,
        but subjects/topics are always global.
      </p>

      {metaError ? <div className="alert alert-error">{metaError}</div> : null}

      <form className="card form" onSubmit={handleSubmit}>
        {successMsg ? (
          <div className="alert alert-success">{successMsg}</div>
        ) : null}
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
            placeholder="e.g. Constitution of India — Key Articles"
            disabled={submitting}
            maxLength={200}
          />
        </div>

        <div className="form-grid">
          <div className="form-row">
            <span className="label">Optional exam tags</span>
            {loadingPosts ? (
              <p className="helper">Loading posts…</p>
            ) : selectablePosts.length === 0 ? (
              <p className="helper">
                No active posts yet. Create one in <strong>Subjects &amp; Topics</strong>.
              </p>
            ) : (
              <div
                className="card"
                style={{
                  maxHeight: 220,
                  overflowY: 'auto',
                  padding: 12,
                  border: '1px solid var(--border)',
                }}
              >
                {selectablePosts.map((p) => {
                  const id = String(p._id);
                  const checked = Array.isArray(form.postIds) && form.postIds.includes(id);
                  return (
                    <label
                      key={id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 0',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setForm((prev) => {
                            const next = Array.isArray(prev.postIds) ? [...prev.postIds] : [];
                            if (next.includes(id)) {
                              return { ...prev, postIds: next.filter((x) => x !== id) };
                            }
                            next.push(id);
                            return { ...prev, postIds: next };
                          })
                        }
                        disabled={submitting}
                      />
                      <span>{p.name || p.slug || id}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="helper">
              Optional: used to filter notes per exam. Subjects/topics remain global.
            </p>
          </div>

          <div className="form-row">
            <label className="label" htmlFor="subjectId">
              Subject *
            </label>
            <select
              id="subjectId"
              className="input"
              value={form.subjectId}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  subjectId: e.target.value,
                  topicId: '',
                }))
              }
              disabled={submitting || loadingSubjects}
            >
              <option value="">{subjectPlaceholder}</option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label className="label" htmlFor="topicId">
              Topic *
            </label>
            <select
              id="topicId"
              className="input"
              value={form.topicId}
              onChange={(e) => updateField('topicId', e.target.value)}
              disabled={submitting || !form.subjectId || loadingTopics}
            >
              <option value="">{topicPlaceholder}</option>
              {topics.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
            {form.subjectId && !loadingTopics && topics.length === 0 ? (
              <p className="helper">
                No topics yet for this subject — add one in Subjects &amp;
                Topics.
              </p>
            ) : null}
          </div>
        </div>

        <div className="form-row">
          <label className="label" htmlFor="content">
            Content *
          </label>
          <textarea
            id="content"
            className="input"
            rows={14}
            value={form.content}
            onChange={(e) => updateField('content', e.target.value)}
            placeholder="Write the note in plain text or Markdown…"
            disabled={submitting}
            maxLength={65000}
          />
          <p className="helper">
            Plain text or Markdown. Max 65,000 characters.
          </p>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resetForm}
            disabled={submitting}
          >
            Reset
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || loadingPosts}
          >
            {submitting ? 'Saving…' : 'Create Note'}
          </button>
        </div>
      </form>
    </div>
  );
}
