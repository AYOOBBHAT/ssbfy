import { Router } from 'express';
import { userController } from '../controllers/userController.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.get('/me', authenticate, userController.me);

export default router;
