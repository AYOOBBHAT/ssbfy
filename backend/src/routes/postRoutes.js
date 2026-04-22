import { Router } from 'express';
import { postController } from '../controllers/postController.js';
import { adminChain } from '../middlewares/adminGuard.js';
import { validateRequest } from '../middlewares/validate.js';
import { createPostValidators } from '../validators/postValidators.js';

const router = Router();

router.get('/', postController.getPosts);
router.get('/:id', postController.getById);

// `adminChain` spreads to [authenticate, requireRole('admin')] so this
// route is blocked for anonymous and non-admin users.
router.post(
  '/',
  ...adminChain,
  createPostValidators,
  validateRequest,
  postController.createPost
);

export default router;
