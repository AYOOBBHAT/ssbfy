import { Router } from 'express';
import { videoLectureController } from '../controllers/videoLectureController.js';
import { adminChain } from '../middlewares/adminGuard.js';
import { validateRequest } from '../middlewares/validate.js';
import { adminMutationLimiter } from '../middlewares/upstashRateLimiter.js';
import {
  lectureIdParam,
  listLecturesValidators,
  provisionUploadValidators,
  updateLectureValidators,
} from '../validators/videoLectureValidators.js';

const router = Router();

/**
 * Cloudflare Stream webhooks are mounted at POST /api/webhooks/cloudflare/stream
 * (HMAC raw body). Do not register an unauthenticated webhook on this admin router.
 */

router.post(
  '/admin/upload-url',
  adminMutationLimiter,
  ...adminChain,
  provisionUploadValidators,
  validateRequest,
  videoLectureController.provisionUpload
);

router.get(
  '/admin',
  ...adminChain,
  listLecturesValidators,
  validateRequest,
  videoLectureController.listAdmin
);

router.patch(
  '/admin/:id/archive',
  adminMutationLimiter,
  ...adminChain,
  ...lectureIdParam,
  validateRequest,
  videoLectureController.archive
);

router.get(
  '/admin/:id',
  ...adminChain,
  ...lectureIdParam,
  validateRequest,
  videoLectureController.getAdmin
);

router.patch(
  '/admin/:id',
  adminMutationLimiter,
  ...adminChain,
  updateLectureValidators,
  validateRequest,
  videoLectureController.update
);

export default router;
