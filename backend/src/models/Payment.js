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
      required: true,
      unique: true,
      trim: true,
    },
    razorpay_order_id: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, required: true, trim: true },
    /** Subscription period granted by this payment (audit / analytics). */
    subscriptionEndAt: { type: Date, default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ userId: 1, createdAt: -1 });

export const Payment = mongoose.model('Payment', paymentSchema);
