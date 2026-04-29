import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createAdminPlan,
  getApiErrorMessage,
  listAdminPlans,
  moveAdminPlanDown,
  moveAdminPlanUp,
  setAdminPlanStatus,
  updateAdminPlan,
} from '../services/api';

/**
 * Plan types the server accepts. Order here is also the natural sort order
 * used to seed the "first available" type when creating a plan.
 */
const PLAN_TYPES = [
  { value: 'monthly', label: 'Monthly', defaultDuration: '30' },
  { value: 'quarterly', label: 'Quarterly', defaultDuration: '90' },
  { value: 'yearly', label: 'Yearly', defaultDuration: '365' },
  { value: 'lifetime', label: 'Lifetime', defaultDuration: '' },
];

const PLAN_TYPE_LABEL = PLAN_TYPES.reduce((acc, t) => {
  acc[t.value] = t.label;
  return acc;
}, {});

/**
 * Confirm a destructive-ish action with a blocking native dialog. We use
 * `window.confirm` here for the same reason `ManageTopics` and `ManagePdfNotes`
 * do: zero deps, fully accessible, well-suited to infrequent admin actions.
 */
function confirmDisable(name) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true;
  }
  return window.confirm(
    `Disable "${name}"? It will be hidden from new buyers immediately. ` +
      `Existing subscribers and historical payments are NOT affected.`
  );
}

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN')}`;
}

function formatDuration(plan) {
  if (plan?.planType === 'lifetime') return 'Lifetime access';
  const d = Number(plan?.durationDays);
  if (!Number.isFinite(d) || d <= 0) return '—';
  return `${d} day${d === 1 ? '' : 's'}`;
}

/**
 * Admin UI to manage SubscriptionPlan documents.
 *
 * Backend contract (unchanged):
 *   GET    /api/admin/subscription-plans
 *   POST   /api/admin/subscription-plans
 *   PATCH  /api/admin/subscription-plans/:id
 *   PATCH  /api/admin/subscription-plans/:id/status
 *   PATCH  /api/admin/subscription-plans/:id/move-up
 *   PATCH  /api/admin/subscription-plans/:id/move-down
 *
 * The server enforces:
 *   - planType uniqueness (one canonical plan per type)
 *   - planType immutability on edit
 *   - durationDays cross-field rule (required ≠ lifetime; null = lifetime)
 *   - "at least one active plan" invariant — atomic disable + rollback
 *   - no hard delete (status flip only)
 *
 * Disabling a plan does NOT revoke access for users who already paid.
 */
