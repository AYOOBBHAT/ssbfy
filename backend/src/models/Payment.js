import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    razorpay_payment_id: {
      type: String,
      required: false,
      trim: true,
    },
    razorpay_order_id: { type: String, required: true, trim: true, unique: true },
    amount: { type: Number, required: true, min: 0 },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      default: null,
      index: true,
    },
    planType: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly', 'lifetime', null],
      default: null,
    },
    durationDays: { type: Number, default: null },
    priceInr: { type: Number, default: null },
    status: { type: String, required: true, trim: true },
    /** Subscription period granted by this payment (audit / analytics). */
    subscriptionEndAt: { type: Date, default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index(
  { razorpay_payment_id: 1 },
  { unique: true, partialFilterExpression: { razorpay_payment_id: { $exists: true, $ne: null } } }
);

export const Payment = mongoose.model('Payment', paymentSchema);
