import mongoose from 'mongoose';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { PRACTICE_ISSUANCE_MAX_SCRATCH_REVEALS } from '../constants/practiceIssuance.js';
import { AppError } from '../utils/AppError.js';
import { questionRepository } from '../repositories/questionRepository.js';
import { topicRepository } from '../repositories/topicRepository.js';
import { subjectRepository } from '../repositories/subjectRepository.js';
import { learningSessionService } from './learningSessionService.js';
import { getCanonicalTopicResolver } from './canonicalTopicResolver.js';
import { scoreQuestionSession } from '../utils/questionScoring.js';
import { practiceIssuanceRepository } from '../repositories/practiceIssuanceRepository.js';
import { battleService } from './battleService.js';
import { logSecurityEvent } from '../utils/logger.js';

const PRACTICE_REVEAL_MAX_QUESTIONS = 50;

const ALLOWED_PRACTICE_TYPES = new Set([
  'topic',
  'smart',
  'weak',
  'daily',
  'practice',
  'retry',
  'battle',
]);

function normalizeRef(ref) {
  if (ref == null) return ref;
  if (typeof ref === 'object' && ref !== null && ref._id != null) {
    const { _id, name } = ref;
    return name != null ? { _id, name } : _id;
  }
  return ref;
}

function normalizeSelectionIndexes(raw) {
  const list = Array.isArray(raw) ? raw : raw != null && raw !== '' ? [raw] : [];
  const out = [];
  for (const v of list) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0) out.push(n);
  }
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

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

function normalizeKey(k) {
  if (k == null) return '';
  return String(k).trim();
}

function orderedIdsEqual(issued, submitted) {
  const a = issued.map((id) => String(id));
  const b = submitted.map((id) => String(id));
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Small, non-sensitive retry metadata for snapshots (no arbitrary nesting).
 * @param {unknown} raw
 */
export function sanitizeRetryMetaForReveal(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    logSecurityEvent('practice_reveal_retry_meta_rejected', { reason: 'type' });
    return null;
  }
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (n >= 14) break;
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(k)) continue;
    if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) {
      out[k] = v;
    } else if (typeof v === 'string' && v.length <= 220) {
      out[k] = v;
    }
    n += 1;
  }
  return Object.keys(out).length ? out : null;
}

