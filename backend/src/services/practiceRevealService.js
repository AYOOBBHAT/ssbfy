import mongoose from 'mongoose';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { questionRepository } from '../repositories/questionRepository.js';
import { topicRepository } from '../repositories/topicRepository.js';
import { subjectRepository } from '../repositories/subjectRepository.js';
import { learningSessionService } from './learningSessionService.js';
import { getCanonicalTopicResolver } from './canonicalTopicResolver.js';
import { scoreQuestionSession } from '../utils/questionScoring.js';

const PRACTICE_REVEAL_MAX_QUESTIONS = 50;

const ALLOWED_PRACTICE_TYPES = new Set([
  'topic',
  'smart',
  'weak',
  'daily',
  'practice',
  'retry',
]);

function dedupeQuestionIds(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    const s = String(id);
    if (!mongoose.Types.ObjectId.isValid(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(new mongoose.Types.ObjectId(s));
  }
  return out;
}

function normalizeRef(ref) {
  if (ref == null) return ref;
  if (typeof ref === 'object' && ref !== null && ref._id != null) {
    const { _id, name } = ref;
    return name != null ? { _id, name } : _id;
  }
  return ref;
}

/**
 * @param {unknown} raw
 * @returns {number[]}
 */
function normalizeSelectionIndexes(raw) {
  const list = Array.isArray(raw) ? raw : raw != null && raw !== '' ? [raw] : [];
  const out = [];
  for (const v of list) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0) out.push(n);
  }
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

/**
 * Parse client userAnswers; ignores keys outside the session questionIds set.
 * @param {unknown} userAnswers
 * @param {Set<string>} allowedQids
 * @returns {Map<string, number[]>}
 */
function parseUserAnswersEntries(userAnswers, allowedQids) {
  if (userAnswers == null || typeof userAnswers !== 'object' || Array.isArray(userAnswers)) {
    throw new AppError('userAnswers must be an object', HTTP_STATUS.BAD_REQUEST);
  }

  const map = new Map();
  for (const [key, val] of Object.entries(userAnswers)) {
    const qid = String(key).trim();
    if (!mongoose.Types.ObjectId.isValid(qid)) {
      throw new AppError(`Invalid questionId in userAnswers: ${key}`, HTTP_STATUS.BAD_REQUEST);
    }
    if (!allowedQids.has(qid)) {
      continue;
    }
    map.set(qid, normalizeSelectionIndexes(val));
  }
  return map;
}

/**
 * One entry per session question (missing keys → unanswered).
 * @param {unknown} userAnswers
 * @param {import('mongoose').Types.ObjectId[]} questionIds
 */
function buildUserAnswersByQid(userAnswers, questionIds) {
  const allowedQids = new Set(questionIds.map((id) => id.toString()));
  const parsed = parseUserAnswersEntries(userAnswers, allowedQids);
  const map = new Map();
  for (const qid of questionIds) {
    const sid = qid.toString();
    map.set(sid, parsed.get(sid) || []);
  }
  return map;
}

/**
 * Post-completion review projection — includes explanation; never embeds correct indexes.
 * @param {object} q
 * @param {Map<string, { name?: string }>} topicNameById
 */
function buildReviewQuestion(q, topicNameById) {
  const tid = q.topicId != null ? String(q.topicId) : null;
  const topicName = tid ? topicNameById.get(tid)?.name : null;
  const topicRef =
    tid != null
      ? topicName
        ? { _id: q.topicId, name: topicName }
        : q.topicId
      : null;

  return {
    _id: q._id,
    questionText: q.questionText ?? '',
    options: Array.isArray(q.options) ? [...q.options] : [],
    questionType: q.questionType || 'single_correct',
    questionImage: q.questionImage || '',
    explanation: typeof q.explanation === 'string' ? q.explanation : '',
    topicId: topicRef,
    ...(topicName ? { topicName } : {}),
    subjectId: normalizeRef(q.subjectId),
    postIds: Array.isArray(q.postIds)
      ? q.postIds.map((p) => (p && typeof p === 'object' && p._id != null ? p._id : p))
      : [],
  };
}

