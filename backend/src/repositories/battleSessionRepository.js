import mongoose from 'mongoose';
import { BattleSession } from '../models/BattleSession.js';

export const battleSessionRepository = {
  async create(data) {
    const doc = await BattleSession.create(data);
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
    return BattleSession.findByIdAndUpdate(id, update, { new: true }).lean().exec();
  },

  async setOpponentJoined(id, opponentUserId) {
    return BattleSession.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(String(id)),
        status: { $in: ['waiting', 'active'] },
        opponentUserId: null,
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          opponentUserId: new mongoose.Types.ObjectId(String(opponentUserId)),
          status: 'active',
        },
      },
      { new: true }
    )
      .lean()
      .exec();
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
      status: { $in: ['waiting', 'active'] },
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
      status: { $in: ['waiting', 'active'] },
      expiresAt: { $gt: now },
    }).exec();
  },

  async markExpiredIfNeeded(doc) {
    if (!doc) return doc;
    if (doc.status === 'completed' || doc.status === 'expired') return doc;
    if (doc.expiresAt && new Date(doc.expiresAt).getTime() < Date.now()) {
      const updated = await BattleSession.findByIdAndUpdate(
        doc._id,
        { $set: { status: 'expired' } },
        { new: true }
      )
        .lean()
        .exec();
      return updated || { ...doc, status: 'expired' };
    }
    return doc;
  },
};
