import { Router } from 'express';
import { adminPaymentController } from '../controllers/adminPaymentController.js';
import { adminChain } from '../middlewares/adminGuard.js';

const router = Router();

router.get('/', ...adminChain, adminPaymentController.list);
router.post('/reconcile', ...adminChain, adminPaymentController.reconcile);

export default router;
