import { useEffect, useState } from 'react';
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
  postId: '',
  subjectId: '',
  topicId: '',
};

/**
 * Topic-wise study note editor.
 *
 * Cascading dropdowns: Post drives Subjects, Subject drives Topics. Changing
 * a parent clears the children so the form can never submit an invalid
 * hierarchy pair — the backend also validates this, so this is just a
 * UX fast-fail.
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

  // ---- Reload subjects whenever the selected post changes ----
  useEffect(() => {
    let cancelled = false;
    if (!form.postId) {
      setSubjects([]);
      return undefined;
    }
    (async () => {
      try {
        setLoadingSubjects(true);
        const res = await getSubjects({ postId: form.postId });
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
  }, [form.postId]);

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
    if (!form.postId) return 'Please select a post.';
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
        postId: form.postId,
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

  const topicPlaceholder = !form.postId
    ? '— Select a post first —'
    : !form.subjectId
    ? '— Select a subject first —'
    : loadingTopics
    ? 'Loading topics…'
    : topics.length === 0
    ? 'No topics for this subject'
    : '— Select topic —';

  const subjectPlaceholder = !form.postId
    ? '— Select a post first —'
    : loadingSubjects
    ? 'Loading subjects…'
    : subjects.length === 0
    ? 'No subjects for this post'
    : '— Select subject —';

  return (
    <div>
      <h1 className="page-title">Add Note</h1>
      <p className="page-subtitle">
        Create topic-wise study notes. Notes follow the same{' '}
        <strong>Post → Subject → Topic</strong> hierarchy as questions.
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
            <label className="label" htmlFor="postId">
              Post *
            </label>
            <select
              id="postId"
              className="input"
              value={form.postId}
              onChange={(e) =>
                // Changing the post invalidates any previously-selected
                // subject/topic, so we reset both in the same update.
                setForm((prev) => ({
                  ...prev,
                  postId: e.target.value,
                  subjectId: '',
                  topicId: '',
                }))
              }
              disabled={submitting || loadingPosts || posts.length === 0}
            >
              <option value="">
                {loadingPosts
                  ? 'Loading posts…'
                  : posts.length === 0
                  ? 'No posts yet'
                  : '— Select post —'}
              </option>
              {posts.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name || p.slug || p._id}
                </option>
              ))}
            </select>
            {!loadingPosts && posts.length === 0 ? (
              <p className="helper">
                Create a post in <strong>Subjects &amp; Topics</strong> first.
              </p>
            ) : null}
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
              disabled={submitting || !form.postId || loadingSubjects}
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
