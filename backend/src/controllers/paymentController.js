import crypto from 'crypto';
import { env } from '../config/env.js';
import { paymentService, safeEqualHex } from '../services/paymentService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/response.js';
import { isPremiumUser } from '../utils/freeTierAccess.js';
import { AppError } from '../utils/AppError.js';

export const paymentController = {
  /**
   * Public Razorpay webhook — `RAZORPAY_WEBHOOK_SECRET` + raw body HMAC only.
   */
  webhook: asyncHandler(async (req, res) => {
    const secret = env.razorpayWebhookSecret;
    if (!secret) {
      console.error('[PAYMENT WEBHOOK] RAZORPAY_WEBHOOK_SECRET is not set');
      return res.status(503).json({
        success: false,
        message: 'Webhook signing not configured',
      });
    }

    const sig = String(req.get('X-Razorpay-Signature') || '').trim();
    const raw = req.rawBody;
    if (!sig || !Buffer.isBuffer(raw) || raw.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid webhook request' });
    }

    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    if (expected.length !== sig.length || !safeEqualHex(expected, sig)) {
      console.warn('[PAYMENT WEBHOOK] Signature verification failed');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid JSON body' });
    }

    try {
      const result = await paymentService.processRazorpayWebhookEvent(parsed);
      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      if (err instanceof AppError && err.statusCode < 500) {
        console.warn('[PAYMENT WEBHOOK] Ack 200 (non-retryable):', err.message);
        return res.status(200).json({
          success: true,
          handled: false,
          reason: 'app_error',
          message: err.message,
        });
      }
      throw err;
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
