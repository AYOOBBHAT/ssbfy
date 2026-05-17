import { Router } from 'express';
import { dailyPracticeController } from '../controllers/dailyPracticeController.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

/** Daily practice is free — not gated by mock-test device quota. */
router.get('/', authenticate, dailyPracticeController.list);
router.post('/complete', authenticate, dailyPracticeController.complete);

export default router;
