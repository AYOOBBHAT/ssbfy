import { paymentService } from '../services/paymentService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const adminPaymentController = {
  list: asyncHandler(async (req, res) => {
    const data = await paymentService.listPaymentsForAdmin(req.query);
    return sendSuccess(res, data, 'Payments');
  }),

  reconcile: asyncHandler(async (req, res) => {
    const orderId = req.body?.orderId ?? req.body?.razorpay_order_id;
    const data = await paymentService.reconcileOrderForAdmin(orderId);
    return sendSuccess(res, data, data?.ok ? 'Reconciliation complete' : 'No captured payment');
  }),
};
