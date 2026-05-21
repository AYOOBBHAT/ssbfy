import mongoose from 'mongoose';
import { BattleUsage } from '../models/BattleUsage.js';

function utcDateKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export const battleUsageRepository = {
  utcDateKey,

  async getOrCreate(userId, dateKey = utcDateKey()) {
    const uid = new mongoose.Types.ObjectId(String(userId));
    let doc = await BattleUsage.findOne({ userId: uid, dateKey }).lean().exec();
    if (!doc) {
      try {
        doc = (
          await BattleUsage.create({
            userId: uid,
            dateKey,
            createdCount: 0,
            joinedCount: 0,
          })
        ).toObject();
      } catch (e) {
        if (e?.code === 11000) {
          doc = await BattleUsage.findOne({ userId: uid, dateKey }).lean().exec();
        } else {
          throw e;
        }
      }
    }
    return doc;
  },

  async incrementCreated(userId, dateKey = utcDateKey()) {
    const uid = new mongoose.Types.ObjectId(String(userId));
    const doc = await BattleUsage.findOneAndUpdate(
      { userId: uid, dateKey },
      { $inc: { createdCount: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
      .lean()
      .exec();
    return doc;
  },

  async incrementJoined(userId, dateKey = utcDateKey()) {
    const uid = new mongoose.Types.ObjectId(String(userId));
    const doc = await BattleUsage.findOneAndUpdate(
      { userId: uid, dateKey },
      { $inc: { joinedCount: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
      .lean()
      .exec();
    return doc;
  },
};
