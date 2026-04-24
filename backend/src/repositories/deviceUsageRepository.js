import { DeviceUsage } from '../models/DeviceUsage.js';

export const deviceUsageRepository = {
  async findByDeviceId(deviceId) {
    return DeviceUsage.findOne({ deviceId }).lean().exec();
  },

  /**
   * Ensures a row exists for this device with freeAttemptsUsed seeded at 0.
   * Safe to call before conditional increments.
   */
  async ensureDeviceRow(deviceId) {
    await DeviceUsage.updateOne(
      { deviceId },
      { $setOnInsert: { deviceId, freeAttemptsUsed: 0 } },
      { upsert: true }
    );
  },

  /**
   * Atomically increments freeAttemptsUsed by 1 iff current value is < limit.
   * Updates lastUsedAt + userId. Returns the updated document, or null if
   * the device is already at or above the limit (or race lost).
   */
  async consumeOneIfUnderLimit(deviceId, userId, limit) {
    await this.ensureDeviceRow(deviceId);
    return DeviceUsage.findOneAndUpdate(
      {
        deviceId,
        freeAttemptsUsed: { $lt: limit },
      },
      {
        $inc: { freeAttemptsUsed: 1 },
        $set: {
          lastUsedAt: new Date(),
          userId,
        },
      },
      { new: true }
    )
      .lean()
      .exec();
  },
};
