import { Payment } from '../models/Payment.js';

export const paymentRepository = {
  async findByPaymentId(razorpay_payment_id) {
    return Payment.findOne({ razorpay_payment_id }).lean().exec();
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
};
