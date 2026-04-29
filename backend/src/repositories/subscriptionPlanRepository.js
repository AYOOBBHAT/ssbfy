import { SubscriptionPlan } from '../models/SubscriptionPlan.js';

export const subscriptionPlanRepository = {
  async countAll() {
    return SubscriptionPlan.countDocuments({}).exec();
  },

  async countActive() {
    return SubscriptionPlan.countDocuments({ isActive: true }).exec();
  },

  async insertMany(rows) {
    const out = await SubscriptionPlan.insertMany(rows, { ordered: false });
    return out.map((d) => d.toObject());
  },

  async findActiveSorted() {
    return SubscriptionPlan.find({ isActive: true })
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean()
      .exec();
  },

  /** Admin-only listing: returns ALL plans, including soft-disabled ones. */
  async findAllSorted() {
    return SubscriptionPlan.find({})
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean()
      .exec();
  },

  async findById(id) {
    return SubscriptionPlan.findById(id).lean().exec();
  },

  async findByPlanType(planType) {
    return SubscriptionPlan.findOne({ planType }).lean().exec();
  },

  async create(data) {
    const doc = await SubscriptionPlan.create(data);
    return doc.toObject();
  },

  /**
   * Patch a plan by id. The schema's pre('validate') hook still runs (so
   * lifetime plans always end up with `durationDays: null`). Returns the
   * updated lean doc, or null if no doc with that id exists.
   *
   * NOTE: The caller MUST NOT pass `planType` here — it's immutable once a
   * plan exists, and the validator already strips it. We defensively `delete`
   * it again at this layer in case a future caller forgets.
   */
  async updateById(id, updates) {
    const safe = { ...(updates || {}) };
    delete safe.planType;
    return SubscriptionPlan.findByIdAndUpdate(
      id,
      { $set: safe },
      { new: true, runValidators: true, context: 'query' }
    )
      .lean()
      .exec();
  },

  async setActiveById(id, isActive) {
    return SubscriptionPlan.findByIdAndUpdate(
      id,
      { $set: { isActive: !!isActive } },
      { new: true }
    )
      .lean()
      .exec();
  },

  /**
   * Atomically flip a plan from active → inactive in a single database
   * operation. Returns the updated lean doc on success, or `null` if the
   * plan was already inactive (no transition happened).
   *
   * The filter `isActive: true` is the key: MongoDB's single-document write
   * lock guarantees that only one concurrent caller can match this filter
   * for any given doc. Two simultaneous requests targeting the same plan
   * will see exactly one win and one return null.
   *
   * IMPORTANT: This primitive does NOT enforce the "at least one active
   * plan" business invariant on its own — that is layered in the service
   * via a post-write count check + rollback. See
   * `adminSubscriptionPlanService._atomicDisableWithInvariant`.
   */
  async deactivateIfActive(id) {
    return SubscriptionPlan.findOneAndUpdate(
      { _id: id, isActive: true },
      { $set: { isActive: false } },
      { new: true }
    )
      .lean()
      .exec();
  },

  /**
   * Two-step swap of `displayOrder` between two plans. Used by move-up /
   * move-down. Mongo doesn't have a multi-doc atomic transaction here without
   * a session; we accept the brief window because reorder is an admin-only
   * action (low concurrency) and the worst case is two plans temporarily
   * sharing an order — which the list query tolerates via `createdAt`
   * tiebreaker.
   */
  async swapDisplayOrder(planA, planB) {
    await SubscriptionPlan.bulkWrite([
      { updateOne: { filter: { _id: planA._id }, update: { $set: { displayOrder: planB.displayOrder } } } },
      { updateOne: { filter: { _id: planB._id }, update: { $set: { displayOrder: planA.displayOrder } } } },
    ]);
  },

  /**
   * Returns the plan immediately before `currentDisplayOrder` in
   * (displayOrder, createdAt) sort order. Returns null if `currentPlan` is
   * already first.
   */
  async findPreviousByOrder(currentPlan) {
    return SubscriptionPlan.findOne({
      $or: [
        { displayOrder: { $lt: currentPlan.displayOrder } },
        {
          displayOrder: currentPlan.displayOrder,
          createdAt: { $lt: currentPlan.createdAt },
        },
      ],
    })
      .sort({ displayOrder: -1, createdAt: -1 })
      .lean()
      .exec();
  },

  async findNextByOrder(currentPlan) {
    return SubscriptionPlan.findOne({
      $or: [
        { displayOrder: { $gt: currentPlan.displayOrder } },
        {
          displayOrder: currentPlan.displayOrder,
          createdAt: { $gt: currentPlan.createdAt },
        },
      ],
    })
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean()
      .exec();
  },
};
