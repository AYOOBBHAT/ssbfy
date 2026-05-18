import mongoose from 'mongoose';

const userLearningAnalyticsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    version: { type: Number, default: 1 },
    state: { type: mongoose.Schema.Types.Mixed, required: true },
    lastUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const UserLearningAnalytics = mongoose.model(
  'UserLearningAnalytics',
  userLearningAnalyticsSchema
);
