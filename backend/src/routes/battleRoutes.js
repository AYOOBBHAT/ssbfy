import { Router } from 'express';
import { battleController } from '../controllers/battleController.js';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import { apiLimiter } from '../middlewares/upstashRateLimiter.js';
import {
  battleAvailabilityValidators,
  battleCreateValidators,
  battleIdParamValidators,
  battleInviteParamValidators,
} from '../validators/battleValidators.js';

const router = Router();

router.use(authenticate);
router.use(apiLimiter);

router.get('/quota', battleController.quota);

router.get(
  '/availability',
  battleAvailabilityValidators,
  validateRequest,
  battleController.availability
);

router.get('/mine', battleController.listMine);

router.get('/history', battleController.history);

router.post('/', battleCreateValidators, validateRequest, battleController.create);

router.get(
  '/invite/:inviteCode',
  battleInviteParamValidators,
  validateRequest,
  battleController.previewInvite
);

router.post(
  '/join/:inviteCode',
  battleInviteParamValidators,
  validateRequest,
  battleController.join
);

router.get('/:id/result', battleIdParamValidators, validateRequest, battleController.result);

router.post('/:id/start', battleIdParamValidators, validateRequest, battleController.start);

router.get('/:id', battleIdParamValidators, validateRequest, battleController.getById);

export default router;
