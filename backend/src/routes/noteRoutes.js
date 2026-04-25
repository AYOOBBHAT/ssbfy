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
  updatePdfNoteValidators,
} from '../validators/pdfNoteValidators.js';

const router = Router();

// ---- PDF notes ------------------------------------------------------------
//
// Declared BEFORE the text-note routes because `GET /pdfs` must not be
// captured by any `/:id` pattern on text notes below.

// `authOptional` so an authenticated admin can pass `includeInactive=true`
// from the management UI; anonymous callers always get the active-only
// list (the controller gates the flag on role).
router.get(
  '/pdfs',
  authOptional,
  listPdfNotesValidators,
  validateRequest,
  pdfNoteController.list
);

router.patch(
  '/pdfs/:id',
  ...adminChain,
  updatePdfNoteValidators,
  validateRequest,
  pdfNoteController.update
);

/**
 * POST /api/notes/upload-pdf — multipart/form-data
 *
 * Middleware order matters:
 *   1. adminChain   — auth + role first; we don't want anonymous callers
 *                     writing files to disk.
 *   2. handlePdfUpload — parses multipart, writes a temp PDF on disk, then
 *                     `req.body` is populated for validators.
 *   3. validators
 *   4. controller   — Supabase upload + DB row + temp file cleanup.
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
