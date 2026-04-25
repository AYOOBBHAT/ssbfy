import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getApiErrorMessage,
  getPosts,
  uploadPdfNote,
} from '../services/api';

function asArray(res, key) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res[key])) return res[key];
  return [];
}

/** Accept both mimetype and extension — some browsers drop application/pdf. */
function isPdf(file) {
  if (!file) return false;
  if (file.type === 'application/pdf') return true;
  return /\.pdf$/i.test(file.name || '');
}

function formatSize(bytes) {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const MAX_SIZE_MB = 25;

/**
 * Admin page to upload a PDF note.
 *
 * One upload can be attached to multiple posts (e.g. same PDF for
 * several exams) via `postIds` — no duplicate file uploads.
 */
export default function UploadPdfNote() {
  const [title, setTitle] = useState('');
  /** @type {string[]} */
  const [postIds, setPostIds] = useState([]);
  const [file, setFile] = useState(null);

  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [metaError, setMetaError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef(null);

  const selectablePosts = useMemo(
    () => posts.filter((p) => p && p.isActive !== false),
    [posts]
  );

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

  function togglePost(id) {
    const sid = String(id);
    setPostIds((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]
    );
  }

  function handleFileChange(e) {
    const picked = e.target.files?.[0] || null;
    setErrorMsg('');
    if (!picked) {
      setFile(null);
      return;
    }
    if (!isPdf(picked)) {
      setFile(null);
      setErrorMsg('Only PDF files are allowed.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (picked.size > MAX_SIZE_MB * 1024 * 1024) {
      setFile(null);
      setErrorMsg(`File is larger than ${MAX_SIZE_MB} MB.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(picked);
  }

  function resetForm() {
    setTitle('');
    setPostIds([]);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function validate() {
    if (!title.trim()) return 'Title is required.';
    if (title.trim().length < 2) {
      return 'Title must be at least 2 characters.';
    }
    if (!postIds.length) return 'Select at least one applicable post.';
    if (!file) return 'Please select a PDF file.';
    if (!isPdf(file)) return 'Only PDF files are allowed.';
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
      await uploadPdfNote({
        title: title.trim(),
        postIds,
        file,
      });
      setSuccessMsg('PDF uploaded successfully.');
      resetForm();
    } catch (err) {
      setErrorMsg(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Upload PDF Note</h1>
      <p className="page-subtitle">
        Upload a PDF once and link it to one or more exams. Files are stored
        on Cloudinary and served over HTTPS.
      </p>

      {metaError ? <div className="alert alert-error">{metaError}</div> : null}

      <form className="card form" onSubmit={handleSubmit}>
        {successMsg ? (
          <div className="alert alert-success">{successMsg}</div>
        ) : null}
        {errorMsg ? <div className="alert alert-error">{errorMsg}</div> : null}

        <div className="form-row">
          <label className="label" htmlFor="pdf-title">
            Title *
          </label>
          <input
            id="pdf-title"
            type="text"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Reasoning Master Notes"
            disabled={submitting}
            maxLength={200}
          />
        </div>

        <div className="form-row">
          <span className="label">Applicable posts *</span>
          {loadingPosts ? (
            <p className="helper">Loading posts…</p>
          ) : selectablePosts.length === 0 ? (
            <p className="helper">
              No active posts yet. Create a post in{' '}
              <strong>Subjects &amp; Topics</strong> first.
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
                const checked = postIds.includes(id);
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
                      onChange={() => togglePost(id)}
                      disabled={submitting}
                    />
                    <span>{p.name || p.slug || id}</span>
                  </label>
                );
              })}
            </div>
          )}
          <p className="helper">
            Select all exams that should list this PDF (no duplicate uploads).
          </p>
        </div>

        <div className="form-row">
          <label className="label" htmlFor="pdf-file">
            PDF file *
          </label>
          <input
            id="pdf-file"
            ref={fileInputRef}
            type="file"
            className="input"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
            disabled={submitting}
          />
          {file ? (
            <p className="helper">
              Selected: <strong>{file.name}</strong> ({formatSize(file.size)})
            </p>
          ) : (
            <p className="helper">PDF only. Max {MAX_SIZE_MB} MB.</p>
          )}
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
            {submitting ? 'Uploading…' : 'Upload PDF'}
          </button>
        </div>
      </form>
    </div>
  );
}
