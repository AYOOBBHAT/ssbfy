import { adminSubscriptionPlanService } from '../services/adminSubscriptionPlanService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/response.js';

export const adminSubscriptionPlanController = {
  list: asyncHandler(async (_req, res) => {
    const plans = await adminSubscriptionPlanService.list();
    return sendSuccess(res, { plans }, 'Subscription plans');
  }),

  create: asyncHandler(async (req, res) => {
    const plan = await adminSubscriptionPlanService.create(req.body);
    return sendCreated(res, { plan }, 'Subscription plan created');
  }),

  update: asyncHandler(async (req, res) => {
    const plan = await adminSubscriptionPlanService.update(req.params.id, req.body);
    return sendSuccess(res, { plan }, 'Subscription plan updated');
  }),

  setStatus: asyncHandler(async (req, res) => {
    const plan = await adminSubscriptionPlanService.setStatus(
      req.params.id,
      req.body.isActive
    );
    return sendSuccess(res, { plan }, 'Subscription plan status updated');
  }),

  moveUp: asyncHandler(async (req, res) => {
    const plan = await adminSubscriptionPlanService.moveUp(req.params.id);
    return sendSuccess(res, { plan }, 'Subscription plan reordered');
  }),

  moveDown: asyncHandler(async (req, res) => {
    const plan = await adminSubscriptionPlanService.moveDown(req.params.id);
    return sendSuccess(res, { plan }, 'Subscription plan reordered');
  }),
};
