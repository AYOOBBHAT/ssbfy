import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getApiErrorMessage,
  getPdfNotes,
  getPosts,
  updatePdfNote,
} from '../services/api';

function asArray(res, key) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res[key])) return res[key];
  return [];
}

/** Consistent disable prompt — matches the Notes page wording. */
function confirmDisable(title) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true;
  }
  return window.confirm(
    `Disable "${title}"? Students will no longer see this PDF.`
  );
}

function formatSize(bytes) {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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

/**
 * Admin UI for uploaded PDF notes.
 *
 * - Loads posts once for both the filter dropdown and the per-row label.
 * - Fetches PDFs with `includeInactive=true` so disabled uploads stay
 *   visible to admins (the server gates this on role).
 * - Enable/Disable is optimistic with rollback, mirroring ManageNotes.
 */
export default function ManagePdfNotes() {
  const [filterPostId, setFilterPostId] = useState('');

  const [posts, setPosts] = useState([]);
  const [refLoading, setRefLoading] = useState(true);
  const [refError, setRefError] = useState('');

  const [pdfs, setPdfs] = useState([]);
  const [pdfsLoading, setPdfsLoading] = useState(true);
  const [pdfsError, setPdfsError] = useState('');

  const [togglingId, setTogglingId] = useState(null);
  const [toggleMsg, setToggleMsg] = useState('');
  const [toggleErr, setToggleErr] = useState('');

  // ---- Load posts once -------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setRefLoading(true);
        setRefError('');
        const res = await getPosts();
        if (cancelled) return;
        setPosts(asArray(res, 'posts'));
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

  const postsById = useMemo(() => {
    const m = new Map();
    for (const p of posts) m.set(String(p._id), p);
    return m;
  }, [posts]);

  // ---- Load PDFs whenever the filter changes --------------------------
  const loadPdfs = useCallback(async () => {
    setPdfsError('');
    setPdfsLoading(true);
    try {
      const params = { includeInactive: true };
      if (filterPostId) params.postId = filterPostId;
      const res = await getPdfNotes(params);
      setPdfs(asArray(res, 'pdfs'));
    } catch (e) {
      setPdfsError(getApiErrorMessage(e));
      setPdfs([]);
    } finally {
      setPdfsLoading(false);
    }
  }, [filterPostId]);

  useEffect(() => {
    loadPdfs();
  }, [loadPdfs]);

  // ---- Handlers -------------------------------------------------------
  function handleClearFilters() {
    setFilterPostId('');
  }

  async function handleToggle(pdf) {
    if (togglingId) return;
    const nextActive = !pdf.isActive;
    if (!nextActive && !confirmDisable(pdf.title || 'this PDF')) return;

    setToggleErr('');
    setToggleMsg('');
    setTogglingId(pdf._id);

    setPdfs((prev) =>
      prev.map((p) =>
        String(p._id) === String(pdf._id) ? { ...p, isActive: nextActive } : p
      )
    );

    try {
      const res = await updatePdfNote(pdf._id, { isActive: nextActive });
      const updated = res?.pdf || res;
      if (updated && updated._id) {
        setPdfs((prev) =>
          prev.map((p) =>
            String(p._id) === String(updated._id) ? { ...p, ...updated } : p
          )
        );
      }
      setToggleMsg(nextActive ? 'PDF enabled.' : 'PDF disabled.');
    } catch (e) {
      setPdfs((prev) =>
        prev.map((p) =>
          String(p._id) === String(pdf._id)
            ? { ...p, isActive: !nextActive }
            : p
        )
      );
      setToggleErr(getApiErrorMessage(e));
    } finally {
      setTogglingId(null);
    }
  }

  function postName(id) {
    if (!id) return '—';
    const p = postsById.get(String(id));
    return p?.name || p?.slug || '—';
  }

  const hasActiveFilters = Boolean(filterPostId);

  return (
    <div>
      <h1 className="page-title">Manage PDF Notes</h1>
      <p className="page-subtitle">
        Review uploaded PDFs and enable/disable individual files. Students
        only see active PDFs.
      </p>

      {refError ? <div className="alert alert-error">{refError}</div> : null}

      {/* ---------- Filters ---------- */}
      <div className="card form" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="form-row">
            <label className="label" htmlFor="filter-pdf-post">
              Post
            </label>
            <select
              id="filter-pdf-post"
              className="input"
              value={filterPostId}
              onChange={(e) => setFilterPostId(e.target.value)}
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
            onClick={loadPdfs}
            disabled={pdfsLoading}
          >
            {pdfsLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ---------- Feedback ---------- */}
      {toggleMsg ? (
        <div className="alert alert-success">{toggleMsg}</div>
      ) : null}
      {toggleErr ? (
        <div className="alert alert-error">{toggleErr}</div>
      ) : null}
      {pdfsError ? (
        <div className="alert alert-error">{pdfsError}</div>
      ) : null}

      {/* ---------- List ---------- */}
      <div className="card">
        {pdfsLoading ? (
          <p className="helper">Loading PDFs…</p>
        ) : pdfs.length === 0 ? (
          <p className="helper">
            {hasActiveFilters
              ? 'No PDFs match the current filter.'
              : 'No PDFs uploaded yet. Use Upload PDF to add one.'}
          </p>
        ) : (
          <ul className="row-list">
            {pdfs.map((pdf) => {
              const active = pdf.isActive !== false;
              const isToggling = String(togglingId) === String(pdf._id);
              return (
                <li
                  key={pdf._id}
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
                      title={pdf.title}
                      style={{ whiteSpace: 'normal' }}
                    >
                      {pdf.title || pdf.fileName || 'Untitled PDF'}
                    </div>
                    <div className="helper">
                      {postName(pdf.postId)}
                      {' · '}
                      {formatSize(pdf.fileSize)}
                      {' · '}
                      {formatDate(pdf.createdAt)}
                    </div>
                    {pdf.fileUrl ? (
                      <a
                        href={pdf.fileUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="helper"
                        style={{ textDecoration: 'underline' }}
                      >
                        Open PDF
                      </a>
                    ) : null}
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
                    onClick={() => handleToggle(pdf)}
                    disabled={isToggling}
                  >
                    {isToggling ? '…' : active ? 'Disable' : 'Enable'}
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
