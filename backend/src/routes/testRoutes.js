import { Router } from 'express';
import { testController } from '../controllers/testController.js';
import { authenticate, authOptional } from '../middlewares/auth.js';
import { adminChain } from '../middlewares/adminGuard.js';
import { checkTestAccess } from '../middlewares/checkTestAccess.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  adminMutationLimiter,
  testsAttemptsReadLimiter,
  testsLifecycleLimiter,
  testsProgressLimiter,
  testsReadLimiter,
} from '../middlewares/upstashRateLimiter.js';
import {
  mockQuotaQueryValidators,
  saveProgressValidators,
  startTestValidators,
  submitTestValidators,
  testIdParam,
} from '../validators/testAttemptValidators.js';
import { createTestValidators, setTestStatusValidators } from '../validators/testValidators.js';

const router = Router();

router.post(
  '/:id/start',
  testsLifecycleLimiter,
  authenticate,
  ...testIdParam,
  startTestValidators,
  validateRequest,
  checkTestAccess,
  testController.start
);

router.post(
  '/:id/submit',
  testsLifecycleLimiter,
  authenticate,
  ...testIdParam,
  submitTestValidators,
  validateRequest,
  testController.submit
);

router.patch(
  '/:id/progress',
  testsProgressLimiter,
  authenticate,
  ...testIdParam,
  saveProgressValidators,
  validateRequest,
  checkTestAccess,
  testController.saveProgress
);

router.get(
  '/:id/attempts',
  testsAttemptsReadLimiter,
  authenticate,
  ...testIdParam,
  validateRequest,
  testController.attemptsHistory
);

router.get('/status/mine', testsReadLimiter, authenticate, testController.statusMine);

router.get(
  '/quota/device',
  testsReadLimiter,
  authenticate,
  mockQuotaQueryValidators,
  validateRequest,
  testController.mockQuota
);

router.post(
  '/',
  adminMutationLimiter,
  ...adminChain,
  createTestValidators,
  validateRequest,
  testController.create
);

router.get('/admin/list', adminMutationLimiter, ...adminChain, testController.listAdmin);

router.patch(
  '/:id/status',
  adminMutationLimiter,
  ...adminChain,
  ...testIdParam,
  setTestStatusValidators,
  validateRequest,
  testController.setStatus
);

router.get('/', testsReadLimiter, authOptional, testController.list);
router.get('/:id', testsReadLimiter, ...testIdParam, validateRequest, testController.getById);

export default router;
