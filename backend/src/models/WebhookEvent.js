import mongoose from 'mongoose';

/**
 * One document per Razorpay webhook delivery `id` so duplicate deliveries
 * (retries) never double-run activation logic. TTL keeps the collection small.
 */
const webhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    event: { type: String, required: true },
    receivedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: { expireAfterSeconds: 60 * 24 * 60 * 60 }, // 60 days
    },
  },
  { timestamps: false }
);

export const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
