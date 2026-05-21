import crypto from 'crypto';
import mongoose from 'mongoose';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import {
  BATTLE_DEEP_LINK_SCHEME,
  BATTLE_EXPIRY_MS,
  BATTLE_FREE_CREATE_PER_DAY,
  BATTLE_FREE_JOIN_PER_DAY,
  BATTLE_INVITE_CODE_CHARS,
  BATTLE_INVITE_CODE_LENGTH,
  BATTLE_MAX_QUESTIONS,
  BATTLE_MIN_QUESTIONS,
  BATTLE_TIMER_MODES,
  BATTLE_WEB_INVITE_BASE,
} from '../constants/battle.js';
import { DIFFICULTY_VALUES } from '../constants/difficulty.js';
import { AppError } from '../utils/AppError.js';
import { isPremiumUser } from '../utils/freeTierAccess.js';
import { logSecurityEvent } from '../utils/logger.js';
import { battleSessionRepository } from '../repositories/battleSessionRepository.js';
import { battleUsageRepository } from '../repositories/battleUsageRepository.js';
import { questionRepository } from '../repositories/questionRepository.js';
import { subjectRepository } from '../repositories/subjectRepository.js';
import { topicRepository } from '../repositories/topicRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { practiceIssuanceService } from './practiceIssuanceService.js';
import { projectPublicQuestions } from './questionService.js';
import { learningSessionRepository } from '../repositories/learningSessionRepository.js';

const INVITE_MAX_ATTEMPTS = 12;

function buildQuestionMatch({ subjectId, topicId, difficulty }) {
  const match = { isActive: true };
  match.subjectId = new mongoose.Types.ObjectId(String(subjectId));
  match.topicId = new mongoose.Types.ObjectId(String(topicId));
  const d = difficulty != null ? String(difficulty).trim().toLowerCase() : '';
  if (d && d !== 'all') {
    if (!DIFFICULTY_VALUES.includes(d)) {
      throw new AppError('Invalid difficulty', HTTP_STATUS.BAD_REQUEST);
    }
    match.difficulty = d;
  }
  return match;
}

