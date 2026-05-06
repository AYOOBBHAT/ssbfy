import crypto from 'crypto';
import { env } from '../config/env.js';
import { paymentService, safeEqualHex } from '../services/paymentService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/response.js';
import { isPremiumUser } from '../utils/freeTierAccess.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Log-safe fields only (no raw body, signatures, or secrets).
 */
function webhookLogContext(parsed) {
  const eventType = String(parsed?.event || '');
  const eventId =
    parsed?.id != null && String(parsed.id).trim() ? String(parsed.id).trim() : null;

  let orderId = null;
  let paymentId = null;
  const payEnt = parsed?.payload?.payment?.entity;
  if (payEnt) {
    if (payEnt.order_id != null) orderId = String(payEnt.order_id);
    if (payEnt.id != null) paymentId = String(payEnt.id);
  }
  const ordEnt = parsed?.payload?.order?.entity;
  if (ordEnt?.id != null && !orderId) orderId = String(ordEnt.id);

  return { eventId, eventType, orderId, paymentId };
}

export const paymentController = {
  /**
   * Public Razorpay webhook — `RAZORPAY_WEBHOOK_SECRET` + raw body HMAC only.
   */
  webhook: asyncHandler(async (req, res, next) => {
    try {
      const secret = env.razorpayWebhookSecret;
      if (!secret) {
        logger.error('[PAYMENT WEBHOOK] signing secret not configured');
        return res.sendStatus(200);
      }

      const sig = String(req.get('X-Razorpay-Signature') || '').trim();
      const raw = req.rawBody;
      if (!sig || !Buffer.isBuffer(raw) || raw.length === 0) {
        logger.warn('[PAYMENT WEBHOOK] missing signature or raw body');
        return res.sendStatus(200);
      }

      const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
      if (expected.length !== sig.length || !safeEqualHex(expected, sig)) {
        logger.warn('[PAYMENT WEBHOOK] signature verification failed');
        return res.sendStatus(200);
      }

      let parsed;
      try {
        parsed = JSON.parse(raw.toString('utf8'));
      } catch {
        logger.warn('[PAYMENT WEBHOOK] invalid JSON body');
        return res.sendStatus(200);
      }

      const ctx = webhookLogContext(parsed);

      try {
        await paymentService.processRazorpayWebhookEvent(parsed);
        return res.sendStatus(200);
      } catch (err) {
        if (err instanceof AppError && err.statusCode < 500) {
          logger.warn('Webhook acknowledged (non-retryable)', { ...ctx, statusCode: err.statusCode });
          return res.sendStatus(200);
        }
        logger.error('Webhook processing failed', { ...ctx, errorName: err?.name });
        return next(err);
      }
    } catch (err) {
      logger.error('Webhook unexpected failure', { errorName: err?.name });
      return next(err);
    }
  }),

  createOrder: asyncHandler(async (req, res) => {
    const payload = await paymentService.createOrder(req.user.id, req.body.planId);
    return sendCreated(res, payload, 'Order created');
  }),

  verify: asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const { user, subscriptionEnd, plan, idempotent } = await paymentService.verifyAndActivatePremium(
      req.user.id,
      {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      }
    );
    return sendSuccess(
      res,
      {
        subscriptionEnd,
        isPremium: isPremiumUser(user),
        plan,
        currentPlanId: user.currentPlanId ?? null,
        currentPlanType: user.currentPlanType ?? null,
        idempotent,
      },
      'Payment verified'
    );
  }),
};
