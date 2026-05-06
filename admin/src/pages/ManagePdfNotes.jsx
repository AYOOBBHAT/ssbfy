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

/** Ids the PDF is attached to (new `postIds` or legacy `postId`). */
function effectivePostIdList(pdf) {
  if (Array.isArray(pdf?.postIds) && pdf.postIds.length > 0) {
    return pdf.postIds.map((id) => String(id));
  }
  if (pdf?.postId) return [String(pdf.postId)];
  return [];
}

function postNamesForPdf(pdf, postsById) {
  return effectivePostIdList(pdf).map((id) => {
    const p = postsById.get(id);
    return p?.name || p?.slug || id;
  });
}

/**
 * Admin UI for uploaded PDF notes.
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

  const [editPdf, setEditPdf] = useState(null);
  const [editPostIds, setEditPostIds] = useState([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editErr, setEditErr] = useState('');

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

  const selectablePosts = useMemo(
    () => posts.filter((p) => p && p.isActive !== false),
    [posts]
  );

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

  function handleClearFilters() {
    setFilterPostId('');
  }

  function openEdit(pdf) {
    setEditErr('');
    setEditPdf(pdf);
    setEditPostIds(effectivePostIdList(pdf));
  }

  function closeEdit() {
    if (editSubmitting) return;
    setEditPdf(null);
    setEditPostIds([]);
    setEditErr('');
  }

  function toggleEditPost(id) {
    const sid = String(id);
    setEditPostIds((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]
    );
  }

  async function saveEdit() {
    if (!editPdf?._id) return;
    if (!editPostIds.length) {
      setEditErr('Select at least one post.');
      return;
    }
    setEditSubmitting(true);
    setEditErr('');
    try {
      const res = await updatePdfNote(editPdf._id, { postIds: editPostIds });
      const updated = res?.pdf || res;
      if (updated && updated._id) {
        setPdfs((prev) =>
          prev.map((p) =>
            String(p._id) === String(updated._id) ? { ...p, ...updated } : p
          )
        );
      }
      closeEdit();
    } catch (e) {
      setEditErr(getApiErrorMessage(e));
    } finally {
      setEditSubmitting(false);
    }
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

  const hasActiveFilters = Boolean(filterPostId);

  return (
    <div>
      <h1 className="page-title">Manage PDF Notes</h1>
      <p className="page-subtitle">
        Review uploaded PDFs, which posts they apply to, and enable/disable
        individual files. Students only see active PDFs.
      </p>

      {refError ? <div className="alert alert-error">{refError}</div> : null}

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

      {toggleMsg ? (
        <div className="alert alert-success">{toggleMsg}</div>
      ) : null}
      {toggleErr ? (
        <div className="alert alert-error">{toggleErr}</div>
      ) : null}
      {pdfsError ? (
        <div className="alert alert-error">{pdfsError}</div>
      ) : null}

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
              const names = postNamesForPdf(pdf, postsById);
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
                      <strong>Attached posts:</strong>{' '}
                      {names.length ? names.join(', ') : '—'}
                    </div>
                    <div className="helper" style={{ opacity: 0.9 }}>
                      {formatSize(pdf.fileSize)} · {formatDate(pdf.createdAt)}
                    </div>
                    {pdf.signedUrl ? (
                      <a
                        href={pdf.signedUrl}
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

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      gap: 6,
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => openEdit(pdf)}
                    >
                      Edit posts
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => handleToggle(pdf)}
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
      </div>

      {editPdf ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-pdf-posts-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={closeEdit}
        >
          <div
            className="card form"
            style={{ maxWidth: 440, width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="edit-pdf-posts-title" className="page-title" style={{ fontSize: 18 }}>
              Applicable posts
            </h2>
            <p className="helper" style={{ marginTop: 0 }}>
              {editPdf.title || 'PDF'}
            </p>
            {editErr ? <div className="alert alert-error">{editErr}</div> : null}
            <div
              className="card"
              style={{
                maxHeight: 220,
                overflowY: 'auto',
                padding: 12,
                border: '1px solid var(--border)',
                marginBottom: 12,
              }}
            >
              {selectablePosts.length === 0 ? (
                <p className="helper">No active posts available.</p>
              ) : (
                selectablePosts.map((p) => {
                  const id = String(p._id);
                  const checked = editPostIds.includes(id);
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
                        onChange={() => toggleEditPost(id)}
                        disabled={editSubmitting}
                      />
                      <span>{p.name || p.slug || id}</span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeEdit}
                disabled={editSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveEdit}
                disabled={editSubmitting}
              >
                {editSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
