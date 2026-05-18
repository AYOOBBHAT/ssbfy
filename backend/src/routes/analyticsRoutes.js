import { Router } from 'express';
import { analyticsController } from '../controllers/analyticsController.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.get('/overview', authenticate, analyticsController.overview);

export default router;
