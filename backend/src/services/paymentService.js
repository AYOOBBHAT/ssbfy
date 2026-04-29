import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { isPremiumUser } from '../utils/freeTierAccess.js';
import { userRepository } from '../repositories/userRepository.js';
import { paymentRepository } from '../repositories/paymentRepository.js';
import { subscriptionPlanRepository } from '../repositories/subscriptionPlanRepository.js';
import { subscriptionPlanService } from './subscriptionPlanService.js';

const RAZORPAY_ID_RE = /^[a-zA-Z0-9_-]+$/;
const VERIFY_FAILED_MESSAGE = 'Payment verification failed. Please contact support.';

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

/**
 * Strict: read the plan snapshot off a Payment record. Throws 409 if the
 * record is not a usable plan snapshot. NEVER silently substitutes a
 * default duration — that was the historical bug.
 */
function planFromRecord(record) {
  const type = record?.planType;
  if (type === 'lifetime') {
    return { type: 'lifetime', days: null };
  }
  if (!type) {
    throw new AppError(VERIFY_FAILED_MESSAGE, HTTP_STATUS.CONFLICT);
  }
  const days = record?.durationDays;
  if (!Number.isInteger(days) || days <= 0) {
    throw new AppError(VERIFY_FAILED_MESSAGE, HTTP_STATUS.CONFLICT);
  }
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

/**
 * If the Payment snapshot is missing for an orderId at verify time, we can
 * still recover safely: the Razorpay order's `notes.planId` was written by
 * THIS server's `createOrder` and is tamper-proof from the client. We
 * re-fetch the SubscriptionPlan and rebuild the snapshot. If anything is
 * inconsistent, return null and the caller will reject the verify.
 *
 * Returns null on any failure — caller MUST throw 409, never silently grant.
 */
async function tryRecoverPlanFromOrderNotes(orderId, userId) {
  try {
    const rzp = getClient();
    const order = await rzp.orders.fetch(orderId);
    const notedUserId = order?.notes?.userId ? String(order.notes.userId) : '';
    const notedPlanId = order?.notes?.planId ? String(order.notes.planId) : '';
    if (!notedUserId || !notedPlanId) return null;
    if (notedUserId !== String(userId)) return null;
    const plan = await subscriptionPlanRepository.findById(notedPlanId);
    if (!plan) return null;
    const isLifetime = plan.planType === 'lifetime';
    if (!isLifetime) {
      if (!Number.isInteger(plan.durationDays) || plan.durationDays <= 0) return null;
    }
    return {
      planId: plan._id,
      planType: plan.planType,
      durationDays: isLifetime ? null : plan.durationDays,
      priceInr: Number(plan.priceInr),
    };
  } catch (err) {
    console.log('[PAYMENT] Order notes recovery failed:', { orderId, message: err?.message });
    return null;
  }
}

async function healSubscriptionForRecordedPayment(userId, record) {
  let user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
  }
  if (isPremiumUser(user)) {
    return user;
  }
  const plan = planFromRecord(record);
  const subscriptionEnd = subscriptionEndFromPlan(user, plan);
  user = await userRepository.setSubscriptionAfterPayment(userId, {
    subscriptionEnd,
    plan: plan.type,
    currentPlanId: record?.planId || null,
    currentPlanType: plan.type,
  });
  if (record?.razorpay_order_id) {
    await paymentRepository.updateByOrderId(record.razorpay_order_id, { subscriptionEndAt: subscriptionEnd });
  }
  console.log('[PAYMENT] Healing subscription for existing payment:', {
    userId: String(userId),
    paymentId: record?.razorpay_payment_id,
    planType: plan.type,
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

    // Race protection: if another concurrent verify already linked this
    // order to this payment id, route through heal (which is a no-op for
    // already-premium users, preventing double-grants).
    if (existingOrder?.razorpay_payment_id === paymentId) {
      const user = await healSubscriptionForRecordedPayment(userId, existingOrder);
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

    // Race protection: a concurrent verify may have claimed this order while
    // the Razorpay network fetch was in flight. Re-check before granting.
    const postFetch = await paymentRepository.findByOrderId(orderId);
    if (postFetch?.razorpay_payment_id === paymentId) {
      const user = await healSubscriptionForRecordedPayment(userId, postFetch);
      return {
        user,
        subscriptionEnd: user.subscriptionEnd,
        plan: user.plan,
        idempotent: true,
      };
    }

    let record = postFetch || existingOrder;
    if (!record) {
      // Order was paid via Razorpay but no Payment snapshot exists in our DB
      // (createOrder DB write failed, off-band order, etc). Recover SAFELY
      // from the tamper-proof `notes.planId` we set at order creation.
      // If we can't recover, REJECT — never silently assign a default duration.
      const recovered = await tryRecoverPlanFromOrderNotes(orderId, userId);
      if (!recovered) {
        console.log('[PAYMENT] Verify rejected — missing Payment snapshot and no recoverable plan:', {
          userId: String(userId),
          orderId,
          paymentId,
        });
        throw new AppError(VERIFY_FAILED_MESSAGE, HTTP_STATUS.CONFLICT);
      }
      record = await paymentRepository.create({
        userId,
        razorpay_order_id: orderId,
        amount: Number(remote.amount),
        priceInr: recovered.priceInr,
        planId: recovered.planId,
        planType: recovered.planType,
        durationDays: recovered.durationDays,
        status: 'created',
        subscriptionEndAt: null,
      });
      console.log('[PAYMENT] Recovered plan snapshot from order notes:', {
        userId: String(userId),
        orderId,
        planType: recovered.planType,
      });
    }

    const plan = planFromRecord(record);
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
      plan: plan.type,
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
      planType: plan.type,
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
