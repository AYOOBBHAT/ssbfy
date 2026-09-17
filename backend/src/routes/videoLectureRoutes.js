import { Router } from 'express';
import { videoLectureController } from '../controllers/videoLectureController.js';
import { adminChain } from '../middlewares/adminGuard.js';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  adminMutationLimiter,
  lecturePlaybackLimiter,
  lectureReadLimiter,
  lectureUploadUrlLimiter,
} from '../middlewares/upstashRateLimiter.js';
import {
  lectureIdParam,
  listLecturesValidators,
  listStudentLecturesValidators,
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
  ...adminChain,
  lectureUploadUrlLimiter,
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

router.get(
  '/',
  lectureReadLimiter,
  authenticate,
  listStudentLecturesValidators,
  validateRequest,
  videoLectureController.listPublished
);

router.post(
  '/:id/playback',
  lecturePlaybackLimiter,
  authenticate,
  ...lectureIdParam,
  validateRequest,
  videoLectureController.authorizePlayback
);

router.get(
  '/:id',
  lectureReadLimiter,
  authenticate,
  ...lectureIdParam,
  validateRequest,
  videoLectureController.getPublished
);

export default router;
