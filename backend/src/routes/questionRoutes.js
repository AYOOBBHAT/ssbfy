import { Router } from 'express';
import { questionController } from '../controllers/questionController.js';
import { validateRequest } from '../middlewares/validate.js';
import { authenticate } from '../middlewares/auth.js';
import { adminChain } from '../middlewares/adminGuard.js';
import {
  createQuestionValidators,
  listQuestionsQueryValidators,
  questionIdParam,
  smartPracticeBodyValidators,
  updateQuestionValidators,
  weakPracticeValidators,
} from '../validators/questionValidators.js';

const router = Router();

// Future: POST /bulk — admin bulk insert for large imports (1000+ rows).

router.get(
  '/',
  listQuestionsQueryValidators,
  validateRequest,
  questionController.list
);

// MUST come before GET /:id — otherwise Express would try to treat
// "weak-practice" as an ObjectId and the route would 400.
router.get(
  '/weak-practice',
  weakPracticeValidators,
  validateRequest,
  questionController.weakPractice
);

router.post(
  '/smart-practice',
  authenticate,
  smartPracticeBodyValidators,
  validateRequest,
  questionController.smartPractice
);

router.post(
  '/',
  ...adminChain,
  createQuestionValidators,
  validateRequest,
  questionController.create
);

router.get('/:id', questionIdParam, validateRequest, questionController.getById);

router.put(
  '/:id',
  ...adminChain,
  ...questionIdParam,
  updateQuestionValidators,
  validateRequest,
  questionController.update
);

router.delete(
  '/:id',
  ...adminChain,
  ...questionIdParam,
  validateRequest,
  questionController.remove
);

export default router;
