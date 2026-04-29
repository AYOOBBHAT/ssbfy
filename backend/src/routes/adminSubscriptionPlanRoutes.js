import { Router } from 'express';
import { adminSubscriptionPlanController } from '../controllers/adminSubscriptionPlanController.js';
import { adminChain } from '../middlewares/adminGuard.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  createPlanValidators,
  planIdParam,
  setStatusValidators,
  updatePlanValidators,
} from '../validators/subscriptionPlanAdminValidators.js';

const router = Router();

// Every route here is admin-gated. We do NOT expose any DELETE endpoint —
// plans are soft-disabled via PATCH /:id/status to preserve historical
// payment integrity (Payment records reference planId).

router.get('/', ...adminChain, adminSubscriptionPlanController.list);

router.post(
  '/',
  ...adminChain,
  createPlanValidators,
  validateRequest,
  adminSubscriptionPlanController.create
);

router.patch(
  '/:id',
  ...adminChain,
  ...planIdParam,
  updatePlanValidators,
  validateRequest,
  adminSubscriptionPlanController.update
);

router.patch(
  '/:id/status',
  ...adminChain,
  ...planIdParam,
  setStatusValidators,
  validateRequest,
  adminSubscriptionPlanController.setStatus
);

router.patch(
  '/:id/move-up',
  ...adminChain,
  ...planIdParam,
  validateRequest,
  adminSubscriptionPlanController.moveUp
);

router.patch(
  '/:id/move-down',
  ...adminChain,
  ...planIdParam,
  validateRequest,
  adminSubscriptionPlanController.moveDown
);

export default router;
