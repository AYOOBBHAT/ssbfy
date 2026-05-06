import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { isPremiumUser } from '../utils/freeTierAccess.js';
import { userRepository } from '../repositories/userRepository.js';
import { paymentRepository } from '../repositories/paymentRepository.js';
import { webhookEventRepository } from '../repositories/webhookEventRepository.js';
import { subscriptionPlanRepository } from '../repositories/subscriptionPlanRepository.js';
import { subscriptionPlanService } from './subscriptionPlanService.js';
import { logger } from '../utils/logger.js';

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

function mergeVerificationSource(prev, incoming) {
  if (!incoming) return prev || null;
  const p = prev || null;
  if (!p) return incoming;
  if (p === incoming) return p;
  if (p === 'both' || incoming === 'both') return 'both';
  if ((p === 'client' && incoming === 'webhook') || (p === 'webhook' && incoming === 'client')) {
    return 'both';
  }
  return incoming;
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
    logger.info('[PAYMENT] Order notes recovery failed:', { orderId, message: err?.message });
    return null;
  }
}

async function readUserIdFromRazorpayOrder(orderId) {
  try {
    const rzp = getClient();
    const order = await rzp.orders.fetch(orderId);
    const uid = order?.notes?.userId ? String(order.notes.userId) : '';
    return uid || null;
  } catch (err) {
    logger.info('[PAYMENT] Order fetch for webhook userId failed:', {
      orderId,
      message: err?.message,
    });
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
    await paymentRepository.updateByOrderId(record.razorpay_order_id, {
      subscriptionEndAt: subscriptionEnd,
    });
  }
  logger.info('[PAYMENT] Healing subscription for existing payment:', {
    userId: String(userId),
    paymentId: record?.razorpay_payment_id,
    planType: plan.type,
  });
  return user;
}

async function patchOrderVerificationMerge(razorpay_order_id, incomeSource, { eventId } = {}) {
  if (!razorpay_order_id || !incomeSource) return;
  const latest = await paymentRepository.findByOrderId(razorpay_order_id);
  if (!latest) return;
  const verificationSource = mergeVerificationSource(latest.verificationSource, incomeSource);
  const verifiedByWebhook = latest.verifiedByWebhook === true || incomeSource === 'webhook';
  const patch = {
    verificationSource,
    verifiedByWebhook,
  };
  if (incomeSource === 'webhook') {
    patch.webhookReceivedAt = new Date();
    if (eventId) patch.lastWebhookEventId = String(eventId);
  }
  await paymentRepository.updateByOrderId(razorpay_order_id, patch);
}

/**
 * Single idempotent pipeline: trusted capture/authorize + plan snapshot → Payment row + User premium.
 * Used by BOTH `/payments/verify` (fast UX) and `/payments/webhook` (reliability / self-heal).
 *
 * Preconditions: `orderId` / `paymentId` / amounts / status are already validated —
 * client path verified payment signature + Razorpay `payments.fetch`; webhook path verified
 * webhook HMAC and (for capture events) payload entity fields.
 */
