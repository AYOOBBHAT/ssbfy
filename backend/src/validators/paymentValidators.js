import { body } from 'express-validator';

export const createOrderValidators = [
  body('amount')
    .optional()
    .isInt({ min: 1, max: 10_000_000 })
    .withMessage('amount (INR) must be a positive integer'),
];

export const verifyPaymentValidators = [
  body('razorpay_order_id').trim().notEmpty().withMessage('razorpay_order_id is required'),
  body('razorpay_payment_id').trim().notEmpty().withMessage('razorpay_payment_id is required'),
  body('razorpay_signature').trim().notEmpty().withMessage('razorpay_signature is required'),
];
