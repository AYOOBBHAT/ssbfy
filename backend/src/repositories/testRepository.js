import { Test } from '../models/Test.js';

export const testRepository = {
  async create(data) {
    const doc = await Test.create(data);
    return doc.toObject();
  },

  async findAll(filter = {}) {
    return Test.find(filter).sort({ createdAt: -1 }).lean().exec();
  },

  async findById(id) {
    return Test.findById(id).lean().exec();
  },

  async updateStatus(id, { status, disabledAt }) {
    const doc = await Test.findByIdAndUpdate(
      id,
      { status, disabledAt },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
    return doc;
  },
};
