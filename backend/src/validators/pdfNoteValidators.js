import { body, query } from 'express-validator';

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
];
