import { Router } from 'express';
import { appVersionController } from '../controllers/appVersionController.js';
import { appVersionLimiter } from '../middlewares/upstashRateLimiter.js';

const router = Router();

router.get('/app/version', appVersionLimiter, appVersionController.getVersion);

export default router;
