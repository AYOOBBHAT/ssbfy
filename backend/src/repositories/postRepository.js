import { Post } from '../models/Post.js';

export const postRepository = {
  async findAll(filter = {}) {
    return Post.find(filter).sort({ name: 1 }).lean().exec();
  },

  async findById(id) {
    return Post.findById(id).lean().exec();
  },

  /** Returns true if every id exists in Post collection. Empty array is valid. */
  async existsAllIds(ids) {
    if (!ids?.length) {
      return true;
    }
    const count = await Post.countDocuments({ _id: { $in: ids } }).exec();
    return count === ids.length;
  },
};
