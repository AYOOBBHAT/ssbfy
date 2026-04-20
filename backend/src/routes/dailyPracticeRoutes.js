import { Router } from 'express';
import { dailyPracticeController } from '../controllers/dailyPracticeController.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.get('/', dailyPracticeController.list);
router.post('/complete', authenticate, dailyPracticeController.complete);

export default router;
