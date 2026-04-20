import { Router } from 'express';
import { testController } from '../controllers/testController.js';
import { authenticate } from '../middlewares/auth.js';
import { adminChain } from '../middlewares/adminGuard.js';
import { checkTestAccess } from '../middlewares/checkTestAccess.js';
import { validateRequest } from '../middlewares/validate.js';
import { submitTestValidators, testIdParam } from '../validators/testAttemptValidators.js';
import { createTestValidators } from '../validators/testValidators.js';

const router = Router();

router.post(
  '/:id/start',
  authenticate,
  ...testIdParam,
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

router.post(
  '/',
  ...adminChain,
  createTestValidators,
  validateRequest,
  testController.create
);

router.get('/', testController.list);
router.get('/:id', ...testIdParam, validateRequest, testController.getById);

export default router;
