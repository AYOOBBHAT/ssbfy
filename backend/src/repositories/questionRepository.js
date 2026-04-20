import mongoose from 'mongoose';
import { Question } from '../models/Question.js';
import { QUESTION_SORT } from '../constants/questionSort.js';

function castMatchFilter(filter) {
  const f = { ...filter };
  if (f.subjectId != null) {
    f.subjectId = new mongoose.Types.ObjectId(f.subjectId);
  }
  if (f.topicId != null) {
    f.topicId = new mongoose.Types.ObjectId(f.topicId);
  }
  if (f.postIds != null) {
    f.postIds = new mongoose.Types.ObjectId(f.postIds);
  }
  return f;
}

export const questionRepository = {
  async create(data) {
    const doc = await Question.create(data);
    return doc.toObject();
  },

  async findById(id) {
    return Question.findById(id).lean().exec();
  },

  /**
   * Active questions whose _id is in `ids`, returned in the same order as `ids`
   * (duplicates preserved; missing/inactive ids are omitted).
   */
  async findActiveByIds(ids) {
    if (!ids?.length) {
      return [];
    }
    const idStrings = ids.map((id) => String(id));
    const uniqueForQuery = [...new Set(idStrings)];
    const inClause = uniqueForQuery.map((id) => new mongoose.Types.ObjectId(id));
    const docs = await Question.find({
      _id: { $in: inClause },
      isActive: true,
    })
      .lean()
      .exec();
    const map = new Map(docs.map((d) => [String(d._id), d]));
    return idStrings.map((id) => map.get(id)).filter((d) => d !== undefined);
  },

  async findByIdForUpdate(id) {
    return Question.findById(id).exec();
  },

  /** Count active questions matching the given ids (deduped). */
  async countActiveByIds(ids) {
    if (!ids?.length) return 0;
    const unique = [...new Set(ids.map((id) => String(id)))];
    return Question.countDocuments({
      _id: { $in: unique.map((id) => new mongoose.Types.ObjectId(id)) },
      isActive: true,
    }).exec();
  },

  async countDocuments(filter = {}) {
    return Question.countDocuments(filter).exec();
  },

  async findAll(filter = {}, options = {}) {
    const { limit = 50, skip = 0, sort = QUESTION_SORT.LATEST } = options;
    const safeLimit = Math.min(Number(limit) || 50, 100);
    const safeSkip = Math.max(Number(skip) || 0, 0);

    if (sort === QUESTION_SORT.DIFFICULTY) {
      const match = castMatchFilter(filter);
      const rows = await Question.aggregate([
        { $match: match },
        {
          $addFields: {
            _difficultyRank: {
              $switch: {
                branches: [
                  { case: { $eq: ['$difficulty', 'easy'] }, then: 1 },
                  { case: { $eq: ['$difficulty', 'medium'] }, then: 2 },
                  { case: { $eq: ['$difficulty', 'hard'] }, then: 3 },
                ],
                default: 99,
              },
            },
          },
        },
        { $sort: { _difficultyRank: 1, createdAt: -1 } },
        { $skip: safeSkip },
        { $limit: safeLimit },
        { $project: { _difficultyRank: 0 } },
      ]);
      return rows;
    }

    const sortSpec =
      sort === QUESTION_SORT.OLDEST ? { createdAt: 1 } : { createdAt: -1 };

    return Question.find(filter)
      .sort(sortSpec)
      .skip(safeSkip)
      .limit(safeLimit)
      .lean()
      .exec();
  },

  async saveDocument(doc) {
    await doc.save();
    return doc.toObject();
  },

  async softDeleteById(id) {
    return Question.findByIdAndUpdate(id, { isActive: false }, { new: true }).lean().exec();
  },

  /** Random active questions (uses $sample). */
  async findRandomActive(limit = 10) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
    return Question.aggregate([
      { $match: { isActive: true } },
      { $sample: { size: safeLimit } },
    ]);
  },
};
