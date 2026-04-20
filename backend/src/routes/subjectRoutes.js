import { Router } from 'express';
import { subjectController } from '../controllers/subjectController.js';
import { adminChain } from '../middlewares/adminGuard.js';
import { authOptional } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  createSubjectValidators,
  updateSubjectValidators,
} from '../validators/subjectValidators.js';

const router = Router();

// `authOptional` so anonymous traffic still works (mobile users), but an
// admin token unlocks `?includeInactive=true` for the admin panel.
router.get('/', authOptional, subjectController.list);
router.get('/:id', subjectController.getById);

router.post(
  '/',
  ...adminChain,
  createSubjectValidators,
  validateRequest,
  subjectController.create
);

router.patch(
  '/:id',
  ...adminChain,
  updateSubjectValidators,
  validateRequest,
  subjectController.update
);

export default router;
