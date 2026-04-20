import { Result } from '../models/Result.js';

export const resultRepository = {
  async create(data) {
    const doc = await Result.create(data);
    return doc.toObject();
  },

  async findByUser(userId, options = {}) {
    const { limit = 30 } = options;
    return Result.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('testId', 'title type duration')
      .lean()
      .exec();
  },

  async findById(id) {
    return Result.findById(id).lean().exec();
  },
};
