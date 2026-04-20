import { Subject } from '../models/Subject.js';

export const subjectRepository = {
  async findAll(filter = {}) {
    return Subject.find(filter).sort({ order: 1, name: 1 }).lean().exec();
  },

  async findById(id) {
    return Subject.findById(id).lean().exec();
  },
};
