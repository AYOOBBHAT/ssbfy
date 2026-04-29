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
    /**
     * Payment lifecycle for support/reconciliation.
     * - pending: order row created locally, not successfully paid
     * - paid: gateway reported success (authorized/captured) and we recorded it
     * - failed: payment failed
     * - expired: order expired / cancelled (no successful capture tracked here)
     *
     * `status` holds the raw Razorpay payment status when applicable (e.g. captured).
     */
    paymentStatus: {
      type: String,
      trim: true,
      default: 'pending',
      index: true,
    },
    /** When Razorpay confirmed capture (webhook or client verify completion). */
    webhookReceivedAt: { type: Date, default: null },
    /** True once at least one verified webhook touched this row (retries safe). */
    verifiedByWebhook: { type: Boolean, default: false, index: true },
    /**
     * Which path(s) confirmed the payment server-side.
     * client = /payments/verify only; webhook = webhook only; both = both fired.
     */
    verificationSource: {
      type: String,
      enum: ['client', 'webhook', 'both', null],
      default: null,
    },
    /** Last processed webhook event id (Razorpay `event.id`) for traceability. */
    lastWebhookEventId: { type: String, default: null, trim: true },
    /** Manual admin reconciliation timestamp (safe retry, idempotent grant path). */
    adminReconciledAt: { type: Date, default: null },
    /** Subscription period granted by this payment (audit / analytics). */
    subscriptionEndAt: { type: Date, default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ paymentStatus: 1, createdAt: -1 });
paymentSchema.index(
  { razorpay_payment_id: 1 },
  { unique: true, partialFilterExpression: { razorpay_payment_id: { $exists: true, $ne: null } } }
);

export const Payment = mongoose.model('Payment', paymentSchema);
