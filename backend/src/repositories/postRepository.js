import { Post } from '../models/Post.js';

export const postRepository = {
  async findAll(filter = {}) {
    return Post.find(filter).sort({ name: 1 }).lean().exec();
  },

  async findById(id) {
    return Post.findById(id).lean().exec();
  },

  /** For validating PDF attachments — returns all posts matching ids (may be fewer than `ids` if some missing). */
  async findByIds(ids) {
    if (!Array.isArray(ids) || !ids.length) {
      return [];
    }
    return Post.find({ _id: { $in: ids } }).lean().exec();
  },

  /**
   * Case-insensitive name lookup — used by the service layer for pre-insert
   * duplicate checks so we can return a friendly 409 before the unique
   * index rejects the write.
   */
  async findByName(name) {
    return Post.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') })
      .lean()
      .exec();
  },

  async findOneBySlug(slug) {
    return Post.findOne({ slug }).lean().exec();
  },

  async create(data) {
    const doc = await Post.create({
      name: data.name,
      slug: data.slug,
      description: data.description ?? '',
    });
    return doc.toObject();
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

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