async function finalizePaidOrderFromTrustedState({
  userId,
  orderId,
  paymentId,
  amountPaise,
  remoteStatus,
  incomeSource,
  webhookMeta = {},
}) {
  const status = String(remoteStatus || '').toLowerCase();
  if (status !== 'captured' && status !== 'authorized') {
    throw new AppError('Payment not completed', HTTP_STATUS.BAD_REQUEST);
  }

  const existing = await paymentRepository.findByPaymentId(paymentId);
  if (existing) {
    if (existing.userId.toString() !== String(userId)) {
      logger.info('[PAYMENT] Idempotency conflict — payment owned by another user:', { paymentId });
      throw new AppError('Payment already processed', HTTP_STATUS.CONFLICT);
    }
    await patchOrderVerificationMerge(existing.razorpay_order_id, incomeSource, webhookMeta);
    const user = await healSubscriptionForRecordedPayment(userId, existing);
    logger.info('[PAYMENT] Idempotent finalize (payment row exists):', {
      userId: String(userId),
      paymentId,
      incomeSource,
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

  if (existingOrder?.razorpay_payment_id === paymentId) {
    await patchOrderVerificationMerge(orderId, incomeSource, webhookMeta);
    const user = await healSubscriptionForRecordedPayment(userId, existingOrder);
    return {
      user,
      subscriptionEnd: user.subscriptionEnd,
      plan: user.plan,
      idempotent: true,
    };
  }

  const postFetch = await paymentRepository.findByOrderId(orderId);
  if (postFetch?.razorpay_payment_id === paymentId) {
    await patchOrderVerificationMerge(orderId, incomeSource, webhookMeta);
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
    const recovered = await tryRecoverPlanFromOrderNotes(orderId, userId);
    if (!recovered) {
      logger.info('[PAYMENT] Finalize rejected — missing Payment snapshot and no recoverable plan:', {
        userId: String(userId),
        orderId,
        paymentId,
      });
      throw new AppError(VERIFY_FAILED_MESSAGE, HTTP_STATUS.CONFLICT);
    }
    record = await paymentRepository.create({
      userId,
      razorpay_order_id: orderId,
      amount: Number(amountPaise),
      priceInr: recovered.priceInr,
      planId: recovered.planId,
      planType: recovered.planType,
      durationDays: recovered.durationDays,
      status: 'created',
      paymentStatus: 'pending',
      subscriptionEndAt: null,
      verifiedByWebhook: false,
      verificationSource: null,
    });
    logger.info('[PAYMENT] Recovered plan snapshot from order notes (finalize):', {
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

  const latest = await paymentRepository.findByOrderId(orderId);
  const verificationSource = mergeVerificationSource(latest?.verificationSource, incomeSource);
  const verifiedByWebhook = latest?.verifiedByWebhook === true || incomeSource === 'webhook';
  const payPatch = {
    razorpay_payment_id: paymentId,
    amount: Number(amountPaise),
    status,
    paymentStatus: 'paid',
    subscriptionEndAt: subscriptionEnd,
    verificationSource,
    verifiedByWebhook,
  };
  if (incomeSource === 'webhook') {
    payPatch.webhookReceivedAt = new Date();
    if (webhookMeta.eventId) payPatch.lastWebhookEventId = String(webhookMeta.eventId);
  }

  await paymentRepository.updateByOrderId(orderId, payPatch);

  const user = await userRepository.setSubscriptionAfterPayment(userId, {
    subscriptionEnd,
    plan: plan.type,
    currentPlanId: record?.planId || null,
    currentPlanType: plan.type,
  });
  if (!user) {
    throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
  }

  logger.info('[PAYMENT] Activation successful (finalize):', {
    userId: String(userId),
    paymentId,
    orderId,
    planType: plan.type,
    subscriptionEnd: user.subscriptionEnd,
    incomeSource,
    idempotent: false,
  });

  return {
    user,
    subscriptionEnd: user.subscriptionEnd,
    plan: user.plan,
    idempotent: false,
  };
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
      paymentStatus: 'pending',
      subscriptionEndAt: null,
      verifiedByWebhook: false,
      verificationSource: null,
    });

    logger.info('[PAYMENT] Order created:', {
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
      logger.info('[PAYMENT] Signature verification failed:', { userId: String(userId), paymentId });
      throw new AppError('Invalid payment signature', HTTP_STATUS.BAD_REQUEST);
    }

    const rzp = getClient();
    let remote;
    try {
      remote = await rzp.payments.fetch(paymentId);
    } catch (err) {
      logger.info('[PAYMENT] Razorpay fetch failed:', {
        userId: String(userId),
        paymentId,
        message: err?.message,
      });
      throw new AppError('Could not verify payment with Razorpay', HTTP_STATUS.BAD_GATEWAY);
    }

    if (!remote || String(remote.order_id) !== orderId) {
      logger.info('[PAYMENT] Order id mismatch:', { userId: String(userId), paymentId });
      throw new AppError('Payment does not match order', HTTP_STATUS.BAD_REQUEST);
    }

    // Race: concurrent verify or webhook may have claimed this order while we were in flight.
    const lateCheck = await paymentRepository.findByOrderId(orderId);
    if (
      lateCheck?.razorpay_payment_id &&
      lateCheck.razorpay_payment_id !== paymentId
    ) {
      logger.info('[PAYMENT] Order already linked to another payment:', {
        orderId,
        expected: paymentId,
        existing: lateCheck.razorpay_payment_id,
      });
      throw new AppError('Payment order already completed', HTTP_STATUS.CONFLICT);
    }

    return finalizePaidOrderFromTrustedState({
      userId,
      orderId,
      paymentId,
      amountPaise: Number(remote.amount),
      remoteStatus: remote.status,
      incomeSource: 'client',
      webhookMeta: {},
    });
  },

  /**
   * Razorpay webhook: call ONLY after `X-Razorpay-Signature` is verified against raw body.
   * Idempotent per `event.id` (retries short-circuit).
   */
  async processRazorpayWebhookEvent(parsedBody) {
    const eventName = String(parsedBody?.event || '');
    const eventId =
      parsedBody?.id != null && String(parsedBody.id).trim()
        ? String(parsedBody.id).trim()
        : null;

    if (eventId) {
      const { inserted } = await webhookEventRepository.tryInsertEvent({
        eventId,
        event: eventName || 'unknown',
      });
      if (!inserted) {
        logger.info('Webhook processed', { eventId, eventType: eventName, orderId: null, paymentId: null });
        return { handled: false, duplicate: true };
      }
    }

    if (eventName === 'payment.captured' || eventName === 'payment.authorized') {
      const entity = parsedBody?.payload?.payment?.entity;
      if (!entity?.id || !entity.order_id) {
        logger.info('Webhook processed', {
          eventId,
          eventType: eventName,
          orderId: null,
          paymentId: null,
          reason: 'bad_payload',
        });
        return { handled: false, reason: 'bad_payload' };
      }
      const paymentId = String(entity.id);
      const orderId = String(entity.order_id);
      const status = entity.status || eventName.replace('payment.', '');
      const amountPaise = Number(entity.amount);

      let userId = null;
      const row = await paymentRepository.findByOrderId(orderId);
      if (row?.userId) userId = String(row.userId);
      if (!userId) userId = await readUserIdFromRazorpayOrder(orderId);
      if (!userId) {
        logger.info('Webhook processed', {
          eventId,
          eventType: eventName,
          orderId,
          paymentId,
          reason: 'no_user',
        });
        return { handled: false, reason: 'no_user' };
      }

      await finalizePaidOrderFromTrustedState({
        userId,
        orderId,
        paymentId,
        amountPaise,
        remoteStatus: status,
        incomeSource: 'webhook',
        webhookMeta: { eventId },
      });
      logger.info('Webhook processed', {
        eventId,
        eventType: eventName,
        orderId,
        paymentId,
      });
      return { handled: true, eventName };
    }

    if (eventName === 'order.paid') {
      const orderEnt = parsedBody?.payload?.order?.entity;
      const orderId = orderEnt?.id ? String(orderEnt.id) : null;
      if (!orderId) {
        logger.info('Webhook processed', {
          eventId,
          eventType: eventName,
          orderId: null,
          paymentId: null,
          reason: 'bad_payload',
        });
        return { handled: false, reason: 'bad_payload' };
      }
      const rzp = getClient();
      let items = [];
      try {
        const resp = await rzp.orders.fetchPayments(orderId);
        items = resp?.items || [];
      } catch (err) {
        logger.info('Webhook processed', {
          eventId,
          eventType: eventName,
          orderId,
          paymentId: null,
          reason: 'fetch_failed',
          errorName: err?.name,
        });
        return { handled: false, reason: 'fetch_failed' };
      }
      const captured = items.find(
        (p) => p.status === 'captured' || p.status === 'authorized'
      );
      if (!captured) {
        logger.info('Webhook processed', {
          eventId,
          eventType: eventName,
          orderId,
          paymentId: null,
          reason: 'no_capture',
        });
        return { handled: false, reason: 'no_capture' };
      }
      let userId = null;
      const row = await paymentRepository.findByOrderId(orderId);
      if (row?.userId) userId = String(row.userId);
      if (!userId) userId = await readUserIdFromRazorpayOrder(orderId);
      if (!userId) {
        logger.info('Webhook processed', {
          eventId,
          eventType: eventName,
          orderId,
          paymentId: String(captured.id),
          reason: 'no_user',
        });
        return { handled: false, reason: 'no_user' };
      }

      const paymentIdPaid = String(captured.id);
      await finalizePaidOrderFromTrustedState({
        userId,
        orderId,
        paymentId: paymentIdPaid,
        amountPaise: Number(captured.amount),
        remoteStatus: captured.status,
        incomeSource: 'webhook',
        webhookMeta: { eventId },
      });
      logger.info('Webhook processed', {
        eventId,
        eventType: eventName,
        orderId,
        paymentId: paymentIdPaid,
      });
      return { handled: true, eventName };
    }

    if (eventName === 'payment.failed') {
      const entity = parsedBody?.payload?.payment?.entity;
      const orderId = entity?.order_id ? String(entity.order_id) : null;
      if (orderId) {
        const row = await paymentRepository.findByOrderId(orderId);
        const ps = String(row?.paymentStatus || '').toLowerCase();
        if (ps === 'paid' || ps === 'captured' || ps === 'authorized') {
          logger.info('Webhook processed', {
            eventId,
            eventType: eventName,
            orderId,
            paymentId: entity?.id != null ? String(entity.id) : null,
            reason: 'ignored_after_success',
          });
          return { handled: true, eventName, reason: 'ignored_after_success' };
        }
        await paymentRepository.updateByOrderId(orderId, {
          paymentStatus: 'failed',
          status: 'failed',
          webhookReceivedAt: new Date(),
          verifiedByWebhook: true,
          lastWebhookEventId: eventId || undefined,
        });
      }
      logger.info('Webhook processed', {
        eventId,
        eventType: eventName,
        orderId,
        paymentId: entity?.id != null ? String(entity.id) : null,
      });
      return { handled: true, eventName };
    }

    if (eventName === 'order.expired' || eventName === 'order.cancelled') {
      const orderEnt = parsedBody?.payload?.order?.entity;
      const orderId = orderEnt?.id ? String(orderEnt.id) : null;
      if (orderId) {
        const row = await paymentRepository.findByOrderId(orderId);
        const ps = String(row?.paymentStatus || '').toLowerCase();
        if (ps === 'paid' || ps === 'captured' || ps === 'authorized') {
          logger.info('Webhook processed', {
            eventId,
            eventType: eventName,
            orderId,
            paymentId: null,
            reason: 'ignored_after_success',
          });
          return { handled: true, eventName, reason: 'ignored_after_success' };
        }
        await paymentRepository.updateByOrderId(orderId, {
          paymentStatus: 'expired',
          status: 'expired',
          webhookReceivedAt: new Date(),
          verifiedByWebhook: true,
          lastWebhookEventId: eventId || undefined,
        });
      }
      logger.info('Webhook processed', {
        eventId,
        eventType: eventName,
        orderId,
        paymentId: null,
      });
      return { handled: true, eventName };
    }

    logger.info('Webhook processed', {
      eventId,
      eventType: eventName,
      orderId: null,
      paymentId: null,
      reason: 'unhandled',
    });
    return { handled: false, eventName, reason: 'unhandled' };
  },

  /**
   * Admin/support: re-fetch Razorpay state for an order and run the same safe finalize path.
   * Idempotent — safe to retry; does not double-stack subscription (setSubscriptionAfterPayment + heal guard).
   */
  async reconcileOrderForAdmin(orderId) {
    assertRazorpayConfigured();
    const oid = String(orderId || '').trim();
    if (!oid || !RAZORPAY_ID_RE.test(oid)) {
      throw new AppError('Invalid order id', HTTP_STATUS.BAD_REQUEST);
    }

    const rzp = getClient();
    let items = [];
    try {
      const resp = await rzp.orders.fetchPayments(oid);
      items = resp?.items || [];
    } catch (err) {
      logger.info('[PAYMENT] Admin reconcile fetchPayments failed:', { oid, message: err?.message });
      throw new AppError('Could not reach Razorpay', HTTP_STATUS.BAD_GATEWAY);
    }

    const captured = items.find((p) => p.status === 'captured' || p.status === 'authorized');
    if (!captured) {
      return {
        ok: false,
        reason: 'no_captured_payment',
        orderId: oid,
      };
    }

    let userId = null;
    const row = await paymentRepository.findByOrderId(oid);
    if (row?.userId) userId = String(row.userId);
    if (!userId) userId = await readUserIdFromRazorpayOrder(oid);
    if (!userId) {
      throw new AppError('Cannot resolve user for this order', HTTP_STATUS.CONFLICT);
    }

    const out = await finalizePaidOrderFromTrustedState({
      userId,
      orderId: oid,
      paymentId: String(captured.id),
      amountPaise: Number(captured.amount),
      remoteStatus: captured.status,
      incomeSource: 'webhook',
      webhookMeta: {},
    });

    await paymentRepository.updateByOrderId(oid, { adminReconciledAt: new Date() });

    return {
      ok: true,
      orderId: oid,
      idempotent: out.idempotent,
    };
  },

  async listPaymentsForAdmin(query) {
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 30, 1), 100);
    const skip = (page - 1) * pageSize;
    const filter = {};
    if (query.userId) filter.userId = String(query.userId).trim();
    if (query.paymentStatus) filter.paymentStatus = String(query.paymentStatus).trim();
    if (String(query.hydrationIssue || '').toLowerCase() === 'true') {
      filter.hydrationIssue = true;
    }
    const { rows, total, limit } = await paymentRepository.findForAdminList(filter, {
      limit: pageSize,
      skip,
    });
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const enriched = rows.map((p) => {
      const u = p.userId && typeof p.userId === 'object' ? p.userId : null;
      const premiumActive = u ? isPremiumUser(u) : false;
      return {
        ...p,
        userId: u?._id ?? p.userId,
        user: u ? { name: u.name, email: u.email } : null,
        premiumActivated: premiumActive,
        verificationSource: p.verificationSource ?? null,
        verifiedByWebhook: p.verifiedByWebhook === true,
        paymentStatus: p.paymentStatus || p.status || 'unknown',
      };
    });
    return {
      payments: enriched,
      pagination: { total, page, pageSize: limit, totalPages },
    };
  },
};

export { safeEqualHex };
