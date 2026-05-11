import mongoose from 'mongoose';
import { body, param, query } from 'express-validator';

export const createNoteValidators = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('title is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('title must be 2-200 characters'),
  body('content')
    .isString()
    .withMessage('content must be a string')
    .bail()
    // Content is rarely empty for a useful note and never needs to exceed
    // ~64KB for plain-text / Markdown study material. Both bounds protect
    // against accidental garbage without getting in the way of real use.
    .isLength({ min: 1, max: 65_000 })
    .withMessage('content must be 1-65000 characters'),
  // Compatibility-only: legacy callers may send a single `postId`. Canonical:
  // `postIds[]` (optional tags). TODO(compatibility): reject lone postId only
  // after all clients migrated (coordinate with mobile/admin).
  body('postId')
    .optional({ checkFalsy: true })
    .isMongoId()
    .withMessage('postId must be a valid id'),
  body('postIds')
    .optional()
    .isArray()
    .withMessage('postIds must be an array'),
  body('postIds.*')
    .optional()
    .isMongoId()
    .withMessage('postIds entries must be valid ids'),
  body('postIds')
    .optional()
    .custom((value) => {
      if (!Array.isArray(value)) return true;
      const ids = value.map((v) => String(v)).filter(Boolean);
      const set = new Set(ids);
      if (set.size !== ids.length) {
        throw new Error('postIds must not contain duplicates');
      }
      return true;
    }),
  body('subjectId')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('subjectId is required')
    .bail()
    .isMongoId()
    .withMessage('subjectId must be a valid id'),
  body('topicId')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('topicId is required')
    .bail()
    .isMongoId()
    .withMessage('topicId must be a valid id'),
];

/**
 * PATCH /api/notes/:id — every body field is optional, but at least one
 * must be present. The service enforces the "at least one" rule so the
 * error message matches the domain layer.
 */
export const updateNoteValidators = [
  param('id').isMongoId().withMessage('id must be a valid Mongo id'),
  // Note: hierarchy fields (subjectId/topicId/postIds) are not patchable yet.
  body('title')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('title must be 2-200 characters'),
  body('content')
    .optional()
    .isString()
    .isLength({ min: 1, max: 65_000 })
    .withMessage('content must be 1-65000 characters'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
];

export const listNotesValidators = [
  query('postId').optional().isMongoId().withMessage('postId must be a valid id'),
  query('subjectId').optional().isMongoId().withMessage('subjectId must be a valid id'),
  query('topicId').optional().isMongoId().withMessage('topicId must be a valid id'),
  // `topicIds` accepts EITHER `?topicIds=a,b,c` or repeated `?topicIds=a&
  // topicIds=b`. We explode both into a deduped `string[]` stashed on
  // `req.query.topicIdList` so the controller never has to re-parse.
  // Used by the mobile "weak topic recommendations" flow to fetch notes
  // across all weak topics in a single round trip.
  query('topicIds')
    .optional({ checkFalsy: true })
    .custom((value, { req }) => {
      const raw = Array.isArray(value) ? value : [value];
      const tokens = raw
        .flatMap((v) => (v == null ? [] : String(v).split(',')))
        .map((s) => s.trim())
        .filter(Boolean);
      if (tokens.length === 0) {
        // `optional({ checkFalsy: true })` would normally skip us here,
        // but being defensive against "?topicIds=,,,,".
        return true;
      }
      const invalid = tokens.find((t) => !mongoose.isValidObjectId(t));
      if (invalid) {
        throw new Error(`Invalid ObjectId in topicIds: ${invalid}`);
      }
      req.query.topicIdList = Array.from(new Set(tokens));
      return true;
    }),
  query('includeInactive')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('includeInactive must be "true" or "false"'),
];
