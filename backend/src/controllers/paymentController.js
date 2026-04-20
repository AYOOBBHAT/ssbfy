import { paymentService } from '../services/paymentService.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/response.js';

export const paymentController = {
  createOrder: asyncHandler(async (req, res) => {
    const amountInr = req.body.amount != null ? req.body.amount : env.razorpayDefaultAmountInr;
    const payload = await paymentService.createOrder(req.user.id, amountInr);
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
        isPremium: user.isPremium,
        plan,
        idempotent,
      },
      'Payment verified'
    );
  }),
};
