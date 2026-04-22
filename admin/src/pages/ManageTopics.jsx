import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createPost,
  createSubject,
  createTopic,
  getPosts,
  getSubjects,
  getTopics,
  updateSubject,
  updateTopic,
  getApiErrorMessage,
} from '../services/api';

function asArray(res, key) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res[key])) return res[key];
  return [];
}

/**
 * Ask the admin to confirm a disable action. We use `window.confirm` because
 * it's fully blocking, keyboard-accessible by default, and zero-dependency —
 * good fit for an infrequent destructive-ish action where a full modal is
 * overkill. Returns `true` when the admin confirms, `false` otherwise (incl.
 * non-browser environments where `window.confirm` isn't available).
 */
function confirmDisable(kind, name) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true;
  }
  const label = name ? `${kind} "${name}"` : `this ${kind}`;
  return window.confirm(
    `Are you sure you want to disable ${label}? It will not be available for new questions.`
  );
}

/**
 * Parse an order input string.
 * - Empty → `undefined` (omit from payload so the server default 0 applies)
 * - Non-negative integer → that number
 * - Anything else → sentinel `'invalid'` so the caller can show an error
 */
function parseOrder(raw) {
  const trimmed = String(raw ?? '').trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0) return 'invalid';
  return n;
}

export default function ManageTopics() {
  // ------ Posts ------
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [postsError, setPostsError] = useState('');

  // Post selection drives both the "create subject under this post" form
  // and the "list subjects scoped to this post" section below.
  const [selectedPostId, setSelectedPostId] = useState('');

  // ------ Create Post ------
  const [postName, setPostName] = useState('');
  const [postDescription, setPostDescription] = useState('');
  const [creatingPost, setCreatingPost] = useState(false);
  const [postMsg, setPostMsg] = useState('');
  const [postErr, setPostErr] = useState('');

  // ------ Subjects (scoped to selectedPostId) ------
  const [subjects, setSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [subjectsError, setSubjectsError] = useState('');

  const [subjectName, setSubjectName] = useState('');
  const [subjectOrder, setSubjectOrder] = useState('');
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [subjectMsg, setSubjectMsg] = useState('');
  const [subjectErr, setSubjectErr] = useState('');

  // ------ Topics (scoped to selectedSubjectId) ------
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [topics, setTopics] = useState([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topicsError, setTopicsError] = useState('');

  const [topicName, setTopicName] = useState('');
  const [topicOrder, setTopicOrder] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [topicMsg, setTopicMsg] = useState('');
  const [topicErr, setTopicErr] = useState('');

  // Per-row "pending" flags so individual toggle buttons can show a
  // busy state without blocking other rows.
  const [togglingSubjectId, setTogglingSubjectId] = useState('');
  const [togglingTopicId, setTogglingTopicId] = useState('');

  // ------ Loaders ------
  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    setPostsError('');
    try {
      const res = await getPosts();
      const list = asArray(res, 'posts');
      setPosts(list);
      // Auto-select the first post so the admin can start creating subjects
      // immediately without an extra click.
      if (list.length && !selectedPostId) {
        setSelectedPostId(String(list[0]._id));
      }
    } catch (e) {
      setPostsError(getApiErrorMessage(e));
      setPosts([]);
    } finally {
      setLoadingPosts(false);
    }
    // selectedPostId is intentionally omitted to avoid re-running on selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSubjects = useCallback(async (postId) => {
    if (!postId) {
      setSubjects([]);
      return;
    }
    setLoadingSubjects(true);
    setSubjectsError('');
    try {
      // Admins manage status, so we need to see inactive items here too.
      // The backend only honors `includeInactive` for authenticated admins.
      const res = await getSubjects({ postId, includeInactive: true });
      setSubjects(asArray(res, 'subjects'));
    } catch (e) {
      setSubjectsError(getApiErrorMessage(e));
      setSubjects([]);
    } finally {
      setLoadingSubjects(false);
    }
  }, []);

  const loadTopics = useCallback(async (subjectId) => {
    if (!subjectId) {
      setTopics([]);
      return;
    }
    setLoadingTopics(true);
    setTopicsError('');
    try {
      const res = await getTopics({ subjectId, includeInactive: true });
      setTopics(asArray(res, 'topics'));
    } catch (e) {
      setTopicsError(getApiErrorMessage(e));
      setTopics([]);
    } finally {
      setLoadingTopics(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    // Changing the post resets subject selection so the UI never shows
    // topics from a different post by accident.
    setSelectedSubjectId('');
    setTopics([]);
    loadSubjects(selectedPostId);
  }, [selectedPostId, loadSubjects]);

  useEffect(() => {
    loadTopics(selectedSubjectId);
  }, [selectedSubjectId, loadTopics]);

  const selectedPost = useMemo(
    () => posts.find((p) => String(p._id) === String(selectedPostId)) || null,
    [posts, selectedPostId]
  );

  const selectedSubject = useMemo(
    () => subjects.find((s) => String(s._id) === String(selectedSubjectId)) || null,
    [subjects, selectedSubjectId]
  );

  // ------ Handlers ------
  async function handleCreatePost(e) {
    e.preventDefault();
    if (creatingPost) return;
    setPostMsg('');
    setPostErr('');

    const name = postName.trim();
    if (!name) {
      setPostErr('Post name is required.');
      return;
    }
    if (name.length < 2) {
      setPostErr('Post name must be at least 2 characters.');
      return;
    }

    try {
      setCreatingPost(true);
      const res = await createPost({
        name,
        description: postDescription.trim() || undefined,
      });
      const created = res?.post;

      setPostMsg(`Post "${name}" created.`);
      setPostName('');
      setPostDescription('');

      // Refresh the posts list so the new post appears in the dropdown
      // immediately, then auto-select it so the admin can proceed straight
      // to creating subjects under it.
      await loadPosts();
      if (created?._id) {
        setSelectedPostId(String(created._id));
      }
    } catch (err) {
      setPostErr(getApiErrorMessage(err));
    } finally {
      setCreatingPost(false);
    }
  }

  async function handleCreateSubject(e) {
    e.preventDefault();
    if (creatingSubject) return;
    setSubjectMsg('');
    setSubjectErr('');

    if (!selectedPostId) {
      setSubjectErr('Please select a post first.');
      return;
    }

    const name = subjectName.trim();
    if (!name) {
      setSubjectErr('Subject name is required.');
      return;
    }
    if (name.length < 2) {
      setSubjectErr('Subject name must be at least 2 characters.');
      return;
    }

    const orderValue = parseOrder(subjectOrder);
    if (orderValue === 'invalid') {
      setSubjectErr('Order must be a non-negative whole number.');
      return;
    }

    try {
      setCreatingSubject(true);
      const res = await createSubject({
        name,
        postId: selectedPostId,
        ...(orderValue !== undefined ? { order: orderValue } : {}),
      });
      setSubjectMsg(`Subject "${name}" created.`);
      setSubjectName('');
      setSubjectOrder('');
      await loadSubjects(selectedPostId);

      const created = res?.subject;
      if (created?._id) {
        setSelectedSubjectId(String(created._id));
      }
    } catch (err) {
      setSubjectErr(getApiErrorMessage(err));
    } finally {
      setCreatingSubject(false);
    }
  }

  async function handleCreateTopic(e) {
    e.preventDefault();
    if (creatingTopic) return;
    setTopicMsg('');
    setTopicErr('');

    if (!selectedSubjectId) {
      setTopicErr('Please select a subject first.');
      return;
    }
    const name = topicName.trim();
    if (!name) {
      setTopicErr('Topic name is required.');
      return;
    }
    if (name.length < 2) {
      setTopicErr('Topic name must be at least 2 characters.');
      return;
    }

    const orderValue = parseOrder(topicOrder);
    if (orderValue === 'invalid') {
      setTopicErr('Order must be a non-negative whole number.');
      return;
    }

    try {
      setCreatingTopic(true);
      await createTopic({
        name,
        subjectId: selectedSubjectId,
        ...(orderValue !== undefined ? { order: orderValue } : {}),
      });
      setTopicMsg(`Topic "${name}" created.`);
      setTopicName('');
      setTopicOrder('');
      await loadTopics(selectedSubjectId);
    } catch (err) {
      setTopicErr(getApiErrorMessage(err));
    } finally {
      setCreatingTopic(false);
    }
  }

  async function handleToggleSubject(subject) {
    if (!subject?._id || togglingSubjectId) return;
    const id = String(subject._id);
    const nextActive = !(subject.isActive !== false);

    // Disabling is the destructive direction — confirm BEFORE any state
    // mutation or network call so a cancel leaves everything untouched.
    // Enabling is unguarded (restoring is safe).
    if (!nextActive && !confirmDisable('subject', subject.name)) {
      return;
    }

    setSubjectMsg('');
    setSubjectErr('');
    // Optimistic update so the badge flips immediately; we reconcile with
    // the server response (or roll back on error).
    setSubjects((prev) =>
      prev.map((s) => (String(s._id) === id ? { ...s, isActive: nextActive } : s))
    );
    try {
      setTogglingSubjectId(id);
      const res = await updateSubject(id, { isActive: nextActive });
      const updated = res?.subject;
      if (updated?._id) {
        setSubjects((prev) =>
          prev.map((s) => (String(s._id) === id ? { ...s, ...updated } : s))
        );
      }
      setSubjectMsg(
        `Subject "${subject.name}" ${nextActive ? 'enabled' : 'disabled'}.`
      );
    } catch (err) {
      // Roll back the optimistic flip.
      setSubjects((prev) =>
        prev.map((s) =>
          String(s._id) === id ? { ...s, isActive: !nextActive } : s
        )
      );
      setSubjectErr(getApiErrorMessage(err));
    } finally {
      setTogglingSubjectId('');
    }
  }

  async function handleToggleTopic(topic) {
    if (!topic?._id || togglingTopicId) return;
    const id = String(topic._id);
    const nextActive = !(topic.isActive !== false);

    if (!nextActive && !confirmDisable('topic', topic.name)) {
      return;
    }

    setTopicMsg('');
    setTopicErr('');
    setTopics((prev) =>
      prev.map((t) => (String(t._id) === id ? { ...t, isActive: nextActive } : t))
    );
    try {
      setTogglingTopicId(id);
      const res = await updateTopic(id, { isActive: nextActive });
      const updated = res?.topic;
      if (updated?._id) {
        setTopics((prev) =>
          prev.map((t) => (String(t._id) === id ? { ...t, ...updated } : t))
        );
      }
      setTopicMsg(
        `Topic "${topic.name}" ${nextActive ? 'enabled' : 'disabled'}.`
      );
    } catch (err) {
      setTopics((prev) =>
        prev.map((t) =>
          String(t._id) === id ? { ...t, isActive: !nextActive } : t
        )
      );
      setTopicErr(getApiErrorMessage(err));
    } finally {
      setTogglingTopicId('');
    }
  }

  const noPosts = !loadingPosts && !postsError && posts.length === 0;

  return (
    <div>
      <h1 className="page-title">Subjects & Topics</h1>
      <p className="page-subtitle">
        Hierarchy: <strong>Post → Subject → Topic → Question</strong>. Pick a
        post to create subjects under it, then add topics.
      </p>

      {/* ---------------- Create Post ---------------- */}
      <section className="card form">
        <h2 className="section-heading">Create Post</h2>
        <p className="helper">
          Posts are the top level of the hierarchy (e.g. <em>JE</em>,{' '}
          <em>Patwari</em>). Create one, then add subjects under it below.
        </p>

        {postMsg ? <div className="alert alert-success">{postMsg}</div> : null}
        {postErr ? <div className="alert alert-error">{postErr}</div> : null}

        <form onSubmit={handleCreatePost} className="inline-form">
          <input
            type="text"
            className="input"
            placeholder="Post name (e.g. JKSSB JE)"
            value={postName}
            onChange={(e) => setPostName(e.target.value)}
            disabled={creatingPost}
            maxLength={100}
          />
          <input
            type="text"
            className="input"
            placeholder="Description (optional)"
            value={postDescription}
            onChange={(e) => setPostDescription(e.target.value)}
            disabled={creatingPost}
            maxLength={500}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={creatingPost || !postName.trim()}
          >
            {creatingPost ? 'Creating…' : 'Create Post'}
          </button>
        </form>
      </section>

      {/* ---------------- Select Post ---------------- */}
      <section className="card form">
        <h2 className="section-heading">Select Post</h2>

        {postsError ? <div className="alert alert-error">{postsError}</div> : null}
        {noPosts ? (
          <div className="alert alert-error">
            No posts yet. Create one above — subjects cannot exist without a
            parent post.
          </div>
        ) : null}

        <div className="form-row">
          <label className="label" htmlFor="post-select">
            Post *
          </label>
          <select
            id="post-select"
            className="input"
            value={selectedPostId}
            onChange={(e) => setSelectedPostId(e.target.value)}
            disabled={loadingPosts || noPosts}
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
          {selectedPost ? (
            <p className="helper">
              Working under <strong>{selectedPost.name}</strong>
              {selectedPost.slug ? ` (${selectedPost.slug})` : ''}.
            </p>
          ) : null}
        </div>
      </section>

      {/* ---------------- Create Subject ---------------- */}
      <section className="card form">
        <h2 className="section-heading">Create Subject</h2>

        {!selectedPostId ? (
          <p className="helper">Select a post above to enable subject creation.</p>
        ) : null}

        {subjectMsg ? <div className="alert alert-success">{subjectMsg}</div> : null}
        {subjectErr ? <div className="alert alert-error">{subjectErr}</div> : null}

        <form onSubmit={handleCreateSubject} className="inline-form">
          <input
            type="text"
            className="input"
            placeholder={
              selectedPost
                ? `New subject under "${selectedPost.name}"`
                : 'Select a post first'
            }
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            disabled={!selectedPostId || creatingSubject}
            maxLength={100}
          />
          <input
            type="number"
            min="0"
            step="1"
            className="input input-order"
            placeholder="Order"
            title="Display order (optional, lower appears first). Leave blank for 0."
            value={subjectOrder}
            onChange={(e) => setSubjectOrder(e.target.value)}
            disabled={!selectedPostId || creatingSubject}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!selectedPostId || creatingSubject || !subjectName.trim()}
          >
            {creatingSubject ? 'Creating…' : 'Create Subject'}
          </button>
        </form>
        <p className="helper">
          <strong>Order</strong> is optional — lower numbers appear first.
          Leave blank for <code>0</code>.
        </p>

        <div className="subjects-list">
          <h3 className="list-heading">
            {selectedPost ? `Subjects in "${selectedPost.name}"` : 'Subjects'}
          </h3>
          {!selectedPostId ? (
            <p className="muted">Select a post to view its subjects.</p>
          ) : loadingSubjects ? (
            <p className="muted">Loading subjects…</p>
          ) : subjectsError ? (
            <div className="alert alert-error">{subjectsError}</div>
          ) : subjects.length === 0 ? (
            <p className="muted">No subjects yet for this post. Create one above.</p>
          ) : (
            <ul className="row-list">
              {subjects.map((s) => {
                const isSelected = String(s._id) === String(selectedSubjectId);
                const isActive = s.isActive !== false; // treat missing as active
                const busy = togglingSubjectId === String(s._id);
                return (
                  <li
                    key={s._id}
                    className={`row-item ${isSelected ? 'row-item-selected' : ''} ${
                      isActive ? '' : 'row-item-inactive'
                    }`}
                  >
                    <button
                      type="button"
                      className="row-main"
                      onClick={() => setSelectedSubjectId(String(s._id))}
                      title="Select to manage topics"
                    >
                      <span className="row-order">#{s.order ?? 0}</span>
                      <span className="row-name">{s.name}</span>
                      <span
                        className={`status-badge ${
                          isActive ? 'status-active' : 'status-inactive'
                        }`}
                      >
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`btn btn-small ${
                        isActive ? 'btn-ghost' : 'btn-primary'
                      }`}
                      onClick={() => handleToggleSubject(s)}
                      disabled={busy}
                      title={
                        isActive
                          ? 'Disable — hides this subject from users'
                          : 'Enable — makes this subject visible again'
                      }
                    >
                      {busy
                        ? '…'
                        : isActive
                        ? 'Disable'
                        : 'Enable'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ---------------- Create Topic ---------------- */}
      <section className="card form">
        <h2 className="section-heading">Create Topic</h2>

        <div className="form-row">
          <label className="label" htmlFor="topic-subject">
            Subject *
          </label>
          <select
            id="topic-subject"
            className="input"
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
            disabled={loadingSubjects || subjects.length === 0}
          >
            <option value="">
              {!selectedPostId
                ? '— Select a post first —'
                : loadingSubjects
                ? 'Loading subjects…'
                : subjects.length === 0
                ? 'No subjects yet for this post'
                : '— Select subject —'}
            </option>
            {subjects.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {topicMsg ? <div className="alert alert-success">{topicMsg}</div> : null}
        {topicErr ? <div className="alert alert-error">{topicErr}</div> : null}

        <form onSubmit={handleCreateTopic} className="inline-form">
          <input
            type="text"
            className="input"
            placeholder={
              selectedSubject
                ? `New topic under "${selectedSubject.name}"`
                : 'Select a subject first'
            }
            value={topicName}
            onChange={(e) => setTopicName(e.target.value)}
            disabled={!selectedSubjectId || creatingTopic}
            maxLength={100}
          />
          <input
            type="number"
            min="0"
            step="1"
            className="input input-order"
            placeholder="Order"
            title="Display order (optional, lower appears first). Leave blank for 0."
            value={topicOrder}
            onChange={(e) => setTopicOrder(e.target.value)}
            disabled={!selectedSubjectId || creatingTopic}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!selectedSubjectId || creatingTopic || !topicName.trim()}
          >
            {creatingTopic ? 'Creating…' : 'Create Topic'}
          </button>
        </form>
        <p className="helper">
          <strong>Order</strong> is optional — lower numbers appear first.
          Leave blank for <code>0</code>.
        </p>

        <div className="topics-list">
          <h3 className="list-heading">
            {selectedSubject
              ? `Topics under "${selectedSubject.name}"`
              : 'Topics'}
          </h3>
          {!selectedSubjectId ? (
            <p className="muted">Select a subject to view its topics.</p>
          ) : loadingTopics ? (
            <p className="muted">Loading topics…</p>
          ) : topicsError ? (
            <div className="alert alert-error">{topicsError}</div>
          ) : topics.length === 0 ? (
            <p className="muted">No topics yet for this subject.</p>
          ) : (
            <ul className="row-list">
              {topics.map((t) => {
                const isActive = t.isActive !== false;
                const busy = togglingTopicId === String(t._id);
                return (
                  <li
                    key={t._id}
                    className={`row-item ${isActive ? '' : 'row-item-inactive'}`}
                  >
                    <div className="row-main row-main-static">
                      <span className="row-order">#{t.order ?? 0}</span>
                      <span className="row-name">{t.name}</span>
                      <span
                        className={`status-badge ${
                          isActive ? 'status-active' : 'status-inactive'
                        }`}
                      >
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`btn btn-small ${
                        isActive ? 'btn-ghost' : 'btn-primary'
                      }`}
                      onClick={() => handleToggleTopic(t)}
                      disabled={busy}
                      title={
                        isActive
                          ? 'Disable — hides this topic from users'
                          : 'Enable — makes this topic visible again'
                      }
                    >
                      {busy ? '…' : isActive ? 'Disable' : 'Enable'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
