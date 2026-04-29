import { Router } from 'express';
import { subscriptionPlanController } from '../controllers/subscriptionPlanController.js';

const router = Router();

router.get('/', subscriptionPlanController.listActive);

export default router;
