import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiErrorMessage, listTestsAdmin, setTestStatus } from '../services/api';

function asArray(res, key) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res[key])) return res[key];
  return [];
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TYPE_LABELS = {
  subject: 'Subject',
  post: 'Full syllabus',
  topic: 'Topic',
  mixed: 'Mixed',
};

/**
 * Manage mock tests — soft disable only (no hard delete).
 *
 * Manual QA:
 * - Disable active test → hidden from new student catalog; historical attempts intact.
 * - Re-enable → appears in catalog again.
 * - User mid-attempt when disabled → can resume/submit; not forced out.
 * - Profile historical review + retry still work (snapshot-backed).
 */
export default function ManageTests() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [togglingId, setTogglingId] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await listTestsAdmin();
      setTests(asArray(res, 'tests'));
    } catch (e) {
      setError(getApiErrorMessage(e));
      setTests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return tests;
    return tests.filter((t) => (t.status || 'active') === statusFilter);
  }, [tests, statusFilter]);

  const requestToggle = (test, nextStatus) => {
    const title = test?.title || 'Untitled test';
    if (nextStatus === 'disabled') {
      setConfirm({
        test,
        nextStatus,
        title: 'Disable mock test?',
        body: `Disable "${title}"? It will be hidden from new students starting this mock. Existing attempts and historical reviews will remain accessible. Users with an in-progress attempt can still finish.`,
        danger: true,
      });
      return;
    }
    setConfirm({
      test,
      nextStatus,
      title: 'Enable mock test?',
      body: `Re-enable "${title}" for new attempts?`,
      danger: false,
    });
  };

  const applyToggle = async () => {
    if (!confirm?.test?._id) return;
    const id = String(confirm.test._id);
    const nextStatus = confirm.nextStatus;
    setConfirm(null);
    setTogglingId(id);
    setMsg('');
    setErr('');
    try {
      await setTestStatus(id, nextStatus);
      setMsg(nextStatus === 'disabled' ? 'Test disabled.' : 'Test enabled.');
      await load();
    } catch (e) {
      setErr(getApiErrorMessage(e));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      <div className="page-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <h1 className="page-title">Manage Tests</h1>
          <p className="page-subtitle">
            Soft-disable mock tests without deleting attempts, scores, or historical reviews.
          </p>
        </div>
        <Link to="/create-test" className="btn btn-primary">
          Create test
        </Link>
      </div>

      {msg ? <div className="alert alert-success">{msg}</div> : null}
      {err ? <div className="alert alert-error">{err}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="toolbar-row">
        <label className="field-inline">
          <span className="field-label">Status</span>
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            disabled={loading}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading ? <p className="muted">Loading tests…</p> : null}

      {!loading && !error && filtered.length === 0 ? (
        <p className="muted">No tests match this filter.</p>
      ) : null}

      {!loading && filtered.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Questions</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Updated</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const id = String(t._id);
                const active = (t.status || 'active') === 'active';
                const qCount = Array.isArray(t.questionIds) ? t.questionIds.length : 0;
                const busy = togglingId === id;
                return (
                  <tr key={id}>
                    <td>
                      <div className="cell-title">{t.title || '—'}</div>
                      {qCount === 0 ? (
                        <div className="cell-hint warn">No active questions</div>
                      ) : null}
                    </td>
                    <td>{TYPE_LABELS[t.type] || t.type || '—'}</td>
                    <td>{qCount}</td>
                    <td>{t.duration ? `${t.duration} min` : '—'}</td>
                    <td>
                      <span className={active ? 'badge badge-active' : 'badge badge-muted'}>
                        {active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="nowrap">{formatDate(t.disabledAt || t.updatedAt)}</td>
                    <td className="actions-cell">
                      <button
                        type="button"
                        className={`btn btn-sm ${active ? 'btn-danger' : 'btn-secondary'}`}
                        disabled={busy}
                        onClick={() => requestToggle(t, active ? 'disabled' : 'active')}
                      >
                        {busy ? '…' : active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {confirm ? (
        <div className="modal-overlay" role="presentation">
          <div className="modal" role="dialog" aria-modal="true">
            <h3>{confirm.title}</h3>
            <p className="helper">{confirm.body}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${confirm.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => void applyToggle()}
              >
                {confirm.nextStatus === 'disabled' ? 'Disable test' : 'Enable test'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
