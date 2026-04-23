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
   * Raw lean fetch by ids — does NOT filter by `isActive`. Returns a trimmed
   * projection sufficient for hierarchy classification (`_id`, `isActive`,
   * `subjectId`, `topicId`). Callers that need scoring use `findActiveByIds`.
   */
  async findByIdsRaw(ids) {
    if (!ids?.length) return [];
    const unique = [...new Set(ids.map(String))];
    const oids = unique.map((id) => new mongoose.Types.ObjectId(id));
    return Question.find(
      { _id: { $in: oids } },
      { _id: 1, isActive: 1, subjectId: 1, topicId: 1 }
    )
      .lean()
      .exec();
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

  /**
   * Random *active* questions scoped to the given topics, used by the
   * "weak-topic practice" endpoint. Returns plain objects with `topicId`
   * and `subjectId` populated so the mobile client can render topic /
   * subject labels without a second round-trip.
   *
   * Implementation notes:
   *   - `$sample` is the right primitive here: on modern Mongo it uses a
   *     pseudo-random index walk when the match ratio is high and falls
   *     back to a collection scan otherwise. Either way it's O(size) in
   *     result rows, not O(n).
   *   - Aggregation returns lean plain objects, so we use `Question.populate`
   *     (it accepts arrays of raw docs) instead of chaining `.populate()`
   *     on a query.
   */
  async findRandomByTopics(topicIds, limit = 10) {
    if (!topicIds?.length) return [];
    const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
    const oids = [...new Set(topicIds.map(String))].map(
      (id) => new mongoose.Types.ObjectId(id)
    );

    const rows = await Question.aggregate([
      { $match: { topicId: { $in: oids }, isActive: true } },
      { $sample: { size: safeLimit } },
    ]);

    await Question.populate(rows, [
      { path: 'topicId', select: 'name slug isActive subjectId' },
      { path: 'subjectId', select: 'name slug isActive postId' },
    ]);

    return rows;
  },
};
