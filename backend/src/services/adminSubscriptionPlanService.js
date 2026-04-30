import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { subscriptionPlanRepository } from '../repositories/subscriptionPlanRepository.js';
import { logger } from '../utils/logger.js';

const PLAN_TYPES = ['monthly', 'quarterly', 'yearly', 'lifetime'];

const LAST_ACTIVE_MESSAGE =
  'Cannot disable the last active plan. Activate another plan first so the Premium screen has at least one option.';

/**
 * Build a normalized, schema-compatible plan payload from an admin create
 * request. Throws 400 on any cross-field inconsistency.
 *
 * Rules (mirrored from validator + schema, restated here so the service is
 * the single trustworthy authority):
 *   - planType must be one of monthly / quarterly / yearly / lifetime.
 *   - lifetime ⇒ durationDays = null (we coerce; we do not silently accept
 *     a number for lifetime).
 *   - non-lifetime ⇒ durationDays must be a positive integer.
 *   - priceInr must be a positive integer (rupees).
 */
function buildCreatePayload(input) {
  const planType = input.planType;
  if (!PLAN_TYPES.includes(planType)) {
    throw new AppError('Invalid planType', HTTP_STATUS.BAD_REQUEST);
  }

  const isLifetime = planType === 'lifetime';
  const durationDays = isLifetime ? null : Number(input.durationDays);
  if (!isLifetime && (!Number.isInteger(durationDays) || durationDays <= 0)) {
    throw new AppError('durationDays must be a positive integer', HTTP_STATUS.BAD_REQUEST);
  }

  const priceInr = Number(input.priceInr);
  if (!Number.isInteger(priceInr) || priceInr < 1) {
    throw new AppError('priceInr must be a positive integer', HTTP_STATUS.BAD_REQUEST);
  }

  return {
    name: String(input.name).trim(),
    planType,
    durationDays,
    priceInr,
    isActive: input.isActive === undefined ? true : !!input.isActive,
    displayOrder: Number.isInteger(input.displayOrder) ? input.displayOrder : 100,
    description: typeof input.description === 'string' ? input.description.trim() : '',
  };
}

/**
 * Map a Mongo duplicate-key error from `planType: { unique: true }` to a
 * friendly 409. Anything else bubbles up unchanged.
 */
function isDuplicatePlanTypeError(err) {
  if (!err) return false;
  if (err.code !== 11000) return false;
  return Boolean(err.keyPattern?.planType || err.keyValue?.planType);
}

