import { Router } from 'express';
import { topicController } from '../controllers/topicController.js';
import { adminChain } from '../middlewares/adminGuard.js';
import { authOptional } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  createTopicValidators,
  updateTopicValidators,
} from '../validators/topicValidators.js';

const router = Router();

router.get('/', authOptional, topicController.list);
router.get('/:id', topicController.getById);

router.post(
  '/',
  ...adminChain,
  createTopicValidators,
  validateRequest,
  topicController.create
);

router.patch(
  '/:id',
  ...adminChain,
  updateTopicValidators,
  validateRequest,
  topicController.update
);

export default router;
