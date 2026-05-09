import mongoose from 'mongoose';
import { Subject } from '../models/Subject.js';

function toOidSet(ids) {
  if (!ids?.length) return [];
  const unique = [...new Set(ids.map(String))];
  return unique.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
}

export const subjectRepository = {
  async findAll(filter = {}) {
    // Admin-controlled display order first, then stable tiebreak by creation time.
    return Subject.find(filter).sort({ order: 1, createdAt: 1 }).lean().exec();
  },

  async findById(id) {
    return Subject.findById(id).lean().exec();
  },

  /**
   * Bulk lean fetch by ids. Returns only `_id` and `isActive` because that is
   * all callers need when they are just classifying each id as active/inactive
   * (e.g. test-creation hierarchy checks). Caller order is NOT preserved.
   */
  async findByIds(ids) {
    if (!ids?.length) return [];
    const unique = [...new Set(ids.map(String))];
    return Subject.find({ _id: { $in: unique } }, { _id: 1, isActive: 1 })
      .lean()
      .exec();
  },

  /**
   * For test-type inference: needs parent post per subject.
   */
  async findByIdsWithPost(ids) {
    const oids = toOidSet(ids);
    if (!oids.length) return [];
    return Subject.find({ _id: { $in: oids } }, { _id: 1, isActive: 1, postId: 1 })
      .lean()
      .exec();
  },

  /**
   * Case-insensitive duplicate lookup **within** a post. `postId` is
   * required — ambiguity across posts is prevented by scoping here.
   */
  async findOneByNameInPost(name, postId) {
    if (!postId) {
      throw new Error('findOneByNameInPost requires postId');
    }
    return Subject.findOne({ postId, name: new RegExp(`^${escapeRegex(name)}$`, 'i') })
      .lean()
      .exec();
  },

  async create(data) {
    const doc = await Subject.create({
      name: data.name,
      postId: data.postId,
      order: data.order ?? 0,
    });
    return doc.toObject();
  },

  /**
   * Apply a partial update and return the fresh lean document.
   * Only keys present in `patch` are written; `{ new: true }` returns the
   * post-update state (which is what admin UIs want to render).
   */
  async updateById(id, patch) {
    return Subject.findByIdAndUpdate(id, { $set: patch }, { new: true })
      .lean()
      .exec();
  },
};

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
