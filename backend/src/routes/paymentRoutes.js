import { Router } from 'express';
import { paymentController } from '../controllers/paymentController.js';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import { createOrderValidators, verifyPaymentValidators } from '../validators/paymentValidators.js';

const router = Router();

router.post('/webhook', paymentController.webhook);

router.use(authenticate);

router.post(
  '/create-order',
  createOrderValidators,
  validateRequest,
  paymentController.createOrder
);

router.post('/verify', verifyPaymentValidators, validateRequest, paymentController.verify);

export default router;
