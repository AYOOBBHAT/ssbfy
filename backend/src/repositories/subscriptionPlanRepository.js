import { SubscriptionPlan } from '../models/SubscriptionPlan.js';

export const subscriptionPlanRepository = {
  async countAll() {
    return SubscriptionPlan.countDocuments({}).exec();
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

  async findById(id) {
    return SubscriptionPlan.findById(id).lean().exec();
  },
};
