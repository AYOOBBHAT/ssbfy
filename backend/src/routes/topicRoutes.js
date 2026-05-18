import { Router } from 'express';
import { topicController } from '../controllers/topicController.js';
import { adminChain } from '../middlewares/adminGuard.js';
import { authOptional } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  createTopicValidators,
  updateTopicValidators,
} from '../validators/topicValidators.js';
import {
  aliasTopicTaxonomyValidators,
  mergeTopicsTaxonomyValidators,
  renameTopicTaxonomyValidators,
  splitTopicTaxonomyValidators,
} from '../validators/topicTaxonomyValidators.js';

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

router.post(
  '/taxonomy/backfill',
  ...adminChain,
  topicController.taxonomyBackfill
);

router.post(
  '/taxonomy/merge',
  ...adminChain,
  mergeTopicsTaxonomyValidators,
  validateRequest,
  topicController.taxonomyMerge
);

router.post(
  '/:id/taxonomy/rename',
  ...adminChain,
  renameTopicTaxonomyValidators,
  validateRequest,
  topicController.taxonomyRename
);

router.post(
  '/:id/taxonomy/alias',
  ...adminChain,
  aliasTopicTaxonomyValidators,
  validateRequest,
  topicController.taxonomyAlias
);

router.post(
  '/:id/taxonomy/split',
  ...adminChain,
  splitTopicTaxonomyValidators,
  validateRequest,
  topicController.taxonomySplit
);

export default router;
