import mongoose from 'mongoose';
import { PracticeIssuance } from '../models/PracticeIssuance.js';

export const practiceIssuanceRepository = {
  async create(doc) {
    const row = await PracticeIssuance.create(doc);
    return row.toObject();
  },

  async findByIdForUser(id, userId) {
    return PracticeIssuance.findOne({
      _id: id,
      userId,
    })
      .lean()
      .exec();
  },

  async incrementScratchAttempts(id, { maxScratch } = {}) {
    const filter = { _id: id, revealFinalized: false };
    if (maxScratch != null) {
      filter.scratchRevealAttempts = { $lt: maxScratch };
    }
    const res = await PracticeIssuance.updateOne(filter, { $inc: { scratchRevealAttempts: 1 } }).exec();
    return (res.modifiedCount ?? 0) > 0;
  },

  async finalizeReveal(id, { idempotentKey, linkedLearningSessionId }) {
    const ls = linkedLearningSessionId
      ? new mongoose.Types.ObjectId(String(linkedLearningSessionId))
      : null;
    return PracticeIssuance.updateOne(
      { _id: id },
      {
        $set: {
          revealFinalized: true,
          idempotentKey: idempotentKey ?? '',
          linkedLearningSessionId: ls,
        },
      }
    ).exec();
  },
};
