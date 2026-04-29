import { body } from 'express-validator';

export const signupValidators = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
];

export const loginValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

/** STEP 1: send-otp — only an email is required. */
export const sendOtpValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
];

/** STEP 2: verify-otp — email + 6-digit code. */
export const verifyOtpValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('otp')
    .trim()
    .matches(/^\d{6}$/)
    .withMessage('OTP must be a 6-digit code'),
];

/**
 * STEP 3: reset-password — email + opaque resetToken (issued by verify-otp)
 * + new password + confirm password. The OTP is intentionally NOT accepted
 * here: by this point it has been consumed and replaced by the resetToken,
 * which means the OTP secret never travels in this request payload.
 */
export const resetPasswordValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('resetToken')
    .isString()
    .trim()
    .isLength({ min: 16, max: 256 })
    .withMessage('Reset token is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('confirmPassword')
    .isLength({ min: 8 })
    .withMessage('Confirm password must be at least 8 characters')
    .bail()
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match'),
];
