import mongoose from 'mongoose';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import {
  PRACTICE_ISSUANCE_MAX_QUESTIONS,
  PRACTICE_ISSUANCE_TTL_MS,
} from '../constants/practiceIssuance.js';
import { AppError } from '../utils/AppError.js';
import { questionRepository } from '../repositories/questionRepository.js';
import { testAttemptRepository } from '../repositories/testAttemptRepository.js';
import { practiceIssuanceRepository } from '../repositories/practiceIssuanceRepository.js';
import { logSecurityEvent } from '../utils/logger.js';

const ALLOWED_TYPES = new Set(['topic', 'smart', 'weak', 'daily', 'practice', 'retry', 'battle']);

function normalizePracticeType(raw) {
  const t = String(raw ?? 'practice')
    .trim()
    .toLowerCase();
  return t || 'practice';
}

function expiresAtFromNow() {
  return new Date(Date.now() + PRACTICE_ISSUANCE_TTL_MS);
}

function toOidArray(orderedIds) {
  const out = [];
  for (const id of orderedIds) {
    const s = String(id);
    if (!mongoose.Types.ObjectId.isValid(s)) {
      throw new AppError('Invalid question id in issuance', HTTP_STATUS.BAD_REQUEST);
    }
    out.push(new mongoose.Types.ObjectId(s));
  }
  return out;
}

