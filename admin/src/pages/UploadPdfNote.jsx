import { useEffect, useRef, useState } from 'react';
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
 * Fields are minimal on purpose: title + post + file. The backend stores
 * the file in Cloudinary and persists only metadata, so this form maps
 * one-to-one with `POST /api/notes/upload-pdf`.
 */
export default function UploadPdfNote() {
  const [title, setTitle] = useState('');
  const [postId, setPostId] = useState('');
  const [file, setFile] = useState(null);

  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [metaError, setMetaError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Used to reset the native <input type="file"> which is uncontrolled.
  const fileInputRef = useRef(null);

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
    setPostId('');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function validate() {
    if (!title.trim()) return 'Title is required.';
    if (title.trim().length < 2) {
      return 'Title must be at least 2 characters.';
    }
    if (!postId) return 'Please select a post.';
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
        postId,
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
        Upload a PDF resource scoped to a post. Files are stored on
        Cloudinary and served over HTTPS.
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
            placeholder="e.g. Patwari Syllabus 2025"
            disabled={submitting}
            maxLength={200}
          />
        </div>

        <div className="form-row">
          <label className="label" htmlFor="pdf-post">
            Post *
          </label>
          <select
            id="pdf-post"
            className="input"
            value={postId}
            onChange={(e) => setPostId(e.target.value)}
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
            <p className="helper">
              PDF only. Max {MAX_SIZE_MB} MB.
            </p>
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
