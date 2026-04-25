import { body, param, query } from 'express-validator';

function sanitizeJsonPostIds(value) {
  if (value == null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return value;
}

/**
 * The file itself is validated by the multer middleware, so here we only
 * validate the accompanying multipart text fields. Prefer `postIds` (JSON
 * array in multipart) or pass legacy `postId` — at least one is required.
 */
export const uploadPdfNoteValidators = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('title is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('title must be 2-200 characters'),
  body('postId')
    .optional({ checkFalsy: true })
    .isMongoId()
    .withMessage('postId must be a valid id'),
  body('postIds')
    .customSanitizer(sanitizeJsonPostIds)
    .custom((raw, { req }) => {
      if (raw == null && !req.body?.postId) {
        throw new Error('postIds (array) and/or postId is required');
      }
      if (raw == null) return true;
      if (!Array.isArray(raw) || raw.length < 1) {
        throw new Error('postIds must be a non-empty array when provided');
      }
      for (const id of raw) {
        if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) {
          throw new Error('Each postIds entry must be a valid Mongo id');
        }
      }
      return true;
    }),
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
 * PATCH /api/notes/pdfs/:id — `isActive` and/or `postIds` (full replacement
 * list) may be sent.
 */
export const updatePdfNoteValidators = [
  param('id').isMongoId().withMessage('id must be a valid Mongo id'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  body('postIds')
    .optional()
    .isArray({ min: 1 })
    .withMessage('postIds must be a non-empty array when provided'),
  body('postIds.*').optional().isMongoId().withMessage('Each postIds entry must be a valid id'),
  body()
    .custom((_, { req }) => {
      const a = req.body?.isActive;
      const p = req.body?.postIds;
      if (typeof a !== 'boolean' && !Array.isArray(p)) {
        throw new Error('Provide isActive and/or postIds');
      }
      if (Array.isArray(p) && p.length < 1) {
        throw new Error('postIds must include at least one post');
      }
      return true;
    }),
];