export const practiceRevealService = {
  /**
   * Score a completed practice session and return review-safe reveal payload.
   * Requires a server-issued `practiceSessionId` (PracticeIssuance).
   */
  async reveal(userId, body) {
    const practiceSessionId = String(body?.practiceSessionId ?? '').trim();
    if (!mongoose.Types.ObjectId.isValid(practiceSessionId)) {
      logSecurityEvent('practice_reveal_provenance_failure', {
        reason: 'missing_practice_session',
      });
      throw new AppError(
        'practiceSessionId is required',
        HTTP_STATUS.BAD_REQUEST,
        null,
        { code: 'PRACTICE_SESSION_REQUIRED' }
      );
    }

    const issuance = await practiceIssuanceRepository.findByIdForUser(practiceSessionId, userId);
    if (!issuance) {
      logSecurityEvent('practice_reveal_provenance_failure', {
        reason: 'issuance_not_found',
        userIdSuffix: String(userId).slice(-8),
      });
      throw new AppError('Practice session not found or expired', HTTP_STATUS.NOT_FOUND, null, {
        code: 'PRACTICE_ISSUANCE_NOT_FOUND',
      });
    }

    if (!issuance.expiresAt || new Date(issuance.expiresAt).getTime() < Date.now()) {
      logSecurityEvent('practice_reveal_provenance_failure', {
        reason: 'issuance_expired',
        userIdSuffix: String(userId).slice(-8),
      });
      throw new AppError('Practice session has expired. Start a new session.', HTTP_STATUS.GONE, null, {
        code: 'PRACTICE_ISSUANCE_EXPIRED',
      });
    }

    const clientSessionKey = normalizeKey(body?.clientSessionKey).slice(0, 128);
    const wasFinalized = issuance.revealFinalized === true;

    if (wasFinalized) {
      if (clientSessionKey !== normalizeKey(issuance.idempotentKey)) {
        logSecurityEvent('practice_reveal_finalized_key_mismatch', {
          userIdSuffix: String(userId).slice(-8),
          issuanceSuffix: String(issuance._id).slice(-8),
        });
        throw new AppError(
          'This practice session was already scored. Use the same clientSessionKey to retry safely.',
          HTTP_STATUS.CONFLICT,
          null,
          { code: 'PRACTICE_REVEAL_ALREADY_FINALIZED' }
        );
      }
    }

    const rawBodyIds = Array.isArray(body?.questionIds) ? body.questionIds : [];
    const bodyQuestionIds = rawBodyIds.map((id) => String(id).trim()).filter(Boolean);
    if (!orderedIdsEqual(issuance.questionIds, bodyQuestionIds)) {
      logSecurityEvent('practice_reveal_provenance_failure', {
        reason: 'question_order_mismatch',
        userIdSuffix: String(userId).slice(-8),
        issuanceSuffix: String(issuance._id).slice(-8),
        issuedLen: issuance.questionIds?.length ?? 0,
        bodyLen: bodyQuestionIds.length,
      });
      throw new AppError(
        'questionIds must exactly match the issued practice session (same ids, same order).',
        HTTP_STATUS.BAD_REQUEST,
        null,
        { code: 'PRACTICE_REVEAL_QUESTION_MISMATCH' }
      );
    }

    const issuedType = String(issuance.practiceType || '').toLowerCase();
    if (!ALLOWED_PRACTICE_TYPES.has(issuedType)) {
      throw new AppError('Invalid issuance practiceType', HTTP_STATUS.BAD_REQUEST);
    }

    const bodyTypeRaw =
      typeof body?.practiceType === 'string' && body.practiceType.trim()
        ? body.practiceType.trim().toLowerCase()
        : null;
    if (bodyTypeRaw && bodyTypeRaw !== issuedType) {
      logSecurityEvent('practice_reveal_provenance_failure', {
        reason: 'practice_type_mismatch',
        userIdSuffix: String(userId).slice(-8),
        issuedType,
        bodyType: bodyTypeRaw,
      });
      throw new AppError('practiceType does not match the issued practice session', HTTP_STATUS.BAD_REQUEST);
    }

    if (issuedType === 'retry') {
      const sid = issuance.sourceAttemptId ? String(issuance.sourceAttemptId) : '';
      const bodyAttempt =
        body?.sourceAttemptId && mongoose.Types.ObjectId.isValid(String(body.sourceAttemptId))
          ? String(body.sourceAttemptId)
          : null;
      if (!sid || !bodyAttempt || sid !== bodyAttempt) {
        logSecurityEvent('practice_reveal_retry_attempt_mismatch', {
          userIdSuffix: String(userId).slice(-8),
        });
        throw new AppError(
          'sourceAttemptId must match the retry practice session',
          HTTP_STATUS.BAD_REQUEST,
          null,
          { code: 'PRACTICE_REVEAL_RETRY_ATTEMPT_MISMATCH' }
        );
      }
    }

    if (issuedType === 'battle') {
      if (!issuance.battleSessionId) {
        throw new AppError('Invalid battle practice session', HTTP_STATUS.BAD_REQUEST);
      }
    }

    if (!wasFinalized) {
      const incOk = await practiceIssuanceRepository.incrementScratchAttempts(issuance._id, {
        maxScratch: PRACTICE_ISSUANCE_MAX_SCRATCH_REVEALS,
      });
      if (!incOk) {
        logSecurityEvent('practice_reveal_scratch_budget_exceeded', {
          userIdSuffix: String(userId).slice(-8),
          issuanceSuffix: String(issuance._id).slice(-8),
        });
        throw new AppError(
          'Too many reveal attempts for this practice session.',
          HTTP_STATUS.TOO_MANY_REQUESTS,
          null,
          { code: 'PRACTICE_REVEAL_ATTEMPT_LIMIT' }
        );
      }
    }

    const questionIds = issuance.questionIds.map((id) =>
      id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id))
    );

    if (questionIds.length === 0 || questionIds.length > PRACTICE_REVEAL_MAX_QUESTIONS) {
      throw new AppError('Invalid question count for this session', HTTP_STATUS.BAD_REQUEST);
    }

    const userAnswersByQid = buildUserAnswersByQid(body?.userAnswers, questionIds);

    const useInactiveAwareFetch = issuance.allowInactiveScoring === true;
    const questions = useInactiveAwareFetch
      ? await questionRepository.findByIdsForScoring(questionIds)
      : await questionRepository.findActiveByIds(questionIds);

    const qMap = new Map(questions.map((q) => [q._id.toString(), q]));
    const missing = questionIds.filter((id) => !qMap.has(id.toString()));
    if (missing.length > 0) {
      logSecurityEvent('practice_reveal_questions_unavailable', {
        userIdSuffix: String(userId).slice(-8),
        inactiveAware: useInactiveAwareFetch,
        missingCount: missing.length,
      });
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
      issuedType === 'retry'
        ? sanitizeRetryMetaForReveal(body?.retryMeta && typeof body.retryMeta === 'object' ? body.retryMeta : null)
        : null;

    const sourceAttemptId =
      issuedType === 'retry' && issuance.sourceAttemptId
        ? String(issuance.sourceAttemptId)
        : null;

    const { learningSessionId } = await learningSessionService.persistFromReveal(
      userId,
      null,
      {
        sessionType: issuedType,
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
        clientSessionKey: clientSessionKey || null,
      }
    );

    if (!wasFinalized) {
      await practiceIssuanceRepository.finalizeReveal(String(issuance._id), {
        idempotentKey: clientSessionKey,
        linkedLearningSessionId: learningSessionId,
      });
    }

    let battleOutcome = null;
    if (issuedType === 'battle' && issuance.battleSessionId && !wasFinalized) {
      battleOutcome = await battleService.onRevealComplete({
        userId,
        battleSessionId: String(issuance.battleSessionId),
        learningSessionId,
        summary,
        startedAt: null,
      });
    }

    return {
      practiceType: issuedType,
      summary,
      correctAnswers,
      weakTopics: weakTopicsOut,
      reviewQuestions,
      learningSessionId,
      immutableAttemptSnapshot: true,
      ...(battleOutcome?.battle ? { battle: battleOutcome.battle } : {}),
      ...(battleOutcome?.winnerUserId != null
        ? { battleWinnerUserId: battleOutcome.winnerUserId }
        : {}),
    };
  },
};
