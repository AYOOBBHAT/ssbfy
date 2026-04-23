import { Router } from 'express';
import { noteController } from '../controllers/noteController.js';
import { pdfNoteController } from '../controllers/pdfNoteController.js';
import { adminChain } from '../middlewares/adminGuard.js';
import { authOptional } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import { handlePdfUpload } from '../middlewares/upload.js';
import {
  createNoteValidators,
  updateNoteValidators,
  listNotesValidators,
} from '../validators/noteValidators.js';
import {
  uploadPdfNoteValidators,
  listPdfNotesValidators,
} from '../validators/pdfNoteValidators.js';

const router = Router();

// ---- PDF notes ------------------------------------------------------------
//
// Declared BEFORE the text-note routes because `GET /pdfs` must not be
// captured by any `/:id` pattern on text notes below.

router.get(
  '/pdfs',
  listPdfNotesValidators,
  validateRequest,
  pdfNoteController.list
);

/**
 * POST /api/notes/upload-pdf — multipart/form-data
 *
 * Middleware order matters:
 *   1. adminChain   — auth + role first; we don't want anonymous callers
 *                     writing files to disk.
 *   2. handlePdfUpload — parses multipart and saves the file; after this,
 *                     `req.body` is populated so validators can run.
 *   3. validators   — now that req.body exists.
 *   4. controller   — persists metadata, cleans up on failure.
 */
router.post(
  '/upload-pdf',
  ...adminChain,
  handlePdfUpload,
  uploadPdfNoteValidators,
  validateRequest,
  pdfNoteController.upload
);

// ---- Text notes -----------------------------------------------------------

// `authOptional` lets the controller detect an authenticated admin and
// honor `includeInactive=true`; anonymous callers always get active-only.
router.get(
  '/',
  authOptional,
  listNotesValidators,
  validateRequest,
  noteController.list
);

router.post(
  '/',
  ...adminChain,
  createNoteValidators,
  validateRequest,
  noteController.create
);

router.patch(
  '/:id',
  ...adminChain,
  updateNoteValidators,
  validateRequest,
  noteController.update
);

export default router;
