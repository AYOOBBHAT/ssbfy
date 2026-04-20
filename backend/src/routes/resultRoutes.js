import { Router } from 'express';
import { resultController } from '../controllers/resultController.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', resultController.listMine);
router.get('/:id', resultController.getById);

export default router;
