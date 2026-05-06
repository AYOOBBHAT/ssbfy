import { Router } from 'express';
import { paymentController } from '../controllers/paymentController.js';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import { createOrderValidators, verifyPaymentValidators } from '../validators/paymentValidators.js';
import { paymentLimiter, webhookLimiter } from '../middlewares/upstashRateLimiter.js';

const router = Router();

router.post('/webhook', webhookLimiter, paymentController.webhook);

router.use(authenticate);

router.post(
  '/create-order',
  paymentLimiter,
  createOrderValidators,
  validateRequest,
  paymentController.createOrder
);

router.post(
  '/verify',
  paymentLimiter,
  verifyPaymentValidators,
  validateRequest,
  paymentController.verify
);

export default router;
