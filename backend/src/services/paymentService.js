import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { PREMIUM_SUBSCRIPTION_DAYS } from '../constants/access.js';
import { hasActiveSubscription, PLAN_MONTHLY } from '../constants/subscription.js';
import { AppError } from '../utils/AppError.js';
import { userRepository } from '../repositories/userRepository.js';
import { paymentRepository } from '../repositories/paymentRepository.js';

const RAZORPAY_ID_RE = /^[a-zA-Z0-9_-]+$/;

function safeEqualHex(a, b) {
  try {
    return (
      a.length === b.length &&
      crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
    );
  } catch {
    return false;
  }
}

function assertRazorpayConfigured() {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    throw new AppError(
      'Payment service is not configured',
      HTTP_STATUS.SERVICE_UNAVAILABLE
    );
  }
}

function getClient() {
  assertRazorpayConfigured();
  return new Razorpay({
    key_id: env.razorpayKeyId,
    key_secret: env.razorpayKeySecret,
  });
}

function subscriptionEndFromNow() {
  const end = new Date(Date.now());
  end.setDate(end.getDate() + PREMIUM_SUBSCRIPTION_DAYS);
  return end;
}

function assertValidRazorpayIds(razorpay_order_id, razorpay_payment_id, razorpay_signature) {
  const orderId = String(razorpay_order_id ?? '').trim();
  const paymentId = String(razorpay_payment_id ?? '').trim();
  const signature = String(razorpay_signature ?? '').trim();
  if (!orderId || !paymentId || !signature) {
    throw new AppError('Invalid payment payload', HTTP_STATUS.BAD_REQUEST);
  }
  if (orderId.length > 256 || paymentId.length > 256 || signature.length > 512) {
    throw new AppError('Invalid payment payload', HTTP_STATUS.BAD_REQUEST);
  }
  if (!RAZORPAY_ID_RE.test(orderId) || !RAZORPAY_ID_RE.test(paymentId)) {
    throw new AppError('Invalid payment id format', HTTP_STATUS.BAD_REQUEST);
  }
  if (!/^[a-f0-9]+$/i.test(signature)) {
    throw new AppError('Invalid signature format', HTTP_STATUS.BAD_REQUEST);
  }
  return { orderId, paymentId, signature };
}

async function healSubscriptionForRecordedPayment(userId, paymentId) {
  let user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
  }
  if (hasActiveSubscription(user)) {
    return user;
  }
  const subscriptionEnd = subscriptionEndFromNow();
  user = await userRepository.setSubscriptionAfterPayment(userId, subscriptionEnd, PLAN_MONTHLY);
  await paymentRepository.setSubscriptionEndAtByPaymentId(paymentId, subscriptionEnd);
  console.log('[PAYMENT] Healing subscription for existing payment:', {
    userId: String(userId),
    paymentId,
  });
  return user;
}

export const paymentService = {
  /**
   * amountInr: whole rupees (e.g. 99). Razorpay expects amount in paise.
   */
  async createOrder(userId, amountInr) {
    const rzp = getClient();
    const amountPaise = Math.round(Number(amountInr) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < 100) {
      throw new AppError('amount must be at least 1 INR', HTTP_STATUS.BAD_REQUEST);
    }

    const receipt = `rcpt_${userId}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`.slice(
      0,
      40
    );

    const order = await rzp.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        userId: String(userId),
      },
    });

    console.log('[PAYMENT] Order created:', {
      userId: String(userId),
      order_id: order.id,
      amount: order.amount,
    });

    return {
      order_id: order.id,
      key_id: env.razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
    };
  },

  async verifyAndActivatePremium(userId, raw) {
    const { orderId, paymentId, signature } = assertValidRazorpayIds(
      raw.razorpay_order_id,
      raw.razorpay_payment_id,
      raw.razorpay_signature
    );

    assertRazorpayConfigured();
    const body = `${orderId}|${paymentId}`;
    const expected = crypto
      .createHmac('sha256', env.razorpayKeySecret)
      .update(body)
      .digest('hex');

    if (expected.length !== signature.length || !safeEqualHex(expected, signature)) {
      console.log('[PAYMENT] Signature verification failed:', { userId: String(userId), paymentId });
      throw new AppError('Invalid payment signature', HTTP_STATUS.BAD_REQUEST);
    }

    const existing = await paymentRepository.findByPaymentId(paymentId);
    if (existing) {
      if (existing.userId.toString() !== String(userId)) {
        console.log('[PAYMENT] Idempotency conflict — payment owned by another user:', { paymentId });
        throw new AppError('Payment already processed', HTTP_STATUS.CONFLICT);
      }
      const user = await healSubscriptionForRecordedPayment(userId, paymentId);
      console.log('[PAYMENT] Idempotent verify (already recorded):', {
        userId: String(userId),
        paymentId,
        subscriptionEnd: user.subscriptionEnd,
      });
      return {
        user,
        subscriptionEnd: user.subscriptionEnd,
        plan: user.plan,
        idempotent: true,
      };
    }

    const rzp = getClient();
    let remote;
    try {
      remote = await rzp.payments.fetch(paymentId);
    } catch (err) {
      console.log('[PAYMENT] Razorpay fetch failed:', {
        userId: String(userId),
        paymentId,
        message: err?.message,
      });
      throw new AppError('Could not verify payment with Razorpay', HTTP_STATUS.BAD_GATEWAY);
    }

    if (!remote || String(remote.order_id) !== orderId) {
      console.log('[PAYMENT] Order id mismatch:', { userId: String(userId), paymentId });
      throw new AppError('Payment does not match order', HTTP_STATUS.BAD_REQUEST);
    }

    if (remote.status !== 'captured' && remote.status !== 'authorized') {
      console.log('[PAYMENT] Payment not successful:', {
        userId: String(userId),
        paymentId,
        status: remote?.status,
      });
      throw new AppError('Payment not completed', HTTP_STATUS.BAD_REQUEST);
    }

    const subscriptionEnd = subscriptionEndFromNow();

    try {
      await paymentRepository.create({
        userId,
        razorpay_payment_id: paymentId,
        razorpay_order_id: orderId,
        amount: Number(remote.amount),
        status: String(remote.status),
        subscriptionEndAt: subscriptionEnd,
      });
    } catch (err) {
      if (err?.code === 11000) {
        const again = await paymentRepository.findByPaymentId(paymentId);
        if (again?.userId.toString() === String(userId)) {
          const user = await healSubscriptionForRecordedPayment(userId, paymentId);
          console.log('[PAYMENT] Duplicate insert — idempotent path:', {
            userId: String(userId),
            paymentId,
            subscriptionEnd: user.subscriptionEnd,
          });
          return {
            user,
            subscriptionEnd: user.subscriptionEnd,
            plan: user.plan,
            idempotent: true,
          };
        }
      }
      console.log('[PAYMENT] Payment record create failed:', { userId: String(userId), paymentId, message: err?.message });
      throw err;
    }

    const user = await userRepository.setSubscriptionAfterPayment(userId, subscriptionEnd, PLAN_MONTHLY);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    console.log('[PAYMENT] Activation successful:', {
      userId: String(userId),
      paymentId,
      orderId,
      subscriptionEnd: user.subscriptionEnd,
      idempotent: false,
    });

    return {
      user,
      subscriptionEnd: user.subscriptionEnd,
      plan: user.plan,
      idempotent: false,
    };
  },
};