export const practiceRevealService = {
  /**
   * Score a completed practice session and return review-safe reveal payload.
   * Answers must never be exposed before this call.
   *
   * Idempotent: identical questionIds + userAnswers yields the same scoring output
   * (safe to retry after network failure; no server-side session mutation).
   */
  async reveal(userId, body) {

    const rawIds = Array.isArray(body?.questionIds) ? body.questionIds : [];
    const questionIds = dedupeQuestionIds(rawIds);

    if (questionIds.length === 0) {
      throw new AppError('questionIds must include at least one valid id', HTTP_STATUS.BAD_REQUEST);
    }
    if (questionIds.length > PRACTICE_REVEAL_MAX_QUESTIONS) {
      throw new AppError(
        `questionIds cannot exceed ${PRACTICE_REVEAL_MAX_QUESTIONS} items`,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const practiceType =
      typeof body?.practiceType === 'string' && body.practiceType.trim()
        ? body.practiceType.trim().toLowerCase()
        : 'practice';
    if (!ALLOWED_PRACTICE_TYPES.has(practiceType)) {
      throw new AppError('Invalid practiceType', HTTP_STATUS.BAD_REQUEST);
    }

    const userAnswersByQid = buildUserAnswersByQid(body?.userAnswers, questionIds);

    const questions = await questionRepository.findByIdsForScoring(questionIds);
    const qMap = new Map(questions.map((q) => [q._id.toString(), q]));

    const missing = questionIds.filter((id) => !qMap.has(id.toString()));
    if (missing.length > 0) {
      throw new AppError(
        'Some questions are no longer available for review. Start a new practice session.',
        HTTP_STATUS.BAD_REQUEST,
        null,
        {
          code: 'PRACTICE_QUESTIONS_UNAVAILABLE',
          unavailableQuestionIds: missing.map((id) => String(id)),
        }
      );
    }

    const { correctAnswers, weakTopics, summary } = scoreQuestionSession({
      orderedQuestionIds: questionIds,
      questionsById: qMap,
      userAnswersByQid,
      negativeMarking: 0,
    });

    const topicIds = [
      ...new Set(
        questions.map((q) => (q.topicId != null ? String(q.topicId) : null)).filter(Boolean)
      ),
    ];
    const subjectIds = [
      ...new Set(
        questions.map((q) => (q.subjectId != null ? String(q.subjectId) : null)).filter(Boolean)
      ),
    ];
    const topicDocs = topicIds.length ? await topicRepository.findNamesByIds(topicIds) : [];
    const subjectDocs = subjectIds.length ? await subjectRepository.findNamesByIds(subjectIds) : [];
    const topicNameById = new Map(
      topicDocs.map((t) => [String(t._id), { name: typeof t.name === 'string' ? t.name : '' }])
    );
    const subjectNameById = new Map(
      subjectDocs.map((s) => [String(s._id), { name: typeof s.name === 'string' ? s.name : '' }])
    );

    const canonicalResolver = await getCanonicalTopicResolver();
    const canonicalTopicIdByTopicId = new Map();
    for (const q of questions) {
      if (q.topicId == null) continue;
      const tid = String(q.topicId);
      const cid = canonicalResolver.resolveCanonicalId(tid);
      if (cid) canonicalTopicIdByTopicId.set(tid, cid);
    }

    const reviewQuestions = questionIds
      .map((id) => qMap.get(id.toString()))
      .filter(Boolean)
      .map((q) => buildReviewQuestion(q, topicNameById));

    const weakTopicsOut = weakTopics.map((w) => {
      const tid = String(w.topicId);
      const name = topicNameById.get(tid)?.name;
      const canonicalTopicId = canonicalResolver.resolveCanonicalId(tid);
      return {
        topicId: w.topicId,
        ...(canonicalTopicId ? { canonicalTopicId } : {}),
        mistakeCount: w.mistakeCount,
        ...(name ? { topicName: name } : {}),
      };
    });

    const retryMeta =
      body?.retryMeta && typeof body.retryMeta === 'object' ? body.retryMeta : null;
    const sourceAttemptId =
      body?.sourceAttemptId && mongoose.Types.ObjectId.isValid(String(body.sourceAttemptId))
        ? String(body.sourceAttemptId)
        : retryMeta?.sourceAttemptId &&
          mongoose.Types.ObjectId.isValid(String(retryMeta.sourceAttemptId))
        ? String(retryMeta.sourceAttemptId)
        : null;

    const clientSessionKey =
      typeof body?.clientSessionKey === 'string' && body.clientSessionKey.trim()
        ? body.clientSessionKey.trim().slice(0, 128)
        : null;

    const { learningSessionId } = await learningSessionService.persistFromReveal(
      userId,
      null,
      {
        sessionType: practiceType,
        questionIds,
        questionsById: qMap,
        userAnswersByQid,
        correctAnswers,
        weakTopics: weakTopicsOut,
        summary,
        retryMeta,
        sourceAttemptId,
        topicNameById,
        subjectNameById,
        canonicalTopicIdByTopicId,
        clientSessionKey,
      }
    );

    return {
      practiceType,
      summary,
      correctAnswers,
      weakTopics: weakTopicsOut,
      reviewQuestions,
      learningSessionId,
      immutableAttemptSnapshot: true,
    };
  },
};
