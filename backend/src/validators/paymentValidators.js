import { body } from 'express-validator';

export const createOrderValidators = [
  body('planId')
    .exists({ checkFalsy: true })
    .withMessage('planId is required')
    .bail()
    .isMongoId()
    .withMessage('planId must be a valid id'),
];

export const verifyPaymentValidators = [
  body('razorpay_order_id').trim().notEmpty().withMessage('razorpay_order_id is required'),
  body('razorpay_payment_id').trim().notEmpty().withMessage('razorpay_payment_id is required'),
  body('razorpay_signature').trim().notEmpty().withMessage('razorpay_signature is required'),
];
