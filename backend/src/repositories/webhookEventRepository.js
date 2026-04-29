import { WebhookEvent } from '../models/WebhookEvent.js';

export const webhookEventRepository = {
  /**
   * Insert-only idempotency. Duplicate Razorpay event ids return `inserted: false`.
   */
  async tryInsertEvent({ eventId, event }) {
    try {
      await WebhookEvent.create({
        eventId,
        event,
        receivedAt: new Date(),
      });
      return { inserted: true };
    } catch (err) {
      if (err?.code === 11000) {
        return { inserted: false };
      }
      throw err;
    }
  },
};
