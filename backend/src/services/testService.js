import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { testRepository } from '../repositories/testRepository.js';
import { questionRepository } from '../repositories/questionRepository.js';
import { subjectRepository } from '../repositories/subjectRepository.js';
import { topicRepository } from '../repositories/topicRepository.js';

/**
 * Walk Question → (Subject, Topic) and split the provided id list into:
 *   - `valid`:   ids whose question is active AND whose subject AND topic are active
 *   - `invalid`: { id, reason } entries for every bad id
 *
 * This is the single source of truth for "is this question safe to serve in
 * a test?" — both test creation (as validation) and test reads (as filtering)
 * route through it so behavior never drifts between write and read paths.
 *
 * Reasons are human-readable and intended purely for logs / error context:
 *   - 'missing'           — id doesn't correspond to any Question document
 *   - 'inactive-question' — question.isActive === false
 *   - 'missing-subject'   — question.subjectId no longer resolves
 *   - 'inactive-subject'  — subject.isActive === false
 *   - 'missing-topic'     — question.topicId no longer resolves
 *   - 'inactive-topic'    — topic.isActive === false
 */
async function classifyQuestions(ids) {
  const uniqueIds = [...new Set((ids || []).map(String))];
  if (uniqueIds.length === 0) {
    return { valid: [], invalid: [] };
  }

  const questions = await questionRepository.findByIdsRaw(uniqueIds);
  const qMap = new Map(questions.map((q) => [String(q._id), q]));

  // Batch-fetch all subjects/topics referenced by these questions so we only
  // hit Mongo twice regardless of the question count.
  const subjectIds = [...new Set(questions.map((q) => String(q.subjectId)))];
  const topicIds = [...new Set(questions.map((q) => String(q.topicId)))];
  const [subjects, topics] = await Promise.all([
    subjectRepository.findByIds(subjectIds),
    topicRepository.findByIds(topicIds),
  ]);
  const subjectMap = new Map(subjects.map((s) => [String(s._id), s]));
  const topicMap = new Map(topics.map((t) => [String(t._id), t]));

  const valid = [];
  const invalid = [];

  for (const id of uniqueIds) {
    const q = qMap.get(id);
    if (!q) {
      invalid.push({ id, reason: 'missing' });
      continue;
    }
    if (q.isActive === false) {
      invalid.push({ id, reason: 'inactive-question' });
      continue;
    }
    const subject = subjectMap.get(String(q.subjectId));
    if (!subject) {
      invalid.push({ id, reason: 'missing-subject', subjectId: String(q.subjectId) });
      continue;
    }
    if (subject.isActive === false) {
      invalid.push({ id, reason: 'inactive-subject', subjectId: String(q.subjectId) });
      continue;
    }
    const topic = topicMap.get(String(q.topicId));
    if (!topic) {
      invalid.push({ id, reason: 'missing-topic', topicId: String(q.topicId) });
      continue;
    }
    if (topic.isActive === false) {
      invalid.push({ id, reason: 'inactive-topic', topicId: String(q.topicId) });
      continue;
    }
    valid.push(id);
  }

  return { valid, invalid };
}

/**
 * Given a test doc (lean), return a shallow clone with `questionIds` narrowed
 * to the currently-servable set. Preserves original ordering; silently drops
 * ids that fail the hierarchy check.
 */
async function withFilteredQuestionIds(test) {
  if (!test) return test;
  const raw = (test.questionIds || []).map(String);
  if (raw.length === 0) return test;
  const { valid } = await classifyQuestions(raw);
  const validSet = new Set(valid);
  const filtered = (test.questionIds || []).filter((id) =>
    validSet.has(String(id))
  );
  return { ...test, questionIds: filtered };
}

export const testService = {
  /**
   * List all tests with questionIds filtered down to active-only. We don't
   * remove tests that have zero valid questions — admins still need to see
   * them so they can re-populate or retire them. The client can decide.
   */
  async list() {
    const tests = await testRepository.findAll({});
    if (!tests.length) return tests;

    // Aggregate all ids across all tests and classify once; then rebuild
    // each test's questionIds against the shared valid set. O(1) Mongo
    // round-trips regardless of how many tests are listed.
    const allIds = [...new Set(tests.flatMap((t) => (t.questionIds || []).map(String)))];
    const { valid } = await classifyQuestions(allIds);
    const validSet = new Set(valid);

    return tests.map((t) => ({
      ...t,
      questionIds: (t.questionIds || []).filter((id) => validSet.has(String(id))),
    }));
  },

  async getById(id) {
    const test = await testRepository.findById(id);
    if (!test) {
      throw new AppError('Test not found', HTTP_STATUS.NOT_FOUND);
    }
    return withFilteredQuestionIds(test);
  },

  async create(data) {
    const { title, type, questionIds, duration, negativeMarking } = data;

    const uniqueIds = [...new Set(questionIds.map((id) => String(id)))];
    if (uniqueIds.length !== questionIds.length) {
      throw new AppError('Duplicate questionIds are not allowed', HTTP_STATUS.BAD_REQUEST);
    }

    const { valid, invalid } = await classifyQuestions(uniqueIds);

    if (invalid.length > 0) {
      // Keep logs structured but compact so production log aggregators can
      // parse them. One line per bad reference is enough — they share a
      // reason + id, nothing secret.
      for (const entry of invalid) {
        console.warn('[test.create] invalid question reference', entry);
      }
      throw new AppError(
        'Test contains inactive or invalid questions',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Defensive sanity check: classifyQuestions should have returned every id
    // through either valid or invalid. If a mismatch ever slips through, fail
    // loudly instead of silently shipping a half-broken test.
    if (valid.length !== uniqueIds.length) {
      throw new AppError(
        'Test contains inactive or invalid questions',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    return testRepository.create({
      title: title.trim(),
      type,
      questionIds: uniqueIds,
      duration,
      negativeMarking: negativeMarking ?? 0,
    });
  },
};
