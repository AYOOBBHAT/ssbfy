import { Topic } from '../models/Topic.js';

export const topicRepository = {
  async findAll(filter = {}) {
    return Topic.find(filter).sort({ order: 1, name: 1 }).lean().exec();
  },

  async findById(id) {
    return Topic.findById(id).lean().exec();
  },
};
