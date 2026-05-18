import { LearningSession } from '../models/LearningSession.js';

export const learningSessionRepository = {
  async create(doc) {
    const created = await LearningSession.create(doc);
    return created.toObject();
  },

  async findById(id) {
    return LearningSession.findById(id).lean().exec();
  },

  async findByUserAndClientKey(userId, clientSessionKey) {
    if (!clientSessionKey) return null;
    return LearningSession.findOne({ userId, clientSessionKey }).lean().exec();
  },

  async listRecentByUser(userId, { limit = 20 } = {}) {
    return LearningSession.find({ userId })
      .sort({ completedAt: -1 })
      .limit(Math.min(Math.max(Number(limit) || 20, 1), 50))
      .select('_id sessionType completedAt summary snapshot.sessionType')
      .lean()
      .exec();
  },

  async countByUser(userId) {
    return LearningSession.countDocuments({ userId }).exec();
  },

  async findLatestByUser(userId) {
    return LearningSession.findOne({ userId }).sort({ completedAt: -1 }).lean().exec();
  },

  /**
   * Lean fetch for analytics rebuild (snapshot fields only).
   */
  async listForAnalyticsRebuild(userId, { limit = 500 } = {}) {
    return LearningSession.find({ userId })
      .sort({ completedAt: 1 })
      .limit(Math.min(Math.max(Number(limit) || 500, 1), 500))
      .select('_id sessionType completedAt summary weakTopics snapshot')
      .lean()
      .exec();
  },
};
