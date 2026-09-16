import { Router } from 'express';
import { cloudflareStreamWebhookController } from '../controllers/cloudflareStreamWebhookController.js';
import { webhookLimiter } from '../middlewares/upstashRateLimiter.js';

const router = Router();

router.post('/stream', webhookLimiter, cloudflareStreamWebhookController.handleStream);

export default router;
