import { Router } from 'express';
import { practiceController } from '../controllers/practiceController.js';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  practiceIssueLimiter,
  practiceRevealLimiter,
} from '../middlewares/upstashRateLimiter.js';
import {
  practiceIssueValidators,
  practiceRevealValidators,
} from '../validators/practiceValidators.js';

const router = Router();

router.post(
  '/issue',
  practiceIssueLimiter,
  authenticate,
  practiceIssueValidators,
  validateRequest,
  practiceController.issue
);

router.post(
  '/reveal',
  practiceRevealLimiter,
  authenticate,
  practiceRevealValidators,
  validateRequest,
  practiceController.reveal
);

export default router;
