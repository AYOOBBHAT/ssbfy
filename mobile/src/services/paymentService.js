import api, { getApiErrorMessage } from './api.js';
import RazorpayCheckout from 'react-native-razorpay';

/**
 * @param {string} planId selected subscription plan id
 * @returns {Promise<{ order_id: string, key_id: string, amount: number, currency: string, receipt?: string }>}
 */
export async function createPremiumOrder(planId) {
  const { data } = await api.post('/payments/create-order', {
    planId,
  });
  return data?.data ?? {};
}

export async function getSubscriptionPlans() {
  const { data } = await api.get('/subscription-plans');
  const payload = data?.data ?? {};
  return {
    plans: Array.isArray(payload.plans) ? payload.plans : [],
  };
}

/**
 * @param {{ razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string }} payload
 */
export async function verifyPremiumPayment(payload) {
  const { data } = await api.post('/payments/verify', payload);
  return data?.data ?? {};
}

/**
 * Opens Razorpay checkout for a server-created order.
 * @returns {Promise<object>} Success payload (includes razorpay_payment_id, razorpay_order_id, razorpay_signature)
 */
export async function openRazorpayForOrder(order, user) {
  const options = {
    description: 'SSBFY Premium',
    currency: order.currency || 'INR',
    key: order.key_id,
    amount: String(order.amount),
    name: 'SSBFY',
    order_id: order.order_id,
    theme: { color: '#2563eb' },
    prefill: {
      email: user?.email ? String(user.email) : '',
      name: user?.name ? String(user.name) : '',
    },
  };

  try {
    return await RazorpayCheckout.open(options);
  } catch (err) {
    const msg = err?.message != null ? String(err.message) : '';
    if (msg.includes('Native module') || msg.includes('RNRazorpayCheckout')) {
      throw new Error(
        'Payments need a dev build with native Razorpay. Run: npx expo prebuild && npx expo run:android (or run:ios).'
      );
    }
    throw err;
  }
}

/**
 * Maps Razorpay / network / API failures to short, trustworthy copy.
 */
export function formatPaymentError(error) {
  if (!error) return 'Something went wrong. Please try again.';

  const code = error.code != null ? String(error.code) : '';
  const desc = typeof error.description === 'string' ? error.description : '';
  const lower = `${code} ${desc}`.toLowerCase();

  if (
    lower.includes('cancel') ||
    code === '2' ||
    code === 'BACK_BUTTON' ||
    desc.toLowerCase().includes('payment cancelled')
  ) {
    return 'Payment was cancelled.';
  }

  if (error.message && String(error.message).includes('dev build')) {
    return String(error.message);
  }

  const apiMsg = getApiErrorMessage(error);
  if (apiMsg.includes('not configured') || apiMsg.includes('Payment service')) {
    return 'Payments are temporarily unavailable. Please try again later.';
  }
  if (apiMsg.includes('signature') || apiMsg.includes('Invalid payment')) {
    return 'We could not confirm this payment. If you were charged, contact support with your receipt.';
  }
  if (apiMsg.includes('Network') || apiMsg.includes('timeout')) {
    return 'Network issue. Check your connection and try again.';
  }

  if (apiMsg && apiMsg !== 'Something went wrong') {
    return apiMsg;
  }

  if (desc) return desc;
  return 'Payment could not be completed. Please try again.';
}
