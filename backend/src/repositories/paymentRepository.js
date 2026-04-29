import { Payment } from '../models/Payment.js';
import mongoose from 'mongoose';

export const paymentRepository = {
  async findByPaymentId(razorpay_payment_id) {
    return Payment.findOne({ razorpay_payment_id }).lean().exec();
  },

  async findByOrderId(razorpay_order_id) {
    return Payment.findOne({ razorpay_order_id }).lean().exec();
  },

  async create(data) {
    const doc = await Payment.create(data);
    return doc.toObject();
  },

  async setSubscriptionEndAtByPaymentId(razorpay_payment_id, subscriptionEndAt) {
    return Payment.findOneAndUpdate(
      { razorpay_payment_id },
      { $set: { subscriptionEndAt } },
      { new: true }
    )
      .lean()
      .exec();
  },

  async updateByOrderId(razorpay_order_id, update) {
    return Payment.findOneAndUpdate(
      { razorpay_order_id },
      { $set: update },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
  },

  /**
   * Admin/support: paged list with optional filters.
   */
  async findForAdminList(filter = {}, { limit = 30, skip = 0 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 100));
    const safeSkip = Math.max(Number(skip) || 0, 0);
    const q = {};
    if (filter.userId && mongoose.isValidObjectId(String(filter.userId))) {
      q.userId = new mongoose.Types.ObjectId(String(filter.userId));
    }
    if (filter.paymentStatus) q.paymentStatus = filter.paymentStatus;
    if (filter.hydrationIssue) {
      // Timed plans only: paid (or legacy Razorpay statuses) but no stored end date on row.
      q.planType = { $ne: 'lifetime' };
      q.razorpay_payment_id = { $exists: true, $nin: [null, ''] };
      q.subscriptionEndAt = null;
      q.paymentStatus = { $in: ['paid', 'captured', 'authorized'] };
    }

    const [total, rows] = await Promise.all([
      Payment.countDocuments(q).exec(),
      Payment.find(q)
        .sort({ createdAt: -1 })
        .skip(safeSkip)
        .limit(safeLimit)
        .populate('userId', 'name email isPremium subscriptionEnd currentPlanType')
        .populate('planId', 'name planType isActive')
        .lean()
        .exec(),
    ]);
    return { rows, total, limit: safeLimit, skip: safeSkip };
  },
};
