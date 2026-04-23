import { Note } from '../models/Note.js';

export const noteRepository = {
  /**
   * Filtered list, newest first. Callers pass whatever subset of
   * { postId, subjectId, topicId, isActive } they want to scope by.
   */
  async findAll(filter = {}) {
    return Note.find(filter).sort({ createdAt: -1 }).lean().exec();
  },

  async findById(id) {
    return Note.findById(id).lean().exec();
  },

  async create(data) {
    const doc = await Note.create({
      title: data.title,
      content: data.content,
      postId: data.postId,
      subjectId: data.subjectId,
      topicId: data.topicId,
    });
    return doc.toObject();
  },

  /**
   * Partial update. Mongoose validators run so `isActive` must stay a
   * boolean and `title`/`content` keep their type constraints. Returns
   * the updated lean doc (or null if the id doesn't exist).
   */
  async updateById(id, patch) {
    return Note.findByIdAndUpdate(
      id,
      { $set: patch },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
  },
};