function generateInviteCode() {
  const chars = BATTLE_INVITE_CODE_CHARS;
  const bytes = crypto.randomBytes(BATTLE_INVITE_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < BATTLE_INVITE_CODE_LENGTH; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function inviteLinks(inviteCode) {
  const code = String(inviteCode).toUpperCase();
  return {
    deepLink: `${BATTLE_DEEP_LINK_SCHEME}://battle/${code}`,
    webLink: `${BATTLE_WEB_INVITE_BASE}/${code}`,
  };
}

function assertBattleNotExpired(battle) {
  if (!battle?.expiresAt) {
    throw new AppError('Battle not found', HTTP_STATUS.NOT_FOUND);
  }
  if (new Date(battle.expiresAt).getTime() < Date.now() || battle.status === 'expired') {
    throw new AppError('This battle has expired', HTTP_STATUS.GONE, null, {
      code: 'BATTLE_EXPIRED',
    });
  }
}

function roleForUser(battle, userId) {
  const uid = String(userId);
  if (String(battle.creatorUserId) === uid) return 'creator';
  if (battle.opponentUserId && String(battle.opponentUserId) === uid) return 'opponent';
  return null;
}

/**
 * Deterministic winner: score → time → fewer wrong.
 * @returns {string|null} winner userId or null for tie
 */
export function computeBattleWinner(creator, opponent) {
  if (!creator?.completed || !opponent?.completed) return null;

  const cScore = Number(creator.score) || 0;
  const oScore = Number(opponent.score) || 0;
  if (cScore > oScore) return creator.userId;
  if (oScore > cScore) return opponent.userId;

  const cTime = Number(creator.timeTakenMs) ?? Number.MAX_SAFE_INTEGER;
  const oTime = Number(opponent.timeTakenMs) ?? Number.MAX_SAFE_INTEGER;
  if (cTime < oTime) return creator.userId;
  if (oTime < cTime) return opponent.userId;

  const cWrong = Number(creator.incorrect) || 0;
  const oWrong = Number(opponent.incorrect) || 0;
  if (cWrong < oWrong) return creator.userId;
  if (oWrong < cWrong) return opponent.userId;

  return null;
}

function toPublicBattle(battle, viewerUserId, { includeQuestionIds = false } = {}) {
  const role = roleForUser(battle, viewerUserId);
  const links = inviteLinks(battle.inviteCode);
  const out = {
    id: String(battle._id),
    inviteCode: battle.inviteCode,
    status: battle.status,
    subjectId: String(battle.subjectId),
    topicId: String(battle.topicId),
    difficulty: battle.difficulty || 'all',
    questionCount: battle.questionCount,
    timerMode: battle.timerMode || 'none',
    timerSeconds: battle.timerSeconds ?? null,
    creatorUserId: String(battle.creatorUserId),
    opponentUserId: battle.opponentUserId ? String(battle.opponentUserId) : null,
    creatorAttemptId: battle.creatorAttemptId ? String(battle.creatorAttemptId) : null,
    opponentAttemptId: battle.opponentAttemptId ? String(battle.opponentAttemptId) : null,
    creatorScore: battle.creatorScore ?? null,
    opponentScore: battle.opponentScore ?? null,
    winnerUserId: battle.winnerUserId ? String(battle.winnerUserId) : null,
    expiresAt: battle.expiresAt,
    createdAt: battle.createdAt,
    viewerRole: role,
    ...links,
  };
  if (includeQuestionIds && role) {
    out.questionIds = (battle.questionIds || []).map((id) => String(id));
  }
  return out;
}

export const battleService = {
  async getQuota(userId) {
    const user = await userRepository.findById(userId);
    const premium = isPremiumUser(user);
    const dateKey = battleUsageRepository.utcDateKey();
    const usage = await battleUsageRepository.getOrCreate(userId, dateKey);
    return {
      premium,
      dateKey,
      createdToday: usage.createdCount ?? 0,
      joinedToday: usage.joinedCount ?? 0,
      createLimit: premium ? null : BATTLE_FREE_CREATE_PER_DAY,
      joinLimit: premium ? null : BATTLE_FREE_JOIN_PER_DAY,
      canCreate: premium || (usage.createdCount ?? 0) < BATTLE_FREE_CREATE_PER_DAY,
      canJoin: premium || (usage.joinedCount ?? 0) < BATTLE_FREE_JOIN_PER_DAY,
    };
  },

  async getAvailability({ subjectId, topicId, difficulty }) {
    if (!mongoose.Types.ObjectId.isValid(String(subjectId))) {
      throw new AppError('subjectId is required', HTTP_STATUS.BAD_REQUEST);
    }
    if (!mongoose.Types.ObjectId.isValid(String(topicId))) {
      throw new AppError('topicId is required', HTTP_STATUS.BAD_REQUEST);
    }
    const subject = await subjectRepository.findById(subjectId);
    if (!subject || subject.isActive === false) {
      throw new AppError('Subject not found', HTTP_STATUS.NOT_FOUND);
    }
    const topic = await topicRepository.findById(topicId);
    if (!topic || topic.isActive === false) {
      throw new AppError('Topic not found', HTTP_STATUS.NOT_FOUND);
    }
    if (String(topic.subjectId) !== String(subjectId)) {
      throw new AppError('Topic does not belong to subject', HTTP_STATUS.BAD_REQUEST);
    }
    const match = buildQuestionMatch({ subjectId, topicId, difficulty });
    const availableCount = await questionRepository.countActiveByMatch(match);
    return {
      availableCount,
      minQuestions: BATTLE_MIN_QUESTIONS,
      maxQuestions: BATTLE_MAX_QUESTIONS,
      canCreateBattle: availableCount >= BATTLE_MIN_QUESTIONS,
    };
  },

  async assertCanCreate(userId) {
    const user = await userRepository.findById(userId);
    if (isPremiumUser(user)) return;
    const dateKey = battleUsageRepository.utcDateKey();
    const usage = await battleUsageRepository.getOrCreate(userId, dateKey);
    if ((usage.createdCount ?? 0) >= BATTLE_FREE_CREATE_PER_DAY) {
      throw new AppError(
        'Free daily battle limit reached. Upgrade for unlimited battles.',
        HTTP_STATUS.FORBIDDEN,
        null,
        { code: 'BATTLE_CREATE_LIMIT' }
      );
    }
  },

  async assertCanJoin(userId) {
    const user = await userRepository.findById(userId);
    if (isPremiumUser(user)) return;
    const dateKey = battleUsageRepository.utcDateKey();
    const usage = await battleUsageRepository.getOrCreate(userId, dateKey);
    if ((usage.joinedCount ?? 0) >= BATTLE_FREE_JOIN_PER_DAY) {
      throw new AppError(
        'Free daily battle join limit reached. Upgrade for unlimited battles.',
        HTTP_STATUS.FORBIDDEN,
        null,
        { code: 'BATTLE_JOIN_LIMIT' }
      );
    }
  },

  async createBattle(userId, body) {
    await this.assertCanCreate(userId);

    const subjectId = String(body?.subjectId ?? '').trim();
    const topicId = String(body?.topicId ?? '').trim();
    const difficulty = body?.difficulty != null ? String(body.difficulty).trim().toLowerCase() : 'all';
    const questionCount = Math.floor(Number(body?.questionCount));
    const timerMode = String(body?.timerMode ?? 'none').trim().toLowerCase();
    const timerSeconds =
      body?.timerSeconds != null ? Math.floor(Number(body.timerSeconds)) : null;

    if (!mongoose.Types.ObjectId.isValid(subjectId) || !mongoose.Types.ObjectId.isValid(topicId)) {
      throw new AppError('subjectId and topicId are required', HTTP_STATUS.BAD_REQUEST);
    }
    if (
      !Number.isFinite(questionCount) ||
      questionCount < BATTLE_MIN_QUESTIONS ||
      questionCount > BATTLE_MAX_QUESTIONS
    ) {
      throw new AppError(
        `questionCount must be between ${BATTLE_MIN_QUESTIONS} and ${BATTLE_MAX_QUESTIONS}`,
        HTTP_STATUS.BAD_REQUEST
      );
    }
    if (!BATTLE_TIMER_MODES.includes(timerMode)) {
      throw new AppError('Invalid timerMode', HTTP_STATUS.BAD_REQUEST);
    }
    if (timerMode !== 'none') {
      if (!Number.isFinite(timerSeconds) || timerSeconds < 10 || timerSeconds > 7200) {
        throw new AppError('timerSeconds is required for timed battles (10–7200)', HTTP_STATUS.BAD_REQUEST);
      }
    }

    const match = buildQuestionMatch({ subjectId, topicId, difficulty });
    const poolSize = await questionRepository.countActiveByMatch(match);
    if (poolSize < questionCount) {
      throw new AppError(
        `Only ${poolSize} questions available for this topic and difficulty. Choose fewer questions.`,
        HTTP_STATUS.BAD_REQUEST,
        null,
        { code: 'BATTLE_INSUFFICIENT_QUESTIONS', availableCount: poolSize }
      );
    }

    const raw = await questionRepository.findRandomSmartPractice(match, questionCount);
    if (raw.length < questionCount) {
      throw new AppError(
        'Could not generate enough questions for this battle. Try again or reduce question count.',
        HTTP_STATUS.BAD_REQUEST,
        null,
        { code: 'BATTLE_INSUFFICIENT_QUESTIONS', availableCount: raw.length }
      );
    }

    const questionIds = raw.map((q) => q._id);

    let inviteCode = null;
    let battle = null;
    for (let attempt = 0; attempt < INVITE_MAX_ATTEMPTS; attempt += 1) {
      inviteCode = generateInviteCode();
      try {
        battle = await battleSessionRepository.create({
          inviteCode,
          creatorUserId: new mongoose.Types.ObjectId(String(userId)),
          status: 'waiting',
          subjectId: new mongoose.Types.ObjectId(subjectId),
          topicId: new mongoose.Types.ObjectId(topicId),
          difficulty: difficulty || 'all',
          questionIds,
          questionCount,
          timerMode,
          timerSeconds: timerMode === 'none' ? null : timerSeconds,
          expiresAt: new Date(Date.now() + BATTLE_EXPIRY_MS),
        });
        break;
      } catch (e) {
        if (e?.code === 11000 && attempt < INVITE_MAX_ATTEMPTS - 1) continue;
        throw e;
      }
    }

    await battleUsageRepository.incrementCreated(userId);

    return {
      battle: toPublicBattle(battle, userId, { includeQuestionIds: true }),
      questions: projectPublicQuestions(raw),
    };
  },

  async getByInviteCode(userId, inviteCode) {
    let battle = await battleSessionRepository.findByInviteCode(inviteCode);
    if (!battle) {
      throw new AppError('Battle not found', HTTP_STATUS.NOT_FOUND);
    }
    battle = await battleSessionRepository.markExpiredIfNeeded(battle);
    return { battle: toPublicBattle(battle, userId) };
  },

  async getById(userId, battleId) {
    if (!mongoose.Types.ObjectId.isValid(String(battleId))) {
      throw new AppError('Invalid battle id', HTTP_STATUS.BAD_REQUEST);
    }
    let battle = await battleSessionRepository.findById(battleId);
    if (!battle) {
      throw new AppError('Battle not found', HTTP_STATUS.NOT_FOUND);
    }
    battle = await battleSessionRepository.markExpiredIfNeeded(battle);
    const role = roleForUser(battle, userId);
    if (!role) {
      logSecurityEvent('battle_unauthorized_view', {
        userIdSuffix: String(userId).slice(-8),
        battleIdSuffix: String(battleId).slice(-8),
      });
      throw new AppError('Forbidden', HTTP_STATUS.FORBIDDEN);
    }
    return {
      battle: toPublicBattle(battle, userId, { includeQuestionIds: true }),
    };
  },

  async joinBattle(userId, inviteCode) {
    if (String(userId).length < 1) {
      throw new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED);
    }

    let battle = await battleSessionRepository.findByInviteCode(inviteCode);
    if (!battle) {
      throw new AppError('Battle not found', HTTP_STATUS.NOT_FOUND);
    }
    battle = await battleSessionRepository.markExpiredIfNeeded(battle);
    assertBattleNotExpired(battle);

    if (battle.status === 'completed') {
      throw new AppError('This battle is already finished', HTTP_STATUS.CONFLICT, null, {
        code: 'BATTLE_ALREADY_COMPLETED',
      });
    }

    if (String(battle.creatorUserId) === String(userId)) {
      throw new AppError('You created this battle — share the invite with a friend', HTTP_STATUS.BAD_REQUEST, null, {
        code: 'BATTLE_SELF_JOIN',
      });
    }

    if (battle.opponentUserId) {
      if (String(battle.opponentUserId) === String(userId)) {
        return { battle: toPublicBattle(battle, userId, { includeQuestionIds: true }) };
      }
      logSecurityEvent('battle_join_slot_taken', {
        userIdSuffix: String(userId).slice(-8),
        inviteSuffix: String(inviteCode).slice(-4),
      });
      throw new AppError('This battle already has an opponent', HTTP_STATUS.CONFLICT, null, {
        code: 'BATTLE_OPPONENT_TAKEN',
      });
    }

    await this.assertCanJoin(userId);

    const joined = await battleSessionRepository.setOpponentJoined(battle._id, userId);
    if (!joined) {
      const refreshed = await battleSessionRepository.findByInviteCode(inviteCode);
      if (refreshed?.opponentUserId && String(refreshed.opponentUserId) === String(userId)) {
        return { battle: toPublicBattle(refreshed, userId, { includeQuestionIds: true }) };
      }
      throw new AppError('Could not join battle', HTTP_STATUS.CONFLICT);
    }

    await battleUsageRepository.incrementJoined(userId);

    return { battle: toPublicBattle(joined, userId, { includeQuestionIds: true }) };
  },

  async startAttempt(userId, battleId) {
    if (!mongoose.Types.ObjectId.isValid(String(battleId))) {
      throw new AppError('Invalid battle id', HTTP_STATUS.BAD_REQUEST);
    }
    let battle = await battleSessionRepository.findById(battleId);
    if (!battle) {
      throw new AppError('Battle not found', HTTP_STATUS.NOT_FOUND);
    }
    battle = await battleSessionRepository.markExpiredIfNeeded(battle);
    assertBattleNotExpired(battle);

    if (battle.status === 'completed') {
      throw new AppError('This battle is finished', HTTP_STATUS.CONFLICT, null, {
        code: 'BATTLE_ALREADY_COMPLETED',
      });
    }

    const role = roleForUser(battle, userId);
    if (!role) {
      logSecurityEvent('battle_unauthorized_start', {
        userIdSuffix: String(userId).slice(-8),
      });
      throw new AppError('Forbidden', HTTP_STATUS.FORBIDDEN);
    }

    if (role === 'opponent' && !battle.opponentUserId) {
      throw new AppError('Join this battle before playing', HTTP_STATUS.BAD_REQUEST, null, {
        code: 'BATTLE_NOT_JOINED',
      });
    }

    const attemptField = role === 'creator' ? 'creatorAttemptId' : 'opponentAttemptId';
    const issuanceField = role === 'creator' ? 'creatorIssuanceId' : 'opponentIssuanceId';
    const startedField = role === 'creator' ? 'creatorStartedAt' : 'opponentStartedAt';

    if (battle[attemptField]) {
      throw new AppError('You already completed this battle', HTTP_STATUS.CONFLICT, null, {
        code: 'BATTLE_ALREADY_PLAYED',
      });
    }

    if (battle[issuanceField]) {
      const existingId = String(battle[issuanceField]);
      const questions = await questionRepository.findActiveByIds(
        (battle.questionIds || []).map((id) => String(id))
      );
      return {
        practiceSessionId: existingId,
        questions: projectPublicQuestions(questions),
        battle: toPublicBattle(battle, userId, { includeQuestionIds: true }),
      };
    }

    const orderedIds = (battle.questionIds || []).map((id) =>
      id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id))
    );

    const issuance = await practiceIssuanceService.createIssuance(userId, 'battle', orderedIds, {
      battleSessionId: String(battle._id),
    });

    const now = new Date();
    await battleSessionRepository.updateById(battle._id, {
      [issuanceField]: issuance._id,
      [startedField]: now,
      status: battle.status === 'waiting' ? 'active' : battle.status,
    });

    const questions = await questionRepository.findActiveByIds(
      orderedIds.map((id) => String(id))
    );

    const refreshed = await battleSessionRepository.findById(battleId);

    return {
      practiceSessionId: String(issuance._id),
      expiresAt: issuance.expiresAt,
      questions: projectPublicQuestions(questions),
      battle: toPublicBattle(refreshed, userId, { includeQuestionIds: true }),
    };
  },

  /**
   * Called from practiceRevealService after a battle reveal finalizes.
   */
  async onRevealComplete({
    userId,
    battleSessionId,
    learningSessionId,
    summary,
    startedAt,
  }) {
    if (!battleSessionId || !mongoose.Types.ObjectId.isValid(String(battleSessionId))) {
      return null;
    }

    let battle = await battleSessionRepository.findById(battleSessionId);
    if (!battle) return null;

    const role = roleForUser(battle, userId);
    if (!role) {
      logSecurityEvent('battle_reveal_wrong_user', {
        userIdSuffix: String(userId).slice(-8),
      });
      return null;
    }

    const attemptField = role === 'creator' ? 'creatorAttemptId' : 'opponentAttemptId';
    const scoreField = role === 'creator' ? 'creatorScore' : 'opponentScore';
    const wrongField = role === 'creator' ? 'creatorIncorrect' : 'opponentIncorrect';
    const timeField = role === 'creator' ? 'creatorTimeTakenMs' : 'opponentTimeTakenMs';
    const startedField = role === 'creator' ? 'creatorStartedAt' : 'opponentStartedAt';

    if (battle[attemptField] && String(battle[attemptField]) !== String(learningSessionId)) {
      logSecurityEvent('battle_reveal_duplicate_attempt', {
        userIdSuffix: String(userId).slice(-8),
        battleIdSuffix: String(battleSessionId).slice(-8),
      });
      return { battle: toPublicBattle(battle, userId) };
    }

    const completedAt = new Date();
    const startMs = (battle[startedField] || startedAt)
      ? new Date(battle[startedField] || startedAt).getTime()
      : completedAt.getTime();
    const timeTakenMs = Math.max(0, completedAt.getTime() - startMs);

    const score = Number(summary?.score) || 0;
    const incorrect = Number(summary?.incorrect) || 0;

    const patch = {
      [attemptField]: new mongoose.Types.ObjectId(String(learningSessionId)),
      [scoreField]: score,
      [wrongField]: incorrect,
      [timeField]: timeTakenMs,
    };

    const creatorComplete =
      role === 'creator' ? true : Boolean(battle.creatorAttemptId);
    const opponentComplete =
      role === 'opponent' ? true : Boolean(battle.opponentAttemptId);

    if (battle.opponentUserId && creatorComplete && opponentComplete) {
      const creatorStats = {
        userId: String(battle.creatorUserId),
        completed: true,
        score: role === 'creator' ? score : battle.creatorScore,
        timeTakenMs: role === 'creator' ? timeTakenMs : battle.creatorTimeTakenMs,
        incorrect: role === 'creator' ? incorrect : battle.creatorIncorrect,
      };
      const opponentStats = {
        userId: String(battle.opponentUserId),
        completed: true,
        score: role === 'opponent' ? score : battle.opponentScore,
        timeTakenMs: role === 'opponent' ? timeTakenMs : battle.opponentTimeTakenMs,
        incorrect: role === 'opponent' ? incorrect : battle.opponentIncorrect,
      };

      const winnerId = computeBattleWinner(creatorStats, opponentStats);
      patch.winnerUserId = winnerId ? new mongoose.Types.ObjectId(winnerId) : null;
      patch.status = 'completed';
    } else if (battle.status === 'waiting') {
      patch.status = 'active';
    }

    battle = await battleSessionRepository.updateById(battle._id, patch);

    return {
      battle: toPublicBattle(battle, userId),
      winnerUserId: battle.winnerUserId ? String(battle.winnerUserId) : null,
    };
  },

  async getBattleResultComparison(userId, battleId) {
    const { battle: pub } = await this.getById(userId, battleId);
    let battle = await battleSessionRepository.findById(battleId);

    const creatorSession = battle.creatorAttemptId
      ? await learningSessionRepository.findById(battle.creatorAttemptId)
      : null;
    const opponentSession =
      battle.opponentAttemptId && battle.opponentUserId
        ? await learningSessionRepository.findById(battle.opponentAttemptId)
        : null;

    const creatorUser = await userRepository.findById(battle.creatorUserId);
    const opponentUser = battle.opponentUserId
      ? await userRepository.findById(battle.opponentUserId)
      : null;

    return {
      battle: pub,
      comparison: {
        creator: {
          userId: String(battle.creatorUserId),
          displayName: creatorUser?.name || creatorUser?.email || 'Player 1',
          score: battle.creatorScore,
          incorrect: battle.creatorIncorrect,
          timeTakenMs: battle.creatorTimeTakenMs,
          learningSessionId: battle.creatorAttemptId ? String(battle.creatorAttemptId) : null,
          completed: Boolean(creatorSession),
        },
        opponent: battle.opponentUserId
          ? {
              userId: String(battle.opponentUserId),
              displayName: opponentUser?.name || opponentUser?.email || 'Player 2',
              score: battle.opponentScore,
              incorrect: battle.opponentIncorrect,
              timeTakenMs: battle.opponentTimeTakenMs,
              learningSessionId: battle.opponentAttemptId
                ? String(battle.opponentAttemptId)
                : null,
              completed: Boolean(opponentSession),
            }
          : null,
        winnerUserId: battle.winnerUserId ? String(battle.winnerUserId) : null,
      },
    };
  },

  async listMine(userId, query = {}) {
    const rows = await battleSessionRepository.listForUser(userId, {
      limit: query.limit,
    });
    const battles = [];
    for (const row of rows) {
      const b = await battleSessionRepository.markExpiredIfNeeded(row);
      battles.push(toPublicBattle(b, userId));
    }
    return { battles };
  },
};
