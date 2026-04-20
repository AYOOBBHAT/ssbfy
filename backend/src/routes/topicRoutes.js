import { Router } from 'express';
import { topicController } from '../controllers/topicController.js';

const router = Router();

router.get('/', topicController.list);
router.get('/:id', topicController.getById);

export default router;
