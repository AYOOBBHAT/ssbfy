import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  forgotPasswordValidators,
  loginValidators,
  resetPasswordValidators,
  signupValidators,
} from '../validators/authValidators.js';

const router = Router();

router.post('/signup', signupValidators, validateRequest, authController.signup);
router.post('/login', loginValidators, validateRequest, authController.login);
router.post(
  '/forgot-password',
  forgotPasswordValidators,
  validateRequest,
  authController.forgotPassword
);
router.post(
  '/reset-password',
  resetPasswordValidators,
  validateRequest,
  authController.resetPassword
);

export default router;
