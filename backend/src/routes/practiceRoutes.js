import { Router } from 'express';
import { practiceController } from '../controllers/practiceController.js';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import { practiceRevealValidators } from '../validators/practiceValidators.js';

const router = Router();

router.post(
  '/reveal',
  authenticate,
  practiceRevealValidators,
  validateRequest,
  practiceController.reveal
);

export default router;
