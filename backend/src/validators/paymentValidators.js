import { body, param } from 'express-validator';

const RAZORPAY_ORDER_ID = /^[a-zA-Z0-9_-]+$/;

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

export const orderIdParamValidators = [
  param('orderId')
    .trim()
    .notEmpty()
    .withMessage('orderId is required')
    .matches(RAZORPAY_ORDER_ID)
    .withMessage('orderId format is invalid'),
];
