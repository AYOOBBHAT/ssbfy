import { body } from 'express-validator';

export const changePasswordValidators = [
  body('currentPassword')
    .isString()
    .withMessage('Current password is required')
    .bail()
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isString()
    .withMessage('New password is required')
    .bail()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('confirmPassword')
    .isString()
    .withMessage('Confirm password is required')
    .bail()
    .notEmpty()
    .withMessage('Confirm password is required'),
];
