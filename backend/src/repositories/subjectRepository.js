import mongoose from 'mongoose';
import { Subject } from '../models/Subject.js';

function toOidSet(ids) {
  if (!ids?.length) return [];
  const unique = [...new Set(ids.map(String))];
  return unique.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
}

export const subjectRepository = {
  /**
   * List subjects. When `filter.postId` is set, returns **global** subjects
   * (`postId` null/absent) **plus** subjects scoped to that post (backward
   * compatibility during migration).
   */
  async findAll(filter = {}) {
    const { postId, ...rest } = filter;
    const q = { ...rest };
    if (postId && mongoose.isValidObjectId(String(postId))) {
      const oid = new mongoose.Types.ObjectId(String(postId));
      q.$or = [
        { postId: oid },
        { postId: null },
        { postId: { $exists: false } },
      ];
    }
    return Subject.find(q).sort({ order: 1, createdAt: 1 }).lean().exec();
  },

  async findById(id) {
    return Subject.findById(id).lean().exec();
  },

  async findByIds(ids) {
    if (!ids?.length) return [];
    const unique = [...new Set(ids.map(String))];
    return Subject.find({ _id: { $in: unique } }, { _id: 1, isActive: 1 })
      .lean()
      .exec();
  },

  async findByIdsWithPost(ids) {
    const oids = toOidSet(ids);
    if (!oids.length) return [];
    return Subject.find({ _id: { $in: oids } }, { _id: 1, isActive: 1, postId: 1 })
      .lean()
      .exec();
  },

  /**
   * Case-insensitive duplicate lookup within a single post (legacy).
   * @deprecated Prefer `findOneByNameGlobal` for new writes.
   */
  async findOneByNameInPost(name, postId) {
    if (!postId) {
      return null;
    }
    return Subject.findOne({ postId, name: new RegExp(`^${escapeRegex(name)}$`, 'i') })
      .lean()
      .exec();
  },

  /** Case-insensitive duplicate lookup across all subjects (global uniqueness). */
  async findOneByNameGlobal(name) {
    const n = String(name ?? '').trim();
    if (!n) return null;
    return Subject.findOne({ name: n })
      .collation({ locale: 'en', strength: 2 })
      .lean()
      .exec();
  },

  async create(data) {
    const doc = await Subject.create({
      name: data.name,
      postId: data.postId ?? null,
      order: data.order ?? 0,
    });
    return doc.toObject();
  },

  async updateById(id, patch) {
    return Subject.findByIdAndUpdate(id, { $set: patch }, { new: true })
      .lean()
      .exec();
  },
};

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
