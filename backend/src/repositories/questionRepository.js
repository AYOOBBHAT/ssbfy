import mongoose from 'mongoose';
import { Question } from '../models/Question.js';
import { Test } from '../models/Test.js';
import { TestAttempt } from '../models/TestAttempt.js';
import { QUESTION_SORT } from '../constants/questionSort.js';

/**
 * Normalize a question text for duplicate detection only.
 * - lowercase + trim
 * - collapse whitespace runs to a single space
 *
 * NOT used for storage; the on-disk text keeps the admin's original casing
 * and spacing. This is a comparison key only.
 */
export function normalizeForDuplicate(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Build a regex from a literal string so admins can paste anything (including
 * `?`, `(`, `*`) into the search box without exploding the query.
 */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
   *
   * Used by paths that should respect admin disable in real-time:
   * weak/smart practice question fetches, etc. NOT used for scoring an
   * already-started attempt — that path uses `findByIdsForScoring` so a
   * student isn't punished for an admin disable that happened mid-attempt.
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

  /**
   * Scoring-only fetch for an already-started attempt.
   *
   * Same shape as `findActiveByIds` (returned in `ids` order, missing docs
   * dropped) but **does NOT filter by `isActive`**. This is the correct
   * source of truth for `testAttemptService.submit()`:
   *
   *   - `attempt.questionIds[]` was frozen at start time after passing the
   *     full active/hierarchy classifier (see `testService.getById`).
   *   - If an admin later disables a question, topic, or subject mid-attempt,
   *     the student's submit must STILL succeed — we honor the rule
   *     "attempt start freezes eligibility, attempt submit does not".
   *   - Future starts continue to use `findRandomActive` / `findActiveByIds`
   *     / `classifyQuestions`, so disabled content never leaks into a new
   *     test, daily / weak / smart practice session, or new mock attempt.
   *
   * Hard-deletion is no longer reachable from the admin surface (we removed
   * `DELETE /questions/:id`), so a missing doc returned here means real
   * corruption / legacy ops scripts — caller should still throw on length
   * mismatch as a defense-in-depth signal.
   */
  async findByIdsForScoring(ids) {
    if (!ids?.length) {
      return [];
    }
    const idStrings = ids.map((id) => String(id));
    const uniqueForQuery = [...new Set(idStrings)];
    const inClause = uniqueForQuery.map((id) => new mongoose.Types.ObjectId(id));
    const docs = await Question.find({ _id: { $in: inClause } })
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

  /**
   * Admin list: paged, sorted newest first, with subject/topic/post labels.
   */
  async findForAdminList(filter = {}, options = {}) {
    const { limit = 20, skip = 0, projection } = options;
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
    const safeSkip = Math.max(Number(skip) || 0, 0);
    let chain = Question.find(filter).sort({ createdAt: -1 }).skip(safeSkip).limit(safeLimit);
    if (projection === 'picker') {
      chain = chain.select(
        'questionText options questionType questionImage subjectId topicId postIds difficulty year isActive correctAnswers correctAnswerIndex explanation createdAt updatedAt'
      );
    }
    return chain
      .populate('subjectId', 'name isActive postId')
      .populate('topicId', 'name isActive subjectId')
      .populate('postIds', 'name slug isActive')
      .lean()
      .exec();
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

  /**
   * Atomic bulk active/inactive flip. Returns `{ matched, modified }` so
   * the caller can report partial success when ids reference deleted docs.
   * No regression risk to scoring: live attempts read the current `isActive`
   * value at submit time, so disabling a question mid-test is already a
   * documented hard 400 — not new behavior.
   */
  async bulkSetActive(ids, isActive) {
    if (!ids?.length) return { matchedCount: 0, modifiedCount: 0 };
    const oids = [...new Set(ids.map(String))]
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (!oids.length) return { matchedCount: 0, modifiedCount: 0 };
    const res = await Question.updateMany(
      { _id: { $in: oids } },
      { $set: { isActive: Boolean(isActive) } }
    ).exec();
    return { matchedCount: res.matchedCount ?? 0, modifiedCount: res.modifiedCount ?? 0 };
  },

  /**
   * Bulk insert with `ordered: false` so a single bad doc doesn't cancel the
   * whole batch. Returns `{ insertedDocs, errors }`. Validation already ran
   * upstream in the service — this is the storage call only.
   */
  async bulkInsertMany(payloads) {
    if (!Array.isArray(payloads) || payloads.length === 0) {
      return { insertedDocs: [], errors: [] };
    }
    try {
      const docs = await Question.insertMany(payloads, {
        ordered: false,
        rawResult: false,
      });
      return {
        insertedDocs: docs.map((d) => d.toObject?.() ?? d),
        errors: [],
      };
    } catch (err) {
      // Mongoose `BulkWriteError` (or `MongoBulkWriteError`) carries a
      // `writeErrors` array AND `insertedDocs` (or `result.insertedIds`).
      const insertedDocs = Array.isArray(err.insertedDocs)
        ? err.insertedDocs.map((d) => d.toObject?.() ?? d)
        : [];
      const errors = Array.isArray(err.writeErrors)
        ? err.writeErrors.map((e) => ({
            index: e.index ?? e.err?.index ?? null,
            message: e.errmsg ?? e.err?.errmsg ?? e.message ?? 'Insert failed',
          }))
        : [{ index: null, message: err.message ?? 'Insert failed' }];
      return { insertedDocs, errors };
    }
  },

  /**
   * Find an exact-text duplicate within the same subject, ignoring case and
   * collapsing whitespace. Returns the existing question id or null.
   *
   * Implementation note: we don't carry a "normalized text" field in the
   * schema, so the comparison runs in JS on a small candidate set fetched
   * with a case-insensitive prefix match. For typical subjects (<100k Q's)
   * this is fast enough and avoids a backfill migration.
   */
  async findExactDuplicate({ questionText, subjectId, excludeId = null }) {
    const normalized = normalizeForDuplicate(questionText);
    if (!normalized || !subjectId || !mongoose.isValidObjectId(subjectId)) {
      return null;
    }
    const subjectOid = new mongoose.Types.ObjectId(String(subjectId));
    const filter = {
      subjectId: subjectOid,
      questionText: {
        $regex: `^${escapeRegex(questionText.trim())}$`,
        $options: 'i',
      },
    };
    if (excludeId && mongoose.isValidObjectId(excludeId)) {
      filter._id = { $ne: new mongoose.Types.ObjectId(String(excludeId)) };
    }
    const fast = await Question.findOne(filter, { _id: 1, questionText: 1 }).lean().exec();
    if (fast && normalizeForDuplicate(fast.questionText) === normalized) {
      return fast;
    }
    // Fallback for whitespace-collapsed matches that the regex above missed
    // (e.g. "Capital  of   J&K?" vs "Capital of J&K?"). Pull a small candidate
    // set by the first 16 chars and JS-compare.
    const slug = escapeRegex(normalized.slice(0, 16));
    if (!slug) return null;
    const candidates = await Question.find(
      {
        subjectId: subjectOid,
        questionText: { $regex: slug, $options: 'i' },
        ...(excludeId && mongoose.isValidObjectId(excludeId)
          ? { _id: { $ne: new mongoose.Types.ObjectId(String(excludeId)) } }
          : {}),
      },
      { _id: 1, questionText: 1 }
    )
      .limit(50)
      .lean()
      .exec();
    return (
      candidates.find(
        (c) => normalizeForDuplicate(c.questionText) === normalized
      ) || null
    );
  },

  /**
   * Find up to `limit` similar questions in the same subject for a soft
   * "Possible duplicate" warning on the AddQuestion form. Looser than the
   * exact-duplicate check: we just regex-search the first ~30 chars.
   */
  async findSimilar({ questionText, subjectId, excludeId = null, limit = 5 }) {
    const normalized = normalizeForDuplicate(questionText);
    if (!normalized || !subjectId || !mongoose.isValidObjectId(subjectId)) {
      return [];
    }
    const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 10));
    const subjectOid = new mongoose.Types.ObjectId(String(subjectId));
    const slug = escapeRegex(normalized.slice(0, 30));
    if (!slug) return [];
    const filter = {
      subjectId: subjectOid,
      questionText: { $regex: slug, $options: 'i' },
    };
    if (excludeId && mongoose.isValidObjectId(excludeId)) {
      filter._id = { $ne: new mongoose.Types.ObjectId(String(excludeId)) };
    }
    return Question.find(filter, {
      _id: 1,
      questionText: 1,
      isActive: 1,
      difficulty: 1,
      topicId: 1,
    })
      .limit(safeLimit)
      .lean()
      .exec();
  },

  /**
   * Usage counts for a single question: how many tests reference it and how
   * many attempts have already snapshotted it. Used by the admin list to
   * help reason about blast radius before disable.
   */
  async getUsageCounts(id) {
    if (!mongoose.isValidObjectId(id)) {
      return { tests: 0, attempts: 0 };
    }
    const oid = new mongoose.Types.ObjectId(String(id));
    const [tests, attempts] = await Promise.all([
      Test.countDocuments({ questionIds: oid }).exec(),
      TestAttempt.countDocuments({ questionIds: oid }).exec(),
    ]);
    return { tests, attempts };
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

  /**
   * Random active questions for smart-practice: caller supplies a fully-built
   * `$match` object (must include `isActive: true` and at least one scope
   * field). Uses `$sample` like weak-practice; returns fewer than `limit`
   * when the pool is smaller — never throws.
   */
  async findRandomSmartPractice(match, limit = 10) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
    const rows = await Question.aggregate([
      { $match: match },
      { $sample: { size: safeLimit } },
    ]);
    await Question.populate(rows, [
      { path: 'topicId', select: 'name slug isActive subjectId' },
      { path: 'subjectId', select: 'name slug isActive postId' },
    ]);
    return rows;
  },
};
