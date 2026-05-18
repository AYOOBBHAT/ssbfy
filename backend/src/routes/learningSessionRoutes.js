import { Router } from 'express';
import { learningSessionController } from '../controllers/learningSessionController.js';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  learningSessionIdParam,
  listRecentLearningSessionsQuery,
} from '../validators/learningSessionValidators.js';

const router = Router();

router.get(
  '/recent',
  authenticate,
  listRecentLearningSessionsQuery,
  validateRequest,
  learningSessionController.listRecent
);

router.get(
  '/:sessionId',
  authenticate,
  learningSessionIdParam,
  validateRequest,
  learningSessionController.getById
);

export default router;