export const practiceIssuanceService = {
  /**
   * Persist provenance for a server-ordered question list (already filtered active upstream).
   * @param {string} userId
   * @param {string} practiceType
   * @param {import('mongoose').Types.ObjectId[]} orderedQuestionIds
   * @param {{ sourceAttemptId?: string|null, allowInactiveScoring?: boolean, battleSessionId?: string|null }} [opts]
   */
  async createIssuance(userId, practiceType, orderedQuestionIds, opts = {}) {
    const type = normalizePracticeType(practiceType);
    if (!ALLOWED_TYPES.has(type)) {
      throw new AppError('Invalid practiceType', HTTP_STATUS.BAD_REQUEST);
    }
    if (type === 'retry' && !opts.sourceAttemptId) {
      throw new AppError('sourceAttemptId is required for retry issuance', HTTP_STATUS.BAD_REQUEST);
    }
    if (type === 'battle' && !opts.battleSessionId) {
      throw new AppError('battleSessionId is required for battle issuance', HTTP_STATUS.BAD_REQUEST);
    }
    if (!Array.isArray(orderedQuestionIds) || orderedQuestionIds.length === 0) {
      throw new AppError('questionIds must be a non-empty ordered list', HTTP_STATUS.BAD_REQUEST);
    }
    if (orderedQuestionIds.length > PRACTICE_ISSUANCE_MAX_QUESTIONS) {
      throw new AppError(
        `At most ${PRACTICE_ISSUANCE_MAX_QUESTIONS} questions per practice session`,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const oids = orderedQuestionIds.every((x) => x instanceof mongoose.Types.ObjectId)
      ? orderedQuestionIds
      : toOidArray(orderedQuestionIds);

    const doc = await practiceIssuanceRepository.create({
      userId: new mongoose.Types.ObjectId(String(userId)),
      practiceType: type,
      questionIds: oids,
      sourceAttemptId: opts.sourceAttemptId
        ? new mongoose.Types.ObjectId(String(opts.sourceAttemptId))
        : null,
      battleSessionId: opts.battleSessionId
        ? new mongoose.Types.ObjectId(String(opts.battleSessionId))
        : null,
      allowInactiveScoring: Boolean(opts.allowInactiveScoring),
      expiresAt: expiresAtFromNow(),
    });

    return doc;
  },

  /**
   * POST /practice/issue — client supplies ordered ids from an earlier read (topic / generic).
   * All must be active questions; order preserved.
   */
  async issueFromClientQuestionIds(userId, { practiceType, questionIds }) {
    const type = normalizePracticeType(practiceType);
    if (type === 'retry') {
      throw new AppError('Use retry issuance with sourceAttemptId', HTTP_STATUS.BAD_REQUEST);
    }
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      throw new AppError('questionIds is required', HTTP_STATUS.BAD_REQUEST);
    }
    if (questionIds.length > PRACTICE_ISSUANCE_MAX_QUESTIONS) {
      throw new AppError(
        `At most ${PRACTICE_ISSUANCE_MAX_QUESTIONS} questions per practice session`,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const idStrings = questionIds.map((id) => String(id).trim());
    for (const s of idStrings) {
      if (!mongoose.Types.ObjectId.isValid(s)) {
        throw new AppError('Each questionId must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST);
      }
    }

    const active = await questionRepository.findActiveByIds(idStrings);
    if (active.length !== idStrings.length) {
      logSecurityEvent('practice_issue_inactive_or_missing', {
        userIdSuffix: String(userId).slice(-8),
        requested: idStrings.length,
        resolvedActive: active.length,
      });
      throw new AppError(
        'One or more questions are inactive or unavailable for new practice',
        HTTP_STATUS.BAD_REQUEST,
        null,
        { code: 'PRACTICE_ISSUE_QUESTIONS_UNAVAILABLE' }
      );
    }

    const doc = await this.createIssuance(userId, type, idStrings, {
      allowInactiveScoring: false,
    });

    return {
      practiceSessionId: String(doc._id),
      expiresAt: doc.expiresAt,
      practiceType: doc.practiceType,
    };
  },

  /**
   * Retry subset: every id must appear on the owned source attempt's question list.
   */
  async issueRetrySubset(userId, { sourceAttemptId, questionIds }) {
    if (!mongoose.Types.ObjectId.isValid(String(sourceAttemptId))) {
      throw new AppError('Invalid sourceAttemptId', HTTP_STATUS.BAD_REQUEST);
    }
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      throw new AppError('questionIds is required', HTTP_STATUS.BAD_REQUEST);
    }
    if (questionIds.length > PRACTICE_ISSUANCE_MAX_QUESTIONS) {
      throw new AppError(
        `At most ${PRACTICE_ISSUANCE_MAX_QUESTIONS} questions per retry session`,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const attempt = await testAttemptRepository.findById(sourceAttemptId);
    if (!attempt) {
      logSecurityEvent('practice_issue_retry_attempt_not_found', {
        userIdSuffix: String(userId).slice(-8),
      });
      throw new AppError('Attempt not found', HTTP_STATUS.NOT_FOUND);
    }
    if (String(attempt.userId) !== String(userId)) {
      logSecurityEvent('practice_issue_retry_attempt_wrong_user', {
        userIdSuffix: String(userId).slice(-8),
      });
      throw new AppError('Forbidden', HTTP_STATUS.FORBIDDEN);
    }

    const allowed = new Set((attempt.questionIds || []).map((id) => String(id)));
    const ordered = questionIds.map((id) => String(id).trim());
    for (const s of ordered) {
      if (!mongoose.Types.ObjectId.isValid(s)) {
        throw new AppError('Each questionId must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST);
      }
      if (!allowed.has(s)) {
        logSecurityEvent('practice_issue_retry_question_not_in_attempt', {
          userIdSuffix: String(userId).slice(-8),
          attemptIdSuffix: String(sourceAttemptId).slice(-8),
        });
        throw new AppError(
          'questionIds must be drawn from the source attempt only',
          HTTP_STATUS.BAD_REQUEST,
          null,
          { code: 'PRACTICE_ISSUE_RETRY_OUT_OF_SCOPE' }
        );
      }
    }

    const doc = await this.createIssuance(userId, 'retry', ordered, {
      sourceAttemptId: String(sourceAttemptId),
      allowInactiveScoring: true,
    });

    return {
      practiceSessionId: String(doc._id),
      expiresAt: doc.expiresAt,
      practiceType: 'retry',
      sourceAttemptId: String(sourceAttemptId),
    };
  },

  /** POST /practice/issue — dispatch retry vs generic issuance. */
  async issueFromRequest(userId, body) {
    const practiceType = String(body?.practiceType ?? '')
      .trim()
      .toLowerCase();
    if (practiceType === 'retry') {
      return this.issueRetrySubset(userId, {
        sourceAttemptId: body.sourceAttemptId,
        questionIds: body.questionIds,
      });
    }
    if (practiceType === 'battle') {
      throw new AppError('Battle sessions are started via POST /battles/:id/start', HTTP_STATUS.BAD_REQUEST);
    }
    return this.issueFromClientQuestionIds(userId, {
      practiceType,
      questionIds: body.questionIds,
    });
  },
};