export const adminSubscriptionPlanService = {
  async list() {
    return subscriptionPlanRepository.findAllSorted();
  },

  async create(input) {
    const payload = buildCreatePayload(input);

    // Fast-path duplicate check so the API returns a clean message instead
    // of relying on the Mongo unique index throwing E11000 every time.
    const existing = await subscriptionPlanRepository.findByPlanType(payload.planType);
    if (existing) {
      throw new AppError(
        `A ${payload.planType} plan already exists. Edit the existing plan instead of creating a duplicate.`,
        HTTP_STATUS.CONFLICT
      );
    }

    try {
      const created = await subscriptionPlanRepository.create(payload);
      return created;
    } catch (err) {
      if (isDuplicatePlanTypeError(err)) {
        throw new AppError(
          `A ${payload.planType} plan already exists.`,
          HTTP_STATUS.CONFLICT
        );
      }
      throw err;
    }
  },

  /**
   * Edit allowed fields on a plan. `planType` is intentionally NOT editable
   * — it would invalidate prior payment snapshots' interpretation. Validator
   * blocks it at the request layer; we double-check here.
   */
  async update(id, input) {
    if (input && Object.prototype.hasOwnProperty.call(input, 'planType')) {
      throw new AppError(
        'planType cannot be changed once a plan exists',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const current = await subscriptionPlanRepository.findById(id);
    if (!current) {
      throw new AppError('Subscription plan not found', HTTP_STATUS.NOT_FOUND);
    }

    const updates = {};

    if (typeof input.name === 'string') {
      const name = input.name.trim();
      if (!name) {
        throw new AppError('name cannot be empty', HTTP_STATUS.BAD_REQUEST);
      }
      updates.name = name;
    }

    if (input.priceInr !== undefined) {
      const priceInr = Number(input.priceInr);
      if (!Number.isInteger(priceInr) || priceInr < 1) {
        throw new AppError('priceInr must be a positive integer', HTTP_STATUS.BAD_REQUEST);
      }
      updates.priceInr = priceInr;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'durationDays')) {
      const isLifetime = current.planType === 'lifetime';
      const v = input.durationDays;
      if (isLifetime) {
        if (v !== null && v !== undefined) {
          throw new AppError(
            'durationDays must be null for lifetime plans',
            HTTP_STATUS.BAD_REQUEST
          );
        }
        updates.durationDays = null;
      } else {
        if (!Number.isInteger(v) || v <= 0) {
          throw new AppError(
            'durationDays must be a positive integer for this plan',
            HTTP_STATUS.BAD_REQUEST
          );
        }
        updates.durationDays = v;
      }
    }

    if (input.displayOrder !== undefined) {
      const dOrder = Number(input.displayOrder);
      if (!Number.isInteger(dOrder) || dOrder < 0 || dOrder > 9999) {
        throw new AppError(
          'displayOrder must be an integer 0–9999',
          HTTP_STATUS.BAD_REQUEST
        );
      }
      updates.displayOrder = dOrder;
    }

    if (typeof input.description === 'string') {
      updates.description = input.description.trim();
    }

    // Active → inactive transition is handled atomically up-front via
    // `_atomicDisableWithInvariant`. If it would break the "≥1 active plan"
    // invariant, that helper throws 409 and we never apply any other field
    // updates from this PATCH (price/name/etc. stay as they were).
    if (input.isActive === false && current.isActive === true) {
      await this._atomicDisableWithInvariant(id);
    } else if (input.isActive === true && current.isActive === false) {
      // Re-enable is always allowed (it can only INCREASE active count).
      updates.isActive = true;
    }
    // Note: same-state transitions (true→true, false→false) are no-ops and
    // intentionally NOT folded into `updates`.

    if (Object.keys(updates).length === 0) {
      // Either nothing changed, or only the atomic disable ran. Return the
      // freshest doc so the API response reflects the post-flip state.
      return subscriptionPlanRepository.findById(id);
    }

    const updated = await subscriptionPlanRepository.updateById(id, updates);
    if (!updated) {
      throw new AppError('Subscription plan not found', HTTP_STATUS.NOT_FOUND);
    }
    return updated;
  },

  async setStatus(id, isActive) {
    const current = await subscriptionPlanRepository.findById(id);
    if (!current) {
      throw new AppError('Subscription plan not found', HTTP_STATUS.NOT_FOUND);
    }
    const next = !!isActive;
    if (next === current.isActive) return current;

    if (next === false) {
      return this._atomicDisableWithInvariant(id);
    }
    return subscriptionPlanRepository.setActiveById(id, true);
  },

  async moveUp(id) {
    const current = await subscriptionPlanRepository.findById(id);
    if (!current) {
      throw new AppError('Subscription plan not found', HTTP_STATUS.NOT_FOUND);
    }
    const previous = await subscriptionPlanRepository.findPreviousByOrder(current);
    if (!previous) return current;
    if (previous.displayOrder === current.displayOrder) {
      // Tie-broken by createdAt — give the moving-up plan a clearly smaller
      // order so the swap actually changes their visible position.
      await subscriptionPlanRepository.updateById(current._id, {
        displayOrder: Math.max(0, previous.displayOrder - 1),
      });
    } else {
      await subscriptionPlanRepository.swapDisplayOrder(current, previous);
    }
    return subscriptionPlanRepository.findById(id);
  },

  async moveDown(id) {
    const current = await subscriptionPlanRepository.findById(id);
    if (!current) {
      throw new AppError('Subscription plan not found', HTTP_STATUS.NOT_FOUND);
    }
    const next = await subscriptionPlanRepository.findNextByOrder(current);
    if (!next) return current;
    if (next.displayOrder === current.displayOrder) {
      await subscriptionPlanRepository.updateById(current._id, {
        displayOrder: next.displayOrder + 1,
      });
    } else {
      await subscriptionPlanRepository.swapDisplayOrder(current, next);
    }
    return subscriptionPlanRepository.findById(id);
  },

  /**
   * Atomically disable a plan while enforcing the business invariant
   * "at least one active plan exists at all times".
   *
   * The classic read-then-write check (count → if >1 then write) is unsafe:
   * two concurrent disable requests on two different active plans could
   * both observe count=2, both pass the gate, and both write — leaving
   * zero active plans. This helper closes that race with a flip-then-verify
   * pattern that is correct for arbitrary concurrency:
   *
   *   1) Atomic flip: `findOneAndUpdate({ _id, isActive: true }, ...)`.
   *      MongoDB's per-document write lock guarantees exactly one writer
   *      can win this for any given doc.
   *
   *   2) Re-count active plans AFTER the write. If the count is still ≥1,
   *      the invariant holds and we keep the change.
   *
   *   3) If the count is 0, our write was the one that crossed the line —
   *      we immediately reverse it and throw 409. Any concurrent flip that
   *      also raced may also reverse itself; the outcome is convergent:
   *      at least one plan remains active in every interleaving.
   *
   * Returns the updated (now-inactive) plan on success. Throws 409 on
   * invariant rollback. Throws 404 if the plan does not exist.
   */
  async _atomicDisableWithInvariant(planId) {
    const flipped = await subscriptionPlanRepository.deactivateIfActive(planId);
    if (!flipped) {
      // Plan wasn't currently active. Either it doesn't exist, or another
      // concurrent admin already flipped it. Resolve into a deterministic
      // response by re-reading.
      const fresh = await subscriptionPlanRepository.findById(planId);
      if (!fresh) {
        throw new AppError('Subscription plan not found', HTTP_STATUS.NOT_FOUND);
      }
      return fresh;
    }

    const remainingActive = await subscriptionPlanRepository.countActive();
    if (remainingActive >= 1) {
      return flipped;
    }

    // We just took count to 0. Roll back our own write so the invariant
    // holds. `setActiveById(true)` is unconditional and idempotent — if
    // another admin separately re-activated this plan between our flip
    // and this rollback, the field is simply set to its already-true
    // value. Either way, this plan ends up active again.
    await subscriptionPlanRepository.setActiveById(planId, true);

    logger.info(
      '[ADMIN] Atomic disable rolled back — would leave 0 active plans:',
      { planId: String(planId) }
    );

    throw new AppError(LAST_ACTIVE_MESSAGE, HTTP_STATUS.CONFLICT);
  },
};

export const ADMIN_PLAN_ALLOWED_PLAN_TYPES = PLAN_TYPES;
