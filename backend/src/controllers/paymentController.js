import { paymentService } from '../services/paymentService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/response.js';
import { isPremiumUser } from '../utils/freeTierAccess.js';

export const paymentController = {
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
