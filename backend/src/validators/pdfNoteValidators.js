import { body, param, query } from 'express-validator';

/**
 * The file itself is validated by the multer middleware, so here we only
 * validate the accompanying multipart text fields.
 */
export const uploadPdfNoteValidators = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('title is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('title must be 2-200 characters'),
  body('postId')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('postId is required')
    .bail()
    .isMongoId()
    .withMessage('postId must be a valid id'),
];

export const listPdfNotesValidators = [
  query('postId').optional().isMongoId().withMessage('postId must be a valid id'),
  // Admins pass `includeInactive=true` from the management UI to see
  // disabled uploads; the controller still gates this on the caller's
  // role so students can't sneak disabled PDFs by tacking on the flag.
  query('includeInactive')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('includeInactive must be "true" or "false"'),
];

/**
 * PATCH /api/notes/pdfs/:id — only `isActive` can be toggled from the
 * admin UI today. Adding title/description editing later would slot in
 * here next to it.
 */
export const updatePdfNoteValidators = [
  param('id').isMongoId().withMessage('id must be a valid Mongo id'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
];
