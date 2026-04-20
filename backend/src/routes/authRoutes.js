import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { validateRequest } from '../middlewares/validate.js';
import { loginValidators, signupValidators } from '../validators/authValidators.js';

const router = Router();

router.post('/signup', signupValidators, validateRequest, authController.signup);
router.post('/login', loginValidators, validateRequest, authController.login);

export default router;
