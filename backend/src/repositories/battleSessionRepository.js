import mongoose from 'mongoose';
import { BattleSession } from '../models/BattleSession.js';
import {
  INITIAL_BATTLE_STATUS,
  openBattleStatuses,
  promoteWaitingToActiveStatusExpr,
  recordBattleStatusTransition,
  sourceStatusesFor,
} from '../utils/battleStateMachine.js';

function stripStatusFromUpdate(update) {
  if (!update || typeof update !== 'object') return update;
  if (update.status != null || update.$set?.status != null) {
    throw new Error(
      'Battle status must be changed via battle state machine repository methods'
    );
  }
  return update;
}

export const battleSessionRepository = {
  async create(data) {
    const payload = {
      ...data,
      status: data?.status != null ? data.status : INITIAL_BATTLE_STATUS,
    };
    if (payload.status !== INITIAL_BATTLE_STATUS) {
      throw new Error(
        `New battles must start as "${INITIAL_BATTLE_STATUS}" (got "${payload.status}")`
      );
    }
    const doc = await BattleSession.create(payload);
    return doc.toObject();
  },

  async findById(id) {
    return BattleSession.findById(id).lean().exec();
  },

  async findByInviteCode(inviteCode) {
    return BattleSession.findOne({ inviteCode: String(inviteCode).trim().toUpperCase() })
      .lean()
      .exec();
  },

  async findByIdForUpdate(id) {
    return BattleSession.findById(id).exec();
  },

  async updateById(id, update) {
    return BattleSession.findByIdAndUpdate(id, stripStatusFromUpdate(update), {
      new: true,
    })
      .lean()
      .exec();
  },

  /**
   * Atomically record one side's reveal result.
   * Succeeds only while battle is open and this side's attempt is
   * still unset (or the same learningSessionId for idempotent retries).
   * Promotes waiting → active via state machine (no other status writes).
   */
  async recordSideReveal(
    id,
    { role, learningSessionId, score, incorrect, timeTakenMs, userId = null }
  ) {
    const oid = new mongoose.Types.ObjectId(String(id));
    const attemptOid = new mongoose.Types.ObjectId(String(learningSessionId));
    const attemptField = role === 'creator' ? 'creatorAttemptId' : 'opponentAttemptId';

    const sideSet =
      role === 'creator'
        ? {
            creatorAttemptId: attemptOid,
            creatorScore: score,
            creatorIncorrect: incorrect,
            creatorTimeTakenMs: timeTakenMs,
          }
        : {
            opponentAttemptId: attemptOid,
            opponentScore: score,
            opponentIncorrect: incorrect,
            opponentTimeTakenMs: timeTakenMs,
          };

    const prev = await BattleSession.findOneAndUpdate(
      {
        _id: oid,
        status: { $in: [...openBattleStatuses()] },
        $or: [{ [attemptField]: null }, { [attemptField]: attemptOid }],
      },
      [
        {
          $set: {
            ...sideSet,
            status: promoteWaitingToActiveStatusExpr(),
          },
        },
      ],
      { new: false }
    )
      .lean()
      .exec();

    if (!prev) return null;

    if (prev.status === 'waiting') {
      recordBattleStatusTransition({
        battleId: prev._id,
        from: 'waiting',
        to: 'active',
        userId,
        reason: 'reveal_promote',
      });
    }

    return BattleSession.findById(prev._id).lean().exec();
  },

  /**
   * Atomically mark battle completed with a winner (or null for tie).
   * Exactly one concurrent caller can win this update.
   * State machine: active → completed only.
   */
  async tryMarkCompleted(id, winnerUserId, { userId = null } = {}) {
    const oid = new mongoose.Types.ObjectId(String(id));
    const winner =
      winnerUserId != null && String(winnerUserId).length > 0
        ? new mongoose.Types.ObjectId(String(winnerUserId))
        : null;

    const fromStatuses = sourceStatusesFor('completed');

    const prev = await BattleSession.findOneAndUpdate(
      {
        _id: oid,
        status: { $in: [...fromStatuses] },
        opponentUserId: { $ne: null },
        creatorAttemptId: { $ne: null },
        opponentAttemptId: { $ne: null },
      },
      {
        $set: {
          status: 'completed',
          winnerUserId: winner,
        },
      },
      { new: false }
    )
      .lean()
      .exec();

    if (!prev) return null;

    recordBattleStatusTransition({
      battleId: prev._id,
      from: prev.status,
      to: 'completed',
      userId,
      reason: 'both_sides_finished',
    });

    return BattleSession.findById(prev._id).lean().exec();
  },

  /**
   * Atomically claim this side's battle start with a predetermined issuance id.
   * Succeeds only when that side has no issuance yet and has not finished.
   * Promotes waiting → active via state machine.
   */
  async claimSideStart(id, { role, issuanceId, startedAt, userId = null }) {
    const oid = new mongoose.Types.ObjectId(String(id));
    const issuanceOid = new mongoose.Types.ObjectId(String(issuanceId));
    const issuanceField = role === 'creator' ? 'creatorIssuanceId' : 'opponentIssuanceId';
    const attemptField = role === 'creator' ? 'creatorAttemptId' : 'opponentAttemptId';
    const startedAtDate = startedAt instanceof Date ? startedAt : new Date(startedAt);

    const sideSet =
      role === 'creator'
        ? {
            creatorIssuanceId: issuanceOid,
            creatorStartedAt: startedAtDate,
          }
        : {
            opponentIssuanceId: issuanceOid,
            opponentStartedAt: startedAtDate,
          };

    const prev = await BattleSession.findOneAndUpdate(
      {
        _id: oid,
        status: { $in: [...openBattleStatuses()] },
        [issuanceField]: null,
        [attemptField]: null,
      },
      [
        {
          $set: {
            ...sideSet,
            status: promoteWaitingToActiveStatusExpr(),
          },
        },
      ],
      { new: false }
    )
      .lean()
      .exec();

    if (!prev) return null;

    if (prev.status === 'waiting') {
      recordBattleStatusTransition({
        battleId: prev._id,
        from: 'waiting',
        to: 'active',
        userId,
        reason: 'start_promote',
      });
    }

    return BattleSession.findById(prev._id).lean().exec();
  },

  async setOpponentJoined(id, opponentUserId) {
    const oid = new mongoose.Types.ObjectId(String(id));
    const opponentOid = new mongoose.Types.ObjectId(String(opponentUserId));

    const prev = await BattleSession.findOneAndUpdate(
      {
        _id: oid,
        status: { $in: [...openBattleStatuses()] },
        opponentUserId: null,
        expiresAt: { $gt: new Date() },
      },
      [
        {
          $set: {
            opponentUserId: opponentOid,
            status: promoteWaitingToActiveStatusExpr(),
          },
        },
      ],
      { new: false }
    )
      .lean()
      .exec();

    if (!prev) return null;

    if (prev.status === 'waiting') {
      recordBattleStatusTransition({
        battleId: prev._id,
        from: 'waiting',
        to: 'active',
        userId: opponentUserId,
        reason: 'opponent_joined',
      });
    }

    return BattleSession.findById(prev._id).lean().exec();
  },

  async listForUser(userId, { limit = 20 } = {}) {
    const oid = new mongoose.Types.ObjectId(String(userId));
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
    return BattleSession.find({
      $or: [{ creatorUserId: oid }, { opponentUserId: oid }],
    })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean()
      .exec();
  },

  async findPendingForUser(userId, { limit = 30 } = {}) {
    const oid = new mongoose.Types.ObjectId(String(userId));
    const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 50));
    const now = new Date();
    return BattleSession.find({
      $or: [{ creatorUserId: oid }, { opponentUserId: oid }],
      status: { $in: [...openBattleStatuses()] },
      expiresAt: { $gt: now },
    })
      .sort({ updatedAt: -1 })
      .limit(safeLimit)
      .lean()
      .exec();
  },

  async findRecentFinishedForUser(userId, { limit = 20, skip = 0 } = {}) {
    const oid = new mongoose.Types.ObjectId(String(userId));
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 40));
    const safeSkip = Math.max(0, Math.min(Number(skip) || 0, 200));
    return BattleSession.find({
      $or: [{ creatorUserId: oid }, { opponentUserId: oid }],
      status: { $in: ['completed', 'expired'] },
    })
      .sort({ updatedAt: -1 })
      .limit(safeLimit)
      .skip(safeSkip)
      .lean()
      .exec();
  },

  /**
   * Aggregate win/loss/tie for completed battles where viewer participated.
   */
  async aggregateRecordForUser(userId) {
    const oid = new mongoose.Types.ObjectId(String(userId));
    const uid = String(userId);
    const rows = await BattleSession.aggregate([
      {
        $match: {
          status: 'completed',
          $or: [{ creatorUserId: oid }, { opponentUserId: oid }],
          opponentUserId: { $ne: null },
        },
      },
      {
        $project: {
          outcome: {
            $cond: [
              { $eq: ['$winnerUserId', null] },
              'tie',
              {
                $cond: [{ $eq: [{ $toString: '$winnerUserId' }, uid] }, 'win', 'loss'],
              },
            ],
          },
        },
      },
      { $group: { _id: '$outcome', count: { $sum: 1 } } },
    ]).exec();

    const out = { wins: 0, losses: 0, ties: 0 };
    for (const r of rows) {
      if (r._id === 'win') out.wins = r.count;
      else if (r._id === 'loss') out.losses = r.count;
      else if (r._id === 'tie') out.ties = r.count;
    }
    return out;
  },

  async countPendingForUser(userId) {
    const oid = new mongoose.Types.ObjectId(String(userId));
    const now = new Date();
    return BattleSession.countDocuments({
      $or: [{ creatorUserId: oid }, { opponentUserId: oid }],
      status: { $in: [...openBattleStatuses()] },
      expiresAt: { $gt: now },
    }).exec();
  },

  /**
   * Lazy expiry: waiting|active → expired when past expiresAt.
   * Uses state machine source filter so completed/expired cannot be overwritten.
   */
  async markExpiredIfNeeded(doc) {
    if (!doc) return doc;
    if (doc.status === 'completed' || doc.status === 'expired') return doc;
    if (!doc.expiresAt || new Date(doc.expiresAt).getTime() >= Date.now()) {
      return doc;
    }

    const fromStatuses = sourceStatusesFor('expired');
    if (!fromStatuses.includes(String(doc.status))) {
      return doc;
    }

    const prev = await BattleSession.findOneAndUpdate(
      {
        _id: doc._id,
        status: { $in: [...fromStatuses] },
        expiresAt: { $lte: new Date() },
      },
      { $set: { status: 'expired' } },
      { new: false }
    )
      .lean()
      .exec();

    if (!prev) {
      const latest = await BattleSession.findById(doc._id).lean().exec();
      return latest || doc;
    }

    recordBattleStatusTransition({
      battleId: prev._id,
      from: prev.status,
      to: 'expired',
      userId: null,
      reason: 'expires_at_passed',
    });

    return BattleSession.findById(prev._id).lean().exec();
  },
};