export default function ManageSubscriptionPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null); // _id | 'create' | null
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [actionErr, setActionErr] = useState('');

  // Editor modal state. `editorPlan === null` means "create new". A plan
  // object means "edit this one".
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPlan, setEditorPlan] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const fresh = await listAdminPlans();
      setPlans(fresh);
    } catch (err) {
      setError(getApiErrorMessage(err) || 'Could not load plans.');
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const usedPlanTypes = useMemo(
    () => new Set(plans.map((p) => p.planType)),
    [plans]
  );

  const activeCount = useMemo(
    () => plans.filter((p) => p.isActive).length,
    [plans]
  );

  function openCreate() {
    setActionErr('');
    setActionMsg('');
    setEditorPlan(null);
    setEditorOpen(true);
  }

  function openEdit(plan) {
    setActionErr('');
    setActionMsg('');
    setEditorPlan(plan);
    setEditorOpen(true);
  }

  function closeEditor() {
    if (busyId === 'create' || (editorPlan && busyId === editorPlan._id)) {
      // never close while a save is in flight
      return;
    }
    setEditorOpen(false);
    setEditorPlan(null);
  }

  async function handleSubmit(payload, isEdit) {
    setActionErr('');
    setActionMsg('');
    setBusyId(isEdit ? editorPlan._id : 'create');
    try {
      if (isEdit) {
        await updateAdminPlan(editorPlan._id, payload);
        setActionMsg('Plan updated.');
      } else {
        await createAdminPlan(payload);
        setActionMsg('Plan created.');
      }
      setEditorOpen(false);
      setEditorPlan(null);
      await load({ silent: true });
    } catch (err) {
      // Surface the message inside the modal AND on the page banner so the
      // admin sees it whether they keep the modal open or close it.
      setActionErr(getApiErrorMessage(err) || 'Save failed.');
      throw err;
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(plan) {
    if (busyId) return;
    const next = !plan.isActive;

    // Pre-flight invariant. The server is the source of truth (it enforces
    // this atomically with rollback), but a client-side check spares the
    // admin a 409 round-trip when the answer is obvious.
    if (!next) {
      const otherActive = plans.filter(
        (p) => p._id !== plan._id && p.isActive
      ).length;
      if (otherActive === 0) {
        setActionErr(
          'Cannot disable the last active plan. Activate another plan ' +
            'first so the Premium screen always has at least one option.'
        );
        setActionMsg('');
        return;
      }
      if (!confirmDisable(plan.name || 'this plan')) return;
    }

    setActionErr('');
    setActionMsg('');
    setBusyId(plan._id);
    try {
      await setAdminPlanStatus(plan._id, next);
      setActionMsg(next ? 'Plan enabled.' : 'Plan disabled.');
      await load({ silent: true });
    } catch (err) {
      setActionErr(getApiErrorMessage(err) || 'Could not update plan status.');
    } finally {
      setBusyId(null);
    }
  }

  async function move(plan, direction) {
    if (busyId) return;
    setActionErr('');
    setActionMsg('');
    setBusyId(plan._id);
    try {
      if (direction === 'up') {
        await moveAdminPlanUp(plan._id);
      } else {
        await moveAdminPlanDown(plan._id);
      }
      await load({ silent: true });
    } catch (err) {
      setActionErr(getApiErrorMessage(err) || 'Could not reorder plan.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="page-title">Manage Subscription Plans</h1>
      <p className="page-subtitle">
        Create, edit, disable, and reorder the plans shown on the Premium
        screen. Plans are never deleted — disabling hides them from new
        buyers but never affects existing subscribers or past payments.
      </p>

      <div className="card form" style={{ marginBottom: 16 }}>
        <div className="picker-header">
          <div>
            <div className="section-heading">Plans</div>
            <p className="helper" style={{ marginTop: 4 }}>
              {plans.length} total · {activeCount} active
            </p>
          </div>
          <div className="picker-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setRefreshing(true);
                load({ silent: false });
              }}
              disabled={refreshing || loading}
            >
              {refreshing || loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={openCreate}
              disabled={!!busyId}
            >
              + New Plan
            </button>
          </div>
        </div>
      </div>

      {actionMsg ? <div className="alert alert-success">{actionMsg}</div> : null}
      {actionErr ? <div className="alert alert-error">{actionErr}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        {loading ? (
          <p className="helper">Loading plans…</p>
        ) : plans.length === 0 ? (
          <p className="helper">
            No plans yet. Click <strong>+ New Plan</strong> to create your
            first one. Until at least one active plan exists, the Premium
            screen will show no purchase options.
          </p>
        ) : (
          <ul className="row-list">
            {plans.map((plan, index) => {
              const active = !!plan.isActive;
              const busy = String(busyId) === String(plan._id);
              const isFirst = index === 0;
              const isLast = index === plans.length - 1;
              return (
                <li
                  key={plan._id}
                  className={`row-item${active ? '' : ' row-item-inactive'}`}
                >
                  <div
                    className="row-main row-main-static"
                    style={{
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 4,
                    }}
                  >
                    <div
                      className="row-name"
                      title={plan.name}
                      style={{ whiteSpace: 'normal' }}
                    >
                      <span className="chip-order">#{plan.displayOrder}</span>
                      {plan.name}
                    </div>
                    <div className="helper">
                      <strong>{PLAN_TYPE_LABEL[plan.planType] || plan.planType}</strong>
                      {' · '}
                      {formatPrice(plan.priceInr)} · {formatDuration(plan)}
                    </div>
                    {plan.description ? (
                      <div className="helper" style={{ opacity: 0.9 }}>
                        {plan.description}
                      </div>
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
                      minWidth: 96,
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => openEdit(plan)}
                      disabled={busy}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => toggleActive(plan)}
                      disabled={busy}
                    >
                      {busy ? '…' : active ? 'Disable' : 'Enable'}
                    </button>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => move(plan, 'up')}
                        disabled={busy || isFirst}
                        title="Move up"
                        style={{ flex: 1 }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => move(plan, 'down')}
                        disabled={busy || isLast}
                        title="Move down"
                        style={{ flex: 1 }}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="helper" style={{ marginTop: 16, lineHeight: 1.5 }}>
        Editing price or duration only applies to <strong>new</strong> orders.
        Historical payments use the price snapshot stored at purchase time, so
        existing subscribers are never billed differently or expired early.
      </p>

      {editorOpen ? (
        <PlanEditorModal
          plan={editorPlan}
          usedPlanTypes={usedPlanTypes}
          isLastActive={
            !!editorPlan && editorPlan.isActive === true && activeCount === 1
          }
          submitting={
            busyId === 'create' || (editorPlan && busyId === editorPlan._id)
          }
          onClose={closeEditor}
          onSubmit={handleSubmit}
        />
      ) : null}
    </div>
  );
}

/**
 * Modal-style editor for both Create and Edit. Renders a backdrop +
 * a card centered on top of it. Closes on backdrop click and on Cancel,
 * but never while a save is in flight (parent guards `busyId`).
 */
function PlanEditorModal({
  plan,
  usedPlanTypes,
  isLastActive,
  submitting,
  onClose,
  onSubmit,
}) {
  const isEdit = !!plan;

  // Seed the form once per "open" — the parent unmounts/re-mounts on toggle
  // so a single useState initializer is enough.
  const initial = (() => {
    if (plan) {
      return {
        name: plan.name || '',
        planType: plan.planType,
        durationDays: plan.durationDays != null ? String(plan.durationDays) : '',
        priceInr: String(plan.priceInr ?? ''),
        displayOrder: String(plan.displayOrder ?? 100),
        description: plan.description || '',
        isActive: !!plan.isActive,
      };
    }
    const firstAvailable =
      PLAN_TYPES.find((t) => !usedPlanTypes.has(t.value)) || PLAN_TYPES[0];
    return {
      name: '',
      planType: firstAvailable.value,
      durationDays: firstAvailable.defaultDuration,
      priceInr: '99',
      displayOrder: '100',
      description: '',
      isActive: true,
    };
  })();

  const [name, setName] = useState(initial.name);
  const [planType, setPlanType] = useState(initial.planType);
  const [durationDays, setDurationDays] = useState(initial.durationDays);
  const [priceInr, setPriceInr] = useState(initial.priceInr);
  const [displayOrder, setDisplayOrder] = useState(initial.displayOrder);
  const [description, setDescription] = useState(initial.description);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [validationError, setValidationError] = useState('');

  const planTypeLocked = isEdit;
  const lifetime = planType === 'lifetime';

  // When the user picks a different planType while creating, auto-seed a
  // sensible duration. Lifetime forces duration to '' (server requires null).
  function handlePickType(value) {
    if (planTypeLocked) return;
    setPlanType(value);
    if (value === 'lifetime') {
      setDurationDays('');
    } else if (!durationDays || durationDays === '') {
      const t = PLAN_TYPES.find((x) => x.value === value);
      setDurationDays(t?.defaultDuration || '30');
    }
  }

  async function handleSubmitInternal(e) {
    e.preventDefault();
    setValidationError('');

    // Pre-flight: refuse to submit `isActive: false` when this is the last
    // active plan. The backend enforces this atomically with rollback —
    // we mirror it here so the admin sees a focused, inline message instead
    // of a generic 409 after a round-trip.
    if (isEdit && isLastActive && !isActive) {
      setValidationError(
        'Cannot disable the last active plan. Activate another plan first ' +
          'so the Premium screen has at least one option.'
      );
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setValidationError('Name is required.');
      return;
    }
    if (trimmedName.length > 80) {
      setValidationError('Name must be 80 characters or less.');
      return;
    }

    const priceN = Number(priceInr);
    if (!Number.isInteger(priceN) || priceN < 1) {
      setValidationError('Price must be a whole rupee amount ≥ 1.');
      return;
    }

    const orderN = Number(displayOrder || 0);
    if (!Number.isInteger(orderN) || orderN < 0 || orderN > 9999) {
      setValidationError('Display order must be an integer between 0 and 9999.');
      return;
    }

    let durationVal = null;
    if (!lifetime) {
      const d = Number(durationDays);
      if (!Number.isInteger(d) || d <= 0) {
        setValidationError(
          'Duration must be a positive whole number of days for non-lifetime plans.'
        );
        return;
      }
      durationVal = d;
    }

    if (description && description.length > 240) {
      setValidationError('Description must be 240 characters or less.');
      return;
    }

    const payload = isEdit
      ? {
          name: trimmedName,
          priceInr: priceN,
          displayOrder: orderN,
          description: description.trim(),
          isActive,
          durationDays: durationVal,
        }
      : {
          name: trimmedName,
          planType,
          priceInr: priceN,
          displayOrder: orderN,
          description: description.trim(),
          isActive,
          durationDays: durationVal,
        };

    try {
      await onSubmit(payload, isEdit);
    } catch (err) {
      // Parent already surfaces the page-level alert; keep the modal open
      // and show the message inline so the admin can correct and retry.
      setValidationError(
        getApiErrorMessage(err) || 'Save failed. Please try again.'
      );
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-editor-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => (submitting ? null : onClose())}
    >
      <form
        className="card form"
        style={{ maxWidth: 540, width: '100%', maxHeight: '92vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmitInternal}
      >
        <h2
          id="plan-editor-title"
          className="page-title"
          style={{ fontSize: 18, marginBottom: 4 }}
        >
          {isEdit ? 'Edit plan' : 'New plan'}
        </h2>
        <p className="page-subtitle" style={{ marginBottom: 16 }}>
          {isEdit
            ? 'Editing only affects new orders. Existing subscribers keep their original price and duration.'
            : 'Create a plan that will appear on the Premium screen for all users.'}
        </p>

        <div className="form-row">
          <label className="label" htmlFor="plan-name">
            Name
          </label>
          <input
            id="plan-name"
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Yearly, Lifetime, etc."
            maxLength={80}
            disabled={submitting}
            autoFocus
          />
        </div>

        <div className="form-row">
          <span className="label">Plan type</span>
          <ul
            className="chip-list"
            style={{ marginTop: 2 }}
            aria-label="Plan type"
          >
            {PLAN_TYPES.map((t) => {
              const selected = planType === t.value;
              const disabled = planTypeLocked
                ? !selected
                : usedPlanTypes.has(t.value);
              const cls = selected
                ? 'chip chip-active'
                : disabled
                  ? 'chip chip-readonly'
                  : 'chip';
              return (
                <li key={t.value}>
                  <button
                    type="button"
                    className={cls}
                    onClick={() => (disabled ? null : handlePickType(t.value))}
                    disabled={disabled || submitting}
                    aria-pressed={selected}
                    style={
                      disabled && !selected
                        ? { opacity: 0.5, cursor: 'not-allowed' }
                        : undefined
                    }
                  >
                    {t.label}
                  </button>
                </li>
              );
            })}
          </ul>
          {planTypeLocked ? (
            <p className="helper">
              Plan type cannot be changed once a plan exists. Disable this plan
              and create a new one if you need a different type.
            </p>
          ) : null}
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label className="label" htmlFor="plan-price">
              Price (INR)
            </label>
            <input
              id="plan-price"
              className="input"
              type="text"
              inputMode="numeric"
              value={priceInr}
              onChange={(e) =>
                setPriceInr(e.target.value.replace(/[^0-9]/g, ''))
              }
              placeholder="299"
              maxLength={6}
              disabled={submitting}
            />
          </div>

          <div className="form-row">
            <label className="label" htmlFor="plan-duration">
              {lifetime ? 'Duration (locked for Lifetime)' : 'Duration (days)'}
            </label>
            <input
              id="plan-duration"
              className="input"
              type="text"
              inputMode="numeric"
              value={lifetime ? '' : durationDays}
              onChange={(e) =>
                setDurationDays(e.target.value.replace(/[^0-9]/g, ''))
              }
              placeholder={lifetime ? 'Lifetime — never expires' : '30'}
              maxLength={5}
              disabled={lifetime || submitting}
            />
          </div>

          <div className="form-row">
            <label className="label" htmlFor="plan-order">
              Display order
            </label>
            <input
              id="plan-order"
              className="input"
              type="text"
              inputMode="numeric"
              value={displayOrder}
              onChange={(e) =>
                setDisplayOrder(e.target.value.replace(/[^0-9]/g, ''))
              }
              placeholder="100"
              maxLength={4}
              disabled={submitting}
            />
            <p className="helper">Lower numbers appear higher on Premium.</p>
          </div>
        </div>

        <div className="form-row">
          <label className="label" htmlFor="plan-desc">
            Description (optional)
          </label>
          <textarea
            id="plan-desc"
            className="input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Best value for consistent prep"
            maxLength={240}
            disabled={submitting}
          />
        </div>

        <div className="form-row">
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor:
                isEdit && isLastActive && isActive ? 'not-allowed' : 'pointer',
            }}
          >
            <input
              type="checkbox"
              role="switch"
              checked={isActive}
              disabled={(isEdit && isLastActive && isActive) || submitting}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>
              <span className="label" style={{ display: 'block' }}>
                Active
              </span>
              <span className="helper">
                Inactive plans are hidden from buyers but never revoke existing
                subscribers.
              </span>
            </span>
          </label>
          {isEdit && isLastActive ? (
            <p
              className="helper"
              style={{
                color: '#b45309',
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                padding: '8px 10px',
                borderRadius: 8,
                marginTop: 8,
              }}
            >
              This is the last active plan. The Active toggle is locked until
              another plan is activated, so the Premium screen always has at
              least one option.
            </p>
          ) : null}
        </div>

        {validationError ? (
          <div className="alert alert-error">{validationError}</div>
        ) : null}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create plan'}
          </button>
        </div>
      </form>
    </div>
  );
}
