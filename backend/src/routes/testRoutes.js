import { Router } from 'express';
import { testController } from '../controllers/testController.js';
import { authenticate, authOptional } from '../middlewares/auth.js';
import { adminChain } from '../middlewares/adminGuard.js';
import { checkTestAccess } from '../middlewares/checkTestAccess.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  saveProgressValidators,
  startTestValidators,
  submitTestValidators,
  testIdParam,
} from '../validators/testAttemptValidators.js';
import { createTestValidators, setTestStatusValidators } from '../validators/testValidators.js';

const router = Router();

router.post(
  '/:id/start',
  authenticate,
  ...testIdParam,
  startTestValidators,
  validateRequest,
  checkTestAccess,
  testController.start
);

router.post(
  '/:id/submit',
  authenticate,
  ...testIdParam,
  submitTestValidators,
  validateRequest,
  testController.submit
);

router.patch(
  '/:id/progress',
  authenticate,
  ...testIdParam,
  saveProgressValidators,
  validateRequest,
  checkTestAccess,
  testController.saveProgress
);

router.get(
  '/:id/attempts',
  authenticate,
  ...testIdParam,
  validateRequest,
  testController.attemptsHistory
);

router.get('/status/mine', authenticate, testController.statusMine);

router.post(
  '/',
  ...adminChain,
  createTestValidators,
  validateRequest,
  testController.create
);

router.get(
  '/admin/list',
  ...adminChain,
  testController.listAdmin
);

router.patch(
  '/:id/status',
  ...adminChain,
  ...testIdParam,
  setTestStatusValidators,
  validateRequest,
  testController.setStatus
);

router.get('/', authOptional, testController.list);
router.get('/:id', ...testIdParam, validateRequest, testController.getById);

export default router;
