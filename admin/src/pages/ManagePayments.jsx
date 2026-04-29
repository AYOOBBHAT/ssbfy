import { useCallback, useEffect, useState } from 'react';
import {
  getApiErrorMessage,
  listAdminPayments,
  reconcileAdminPayment,
} from '../services/api';

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

function yesNo(v) {
  return v ? 'Yes' : 'No';
}

/**
 * Support-focused view of Payment rows: status, webhook path, premium flag, reconcile.
 */
export default function ManagePayments() {
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [hydrationOnly, setHydrationOnly] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({ payments: [], pagination: {} });

  const [reconcileOrderId, setReconcileOrderId] = useState('');
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [reconcileMsg, setReconcileMsg] = useState('');
  const [reconcileErr, setReconcileErr] = useState('');

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const params = { page, pageSize: 25 };
      if (userId.trim()) params.userId = userId.trim();
      if (paymentStatus.trim()) params.paymentStatus = paymentStatus.trim();
      if (hydrationOnly) params.hydrationIssue = 'true';
      const res = await listAdminPayments(params);
      setData({
        payments: Array.isArray(res?.payments) ? res.payments : [],
        pagination: res?.pagination || {},
      });
    } catch (e) {
      setError(getApiErrorMessage(e));
      setData({ payments: [], pagination: {} });
    } finally {
      setLoading(false);
    }
  }, [page, userId, paymentStatus, hydrationOnly]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReconcile(e) {
    e.preventDefault();
    const oid = reconcileOrderId.trim();
    if (!oid) return;
    setReconcileBusy(true);
    setReconcileErr('');
    setReconcileMsg('');
    try {
      const out = await reconcileAdminPayment(oid);
      if (out?.ok) {
        setReconcileMsg(
          out.idempotent
            ? 'Order was already reconciled (idempotent).'
            : 'Reconciliation ran successfully.'
        );
      } else {
        setReconcileMsg(
          'No captured/authorized payment found for this order in Razorpay (user may have abandoned checkout).'
        );
      }
      setReconcileOrderId('');
      await load();
    } catch (err) {
      setReconcileErr(getApiErrorMessage(err));
    } finally {
      setReconcileBusy(false);
    }
  }

  const { pagination } = data;
  const totalPages = pagination.totalPages ?? 0;

  return (
    <div>
      <h1 className="page-title">Payments</h1>
      <p className="page-subtitle">
        Razorpay orders, webhook verification, and premium activation. Use reconcile only for
        stuck paid orders (safe, idempotent).
      </p>

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <h3 className="card-title">Manual reconcile</h3>
        <p className="card-desc" style={{ marginBottom: '0.75rem' }}>
          Enter a Razorpay order id (e.g. order_xxx). Re-fetches capture state and runs the same
          activation path as webhooks — no double-stacking.
        </p>
        <form onSubmit={handleReconcile} className="form-row" style={{ gap: '0.75rem' }}>
          <input
            type="text"
            className="input"
            placeholder="order_xxxxxxxxxxxxx"
            value={reconcileOrderId}
            onChange={(ev) => setReconcileOrderId(ev.target.value)}
            style={{ flex: 1, minWidth: '200px' }}
          />
          <button type="submit" className="btn btn-primary" disabled={reconcileBusy}>
            {reconcileBusy ? 'Working…' : 'Reconcile order'}
          </button>
        </form>
        {reconcileMsg ? (
          <p className="form-hint" style={{ marginTop: '0.5rem', color: 'var(--muted, #64748b)' }}>
            {reconcileMsg}
          </p>
        ) : null}
        {reconcileErr ? (
          <p className="form-error" style={{ marginTop: '0.5rem' }}>
            {reconcileErr}
          </p>
        ) : null}
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h3 className="card-title">Filters</h3>
        <div
          className="form-row"
          style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}
        >
          <label className="form-field" style={{ minWidth: '200px' }}>
            <span>User id</span>
            <input
              type="text"
              className="input"
              value={userId}
              onChange={(ev) => {
                setUserId(ev.target.value);
                setPage(1);
              }}
              placeholder="Mongo ObjectId"
            />
          </label>
          <label className="form-field" style={{ minWidth: '140px' }}>
            <span>Payment status</span>
            <select
              className="input"
              value={paymentStatus}
              onChange={(ev) => {
                setPaymentStatus(ev.target.value);
                setPage(1);
              }}
            >
              <option value="">Any</option>
              <option value="pending">pending</option>
              <option value="paid">paid</option>
              <option value="failed">failed</option>
              <option value="expired">expired</option>
              <option value="captured">captured (legacy)</option>
              <option value="authorized">authorized (legacy)</option>
            </select>
          </label>
          <label
            className="form-field"
            style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}
          >
            <input
              type="checkbox"
              checked={hydrationOnly}
              onChange={(ev) => {
                setHydrationOnly(ev.target.checked);
                setPage(1);
              }}
            />
            <span>Stuck timed plans only</span>
          </label>
          <button type="button" className="btn btn-secondary" onClick={() => load()}>
            Refresh
          </button>
        </div>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p>Loading…</p> : null}

      {!loading && !error ? (
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Order</th>
                <th>Payment</th>
                <th>User</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Webhook?</th>
                <th>Source</th>
                <th>Premium?</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '1.5rem' }}>
                    No payments match.
                  </td>
                </tr>
              ) : (
                data.payments.map((p) => (
                  <tr key={String(p._id)}>
                    <td>{formatDate(p.createdAt)}</td>
                    <td>
                      <code style={{ fontSize: '0.8rem' }}>{p.razorpay_order_id || '—'}</code>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.8rem' }}>{p.razorpay_payment_id || '—'}</code>
                    </td>
                    <td>
                      {p.user?.email || p.user?.name || '—'}
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                        {p.userId ? String(p.userId) : ''}
                      </div>
                    </td>
                    <td>{p.planType || '—'}</td>
                    <td>{p.paymentStatus || p.status || '—'}</td>
                    <td>{yesNo(p.verifiedByWebhook)}</td>
                    <td>{p.verificationSource ?? '—'}</td>
                    <td>{yesNo(p.premiumActivated)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {totalPages > 1 ? (
        <div className="form-row" style={{ marginTop: '1rem', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((x) => Math.max(1, x - 1))}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages} ({pagination.total ?? 0} total)
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((x) => x + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
