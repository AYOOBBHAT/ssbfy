import { Router } from 'express';
import { questionController } from '../controllers/questionController.js';
import { validateRequest } from '../middlewares/validate.js';
import { authenticate } from '../middlewares/auth.js';
import { adminChain } from '../middlewares/adminGuard.js';
import { handleCsvUpload } from '../middlewares/upload.js';
import {
  adminListQuestionsQueryValidators,
  bulkPostTagsBodyValidators,
  bulkStatusValidators,
  createQuestionValidators,
  importCommitBodyValidators,
  listQuestionsQueryValidators,
  questionIdParam,
  similarQueryValidators,
  smartPracticeBodyValidators,
  updateQuestionValidators,
  weakPracticeValidators,
} from '../validators/questionValidators.js';

const router = Router();

router.get(
  '/',
  listQuestionsQueryValidators,
  validateRequest,
  questionController.list
);

// MUST come before GET /:id — otherwise Express would try to treat
// "weak-practice" as an ObjectId and the route would 400.
router.get(
  '/weak-practice',
  weakPracticeValidators,
  validateRequest,
  questionController.weakPractice
);

router.get(
  '/admin',
  ...adminChain,
  adminListQuestionsQueryValidators,
  validateRequest,
  questionController.adminList
);

// Admin polish endpoints. Order matters: every literal-segment route here
// must precede the parametric `/admin/:id` route below or Express will
// try to treat "import"/"similar"/"bulk-status"/"bulk-*-post-tags" as a Mongo id.
router.get(
  '/admin/import/template',
  ...adminChain,
  questionController.importTemplate
);

router.post(
  '/admin/import/dry-run',
  ...adminChain,
  handleCsvUpload,
  questionController.importDryRun
);

router.post(
  '/admin/import/commit',
  ...adminChain,
  handleCsvUpload,
  importCommitBodyValidators,
  validateRequest,
  questionController.importCommit
);

router.post(
  '/admin/bulk-status',
  ...adminChain,
  bulkStatusValidators,
  validateRequest,
  questionController.bulkSetStatus
);

router.post(
  '/admin/bulk-add-post-tags',
  ...adminChain,
  bulkPostTagsBodyValidators,
  validateRequest,
  questionController.bulkAddPostTags
);

router.post(
  '/admin/bulk-remove-post-tags',
  ...adminChain,
  bulkPostTagsBodyValidators,
  validateRequest,
  questionController.bulkRemovePostTags
);

router.get(
  '/admin/similar',
  ...adminChain,
  similarQueryValidators,
  validateRequest,
  questionController.findSimilar
);

router.get(
  '/admin/:id/usage',
  ...adminChain,
  ...questionIdParam,
  validateRequest,
  questionController.getUsage
);

router.get(
  '/admin/:id',
  ...adminChain,
  ...questionIdParam,
  validateRequest,
  questionController.getByIdForAdmin
);

router.post(
  '/smart-practice',
  authenticate,
  smartPracticeBodyValidators,
  validateRequest,
  questionController.smartPractice
);

router.post(
  '/',
  ...adminChain,
  createQuestionValidators,
  validateRequest,
  questionController.create
);

router.get('/:id', questionIdParam, validateRequest, questionController.getById);

router.put(
  '/:id',
  ...adminChain,
  ...questionIdParam,
  updateQuestionValidators,
  validateRequest,
  questionController.update
);

router.patch(
  '/:id',
  ...adminChain,
  ...questionIdParam,
  updateQuestionValidators,
  validateRequest,
  questionController.update
);

// NOTE: Hard-delete (`DELETE /questions/:id`) was intentionally removed.
// Soft-disable via `PATCH /:id { isActive: false }` (single) and
// `POST /admin/bulk-status` (bulk) is now the ONLY destructive primitive.
// This guarantees historical attempts/results never reference a missing
// Question document.

export default router;
