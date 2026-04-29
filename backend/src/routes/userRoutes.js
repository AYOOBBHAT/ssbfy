import { Router } from 'express';
import { userController } from '../controllers/userController.js';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import { changePasswordValidators } from '../validators/userValidators.js';

const router = Router();

router.get('/me', authenticate, userController.me);
router.get('/profile-analytics', authenticate, userController.profileAnalytics);
router.patch(
  '/change-password',
  authenticate,
  changePasswordValidators,
  validateRequest,
  userController.changePassword
);

export default router;
