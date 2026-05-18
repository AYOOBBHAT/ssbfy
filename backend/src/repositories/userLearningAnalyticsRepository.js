import { UserLearningAnalytics } from '../models/UserLearningAnalytics.js';

export const userLearningAnalyticsRepository = {
  async findByUserId(userId) {
    return UserLearningAnalytics.findOne({ userId }).lean().exec();
  },

  async upsertState(userId, state) {
    return UserLearningAnalytics.findOneAndUpdate(
      { userId },
      {
        $set: {
          state,
          version: state?.version ?? 1,
          lastUpdatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    )
      .lean()
      .exec();
  },
};
