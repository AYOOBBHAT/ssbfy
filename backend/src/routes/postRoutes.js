import { Router } from 'express';
import { postController } from '../controllers/postController.js';

const router = Router();

router.get('/', postController.list);
router.get('/:id', postController.getById);

export default router;
