import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { PREMIUM_SUBSCRIPTION_DAYS } from '../constants/access.js';
import { hasActiveSubscription } from '../constants/subscription.js';
import { AppError } from '../utils/AppError.js';
import { userRepository } from '../repositories/userRepository.js';
import { paymentRepository } from '../repositories/paymentRepository.js';
import { subscriptionPlanService } from './subscriptionPlanService.js';

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

function normalizeRecordedPlan(record) {
  const type = record?.planType || null;
  const days =
    type === 'lifetime'
      ? null
      : Number.isInteger(record?.durationDays) && record.durationDays > 0
      ? record.durationDays
      : PREMIUM_SUBSCRIPTION_DAYS;
  return { type, days };
}

function subscriptionEndFromPlan(user, { type, days }) {
  if (type === 'lifetime') {
    return null;
  }
  const now = Date.now();
  const current = user?.subscriptionEnd ? new Date(user.subscriptionEnd).getTime() : 0;
  const base = current > now ? new Date(current) : new Date(now);
  base.setDate(base.getDate() + days);
  return base;
}

async function healSubscriptionForRecordedPayment(userId, record) {
  let user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
  }
  if (hasActiveSubscription(user) || user?.isPremium === true) {
    return user;
  }
  const plan = normalizeRecordedPlan(record);
  const subscriptionEnd = subscriptionEndFromPlan(user, plan);
  user = await userRepository.setSubscriptionAfterPayment(userId, {
    subscriptionEnd,
    plan: plan.type || user?.plan || 'monthly',
    currentPlanId: record?.planId || null,
    currentPlanType: plan.type,
  });
  if (record?.razorpay_order_id) {
    await paymentRepository.updateByOrderId(record.razorpay_order_id, { subscriptionEndAt: subscriptionEnd });
  }
  console.log('[PAYMENT] Healing subscription for existing payment:', {
    userId: String(userId),
    paymentId: record?.razorpay_payment_id,
  });
  return user;
}

export const paymentService = {
  async createOrder(userId, planId) {
    const rzp = getClient();
    const plan = await subscriptionPlanService.getActivePlanById(planId);
    if (!plan) {
      throw new AppError('Subscription plan not found', HTTP_STATUS.NOT_FOUND);
    }

    const amountPaise = Math.round(Number(plan.priceInr) * 100);
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
        planId: String(plan._id),
        planType: String(plan.planType),
      },
    });

    await paymentRepository.create({
      userId,
      razorpay_order_id: order.id,
      amount: Number(order.amount),
      priceInr: Number(plan.priceInr),
      planId: plan._id,
      planType: plan.planType,
      durationDays: plan.durationDays ?? null,
      status: 'created',
      subscriptionEndAt: null,
    });

    console.log('[PAYMENT] Order created:', {
      userId: String(userId),
      order_id: order.id,
      amount: order.amount,
      planType: plan.planType,
    });

    return {
      order_id: order.id,
      key_id: env.razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      plan: {
        planId: String(plan._id),
        planType: plan.planType,
        name: plan.name,
      },
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
      const user = await healSubscriptionForRecordedPayment(userId, existing);
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

    const existingOrder = await paymentRepository.findByOrderId(orderId);
    if (existingOrder && existingOrder.userId.toString() !== String(userId)) {
      throw new AppError('Payment order does not belong to this user', HTTP_STATUS.CONFLICT);
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

    const record = existingOrder || (await paymentRepository.create({
      userId,
      razorpay_order_id: orderId,
      amount: Number(remote.amount),
      priceInr: Math.round(Number(remote.amount) / 100),
      planType: null,
      durationDays: PREMIUM_SUBSCRIPTION_DAYS,
      status: 'created',
      subscriptionEndAt: null,
    }));

    const plan = normalizeRecordedPlan(record);
    const userBefore = await userRepository.findById(userId);
    if (!userBefore) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }
    const subscriptionEnd = subscriptionEndFromPlan(userBefore, plan);

    await paymentRepository.updateByOrderId(orderId, {
      razorpay_payment_id: paymentId,
      amount: Number(remote.amount),
      status: String(remote.status),
      subscriptionEndAt: subscriptionEnd,
    });

    const user = await userRepository.setSubscriptionAfterPayment(userId, {
      subscriptionEnd,
      plan: plan.type || userBefore?.plan || 'monthly',
      currentPlanId: record?.planId || null,
      currentPlanType: plan.type,
    });
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
