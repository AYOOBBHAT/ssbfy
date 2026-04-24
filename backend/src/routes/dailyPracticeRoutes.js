import { Router } from 'express';
import { dailyPracticeController } from '../controllers/dailyPracticeController.js';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import { checkDailyPracticeDeviceAccess } from '../middlewares/checkDailyPracticeDeviceAccess.js';
import { dailyPracticeListValidators } from '../validators/dailyPracticeValidators.js';

const router = Router();

router.get(
  '/',
  authenticate,
  dailyPracticeListValidators,
  validateRequest,
  checkDailyPracticeDeviceAccess,
  dailyPracticeController.list
);
router.post('/complete', authenticate, dailyPracticeController.complete);

export default router;
