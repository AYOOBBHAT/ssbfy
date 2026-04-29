import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { subscriptionPlanService } from '../services/subscriptionPlanService.js';

export const subscriptionPlanController = {
  listActive: asyncHandler(async (_req, res) => {
    const plans = await subscriptionPlanService.listActivePlans();
    return sendSuccess(res, { plans }, 'Subscription plans');
  }),
};
