import mongoose from 'mongoose';
import { Topic } from '../models/Topic.js';

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const topicRepository = {
  async findAll(filter = {}) {
    // Admin-controlled display order first, then stable tiebreak by creation time.
    return Topic.find(filter).sort({ order: 1, createdAt: 1 }).lean().exec();
  },

  async findById(id) {
    return Topic.findById(id).lean().exec();
  },

  /**
   * Bulk lean fetch by ids. Returns `_id` and `isActive` only — used by the
   * test service to verify the full Question → Topic → Subject hierarchy is
   * active at test-creation time.
   */
  async findByIds(ids) {
    if (!ids?.length) return [];
    const unique = [...new Set(ids.map(String))];
    return Topic.find({ _id: { $in: unique } }, { _id: 1, isActive: 1 })
      .lean()
      .exec();
  },

  async findOneByNameInSubject(name, subjectId) {
    const nameRegex = new RegExp(`^${escapeRegex(name)}$`, 'i');
    return Topic.findOne({ subjectId, name: nameRegex }).lean().exec();
  },

  /**
   * Topic name substring search within one subject (admin question picker).
   */
  async findIdsBySubjectAndTopicSearch(subjectId, topicSearch) {
    const q = String(topicSearch || '').trim();
    if (!q || !mongoose.isValidObjectId(String(subjectId))) {
      return [];
    }
    const sid = new mongoose.Types.ObjectId(String(subjectId));
    const rows = await Topic.find(
      {
        subjectId: sid,
        name: { $regex: escapeRegex(q), $options: 'i' },
      },
      { _id: 1 }
    )
      .limit(500)
      .lean()
      .exec();
    return rows.map((r) => r._id);
  },

  async create(data) {
    const doc = await Topic.create({
      name: data.name,
      subjectId: data.subjectId,
      order: data.order ?? 0,
    });
    return doc.toObject();
  },

  /**
   * Apply a partial update and return the fresh lean document.
   */
  async updateById(id, patch) {
    return Topic.findByIdAndUpdate(id, { $set: patch }, { new: true })
      .lean()
      .exec();
  },
};
