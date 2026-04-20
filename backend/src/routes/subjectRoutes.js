import { Router } from 'express';
import { subjectController } from '../controllers/subjectController.js';

const router = Router();

router.get('/', subjectController.list);
router.get('/:id', subjectController.getById);

export default router;
