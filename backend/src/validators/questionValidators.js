import mongoose from 'mongoose';
import { body, param, query } from 'express-validator';
import { DIFFICULTY_VALUES } from '../constants/difficulty.js';
import { QUESTION_SORT_VALUES } from '../constants/questionSort.js';
import { QUESTION_TYPE_VALUES } from '../models/Question.js';

/**
 * Cross-field check: at least one of `correctAnswers` (new) or
 * `correctAnswerIndex` (legacy) must be present. We can't express this
 * with field-level chains, so it runs as a top-level body check.
 *
 * Returning `true` on success is required by express-validator; throwing
 * surfaces the message into the validation-error array.
 */
function ensureSomeAnswerForm(val) {
  const hasArray = Array.isArray(val?.correctAnswers) && val.correctAnswers.length > 0;
  const idx = val?.correctAnswerIndex;
  const hasIndex =
    idx !== undefined &&
    idx !== null &&
    idx !== '' &&
    Number.isInteger(Number(idx));
  if (!hasArray && !hasIndex) {
    throw new Error('Either correctAnswers or correctAnswerIndex is required');
  }
  return true;
}

export const questionIdParam = [
  param('id').isMongoId().withMessage('Invalid question id'),
];

/** Query params for GET /api/questions/admin */
export const adminListQuestionsQueryValidators = [
  query('search').optional().isString().trim(),
  query('postId')
    .optional({ checkFalsy: true })
    .isMongoId()
    .withMessage('Invalid postId'),
  query('subjectId')
    .optional({ checkFalsy: true })
    .isMongoId()
    .withMessage('Invalid subjectId'),
  query('topicId')
    .optional({ checkFalsy: true })
    .isMongoId()
    .withMessage('Invalid topicId'),
  query('difficulty')
    .optional({ checkFalsy: true })
    .isIn(DIFFICULTY_VALUES)
    .withMessage(`difficulty must be one of: ${DIFFICULTY_VALUES.join(', ')}`),
  query('questionType')
    .optional({ checkFalsy: true })
    .isIn(QUESTION_TYPE_VALUES)
    .withMessage(`questionType must be one of: ${QUESTION_TYPE_VALUES.join(', ')}`),
  query('year')
    .optional({ checkFalsy: true })
    .isInt({ min: 1900, max: 2100 })
    .toInt(),
  query('includeInactive').optional().isIn(['true', 'false', '1', '0']),
  query('isActive').optional().isIn(['true', 'false']),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer')
    .toInt(),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('pageSize must be from 1 to 100')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be from 1 to 100')
    .toInt(),
  query('skip')
    .optional()
    .isInt({ min: 0 })
    .withMessage('skip must be a non-negative integer')
    .toInt(),
];

export const listQuestionsQueryValidators = [
  query('ids')
    .optional({ checkFalsy: true })
    .custom((value) => {
      const parts = String(value)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!parts.length) {
        return true;
      }
      const invalid = parts.find((p) => !mongoose.isValidObjectId(p));
      if (invalid) {
        throw new Error(`Invalid ObjectId in ids: ${invalid}`);
      }
      return true;
    }),
  query('sort')
    .optional()
    .isIn(QUESTION_SORT_VALUES)
    .withMessage(`sort must be one of: ${QUESTION_SORT_VALUES.join(', ')}`),
];

export const createQuestionValidators = [
  body('questionText').trim().notEmpty().withMessage('questionText is required'),
  body('options')
    .isArray({ min: 2 })
    .withMessage('options must be an array with at least 2 items'),
  body('options.*').trim().notEmpty().withMessage('Each option must be a non-empty string'),

  // NEW fields — all optional because the service layer applies defaults
  // and enforces the per-type arity rules.
  body('questionType')
    .optional()
    .isIn(QUESTION_TYPE_VALUES)
    .withMessage(`questionType must be one of: ${QUESTION_TYPE_VALUES.join(', ')}`),
  body('questionImage')
    .optional({ checkFalsy: true })
    .isString()
    .trim()
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('questionImage must be a valid http(s) URL'),
  body('correctAnswers')
    .optional()
    .isArray({ min: 1 })
    .withMessage('correctAnswers must be a non-empty array of option indexes'),
  body('correctAnswers.*')
    .isInt({ min: 0 })
    .withMessage('Each correctAnswers entry must be a non-negative integer')
    .toInt(),

  // Legacy single-answer fields. `correctAnswerIndex` is now OPTIONAL —
  // the cross-field check below ensures the payload carries *some* answer
  // form (either the array or the legacy scalar).
  body('correctAnswerIndex')
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .withMessage('correctAnswerIndex must be a non-negative integer')
    .toInt(),
  body('correctAnswerValue').optional().trim().notEmpty(),
  body().custom(ensureSomeAnswerForm),

  body('explanation').optional().isString(),
  body('subjectId').isMongoId().withMessage('Valid subjectId is required'),
  body('topicId').isMongoId().withMessage('Valid topicId is required'),
  body('postIds').optional().isArray(),
  body('postIds.*').optional().isMongoId(),
  body('year').optional({ nullable: true }).isInt({ min: 1900, max: 2100 }),
  body('difficulty')
    .optional()
    .isIn(DIFFICULTY_VALUES)
    .withMessage(`difficulty must be one of: ${DIFFICULTY_VALUES.join(', ')}`),
];

/**
 * Validators for GET /api/questions/weak-practice.
 *
 * Accepts `topicIds` as EITHER:
 *   - a single comma-separated string:  `?topicIds=a,b,c`
 *   - a repeated query param (→ array): `?topicIds=a&topicIds=b&topicIds=c`
 *
 * We normalise both shapes into a clean `string[]` of valid ObjectIds and
 * stash it on `req.query.topicIdList` for the controller, so downstream code
 * never has to re-parse.
 */
/**
 * POST /questions/smart-practice — authenticated custom mock generation.
 * At least one of postId, subjectId, topicId required (cross-field check).
 */
export const smartPracticeBodyValidators = [
  body('postId').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid postId'),
  body('subjectId')
    .optional({ checkFalsy: true })
    .isMongoId()
    .withMessage('Invalid subjectId'),
  body('topicId').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid topicId'),
  body('difficulty')
    .optional({ checkFalsy: true })
    .isIn([...DIFFICULTY_VALUES, 'all'])
    .withMessage(`difficulty must be one of: all, ${DIFFICULTY_VALUES.join(', ')}`),
  body('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be an integer from 1 to 50')
    .toInt(),
  body().custom((val) => {
    const p = val?.postId;
    const s = val?.subjectId;
    const t = val?.topicId;
    const has =
      (p != null && String(p).trim() !== '') ||
      (s != null && String(s).trim() !== '') ||
      (t != null && String(t).trim() !== '');
    if (!has) {
      throw new Error('At least one of postId, subjectId, or topicId is required');
    }
    return true;
  }),
];

export const weakPracticeValidators = [
  query('topicIds')
    .custom((value, { req }) => {
      const raw = Array.isArray(value) ? value : [value];
      const tokens = raw
        .flatMap((v) => (v == null ? [] : String(v).split(',')))
        .map((s) => s.trim())
        .filter(Boolean);

      if (tokens.length === 0) {
        throw new Error('topicIds is required');
      }
      const invalid = tokens.find((t) => !mongoose.isValidObjectId(t));
      if (invalid) {
        throw new Error(`Invalid ObjectId in topicIds: ${invalid}`);
      }

      req.query.topicIdList = Array.from(new Set(tokens));
      return true;
    }),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be an integer between 1 and 50')
    .toInt(),
];

function requireAtLeastOneUpdateField(_value, { req }) {
  const b = req.body;
  if (!b || typeof b !== 'object' || Object.keys(b).length === 0) {
    throw new Error('At least one field is required to update a question');
  }
  return true;
}

export const updateQuestionValidators = [
  body().custom(requireAtLeastOneUpdateField),
  body('questionText').optional().trim().notEmpty(),
  body('options')
    .optional()
    .isArray({ min: 2 })
    .withMessage('options must be an array with at least 2 items'),
  body('options.*').optional().trim().notEmpty(),

  body('questionType')
    .optional()
    .isIn(QUESTION_TYPE_VALUES)
    .withMessage(`questionType must be one of: ${QUESTION_TYPE_VALUES.join(', ')}`),
  body('questionImage')
    .optional({ checkFalsy: true })
    .isString()
    .trim()
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('questionImage must be a valid http(s) URL'),
  body('correctAnswers')
    .optional()
    .isArray({ min: 1 })
    .withMessage('correctAnswers must be a non-empty array of option indexes'),
  body('correctAnswers.*')
    .isInt({ min: 0 })
    .withMessage('Each correctAnswers entry must be a non-negative integer')
    .toInt(),

  body('correctAnswerIndex').optional().isInt({ min: 0 }).toInt(),
  body('correctAnswerValue').optional().trim().notEmpty(),
  body('explanation').optional().isString(),
  body('subjectId').optional().isMongoId(),
  body('topicId').optional().isMongoId(),
  body('postIds').optional().isArray(),
  body('postIds.*').optional().isMongoId(),
  body('postId')
    .optional({ checkFalsy: true })
    .isMongoId()
    .withMessage('postId must be a valid id'),
  body('year').optional({ nullable: true }).isInt({ min: 1900, max: 2100 }),
  body('difficulty')
    .optional()
    .isIn(DIFFICULTY_VALUES)
    .withMessage(`difficulty must be one of: ${DIFFICULTY_VALUES.join(', ')}`),
  body('isActive').optional().isBoolean().toBoolean(),
];

/**
 * POST /questions/admin/bulk-status — bulk enable/disable.
 * Accepts up to 500 ids per request to bound the worst-case `updateMany`.
 */
export const bulkStatusValidators = [
  body('ids')
    .isArray({ min: 1, max: 500 })
    .withMessage('ids must be a non-empty array (max 500)'),
  body('ids.*').isMongoId().withMessage('Each id must be a valid Mongo ObjectId'),
  body('isActive').isBoolean().withMessage('isActive must be a boolean').toBoolean(),
];

/**
 * GET /questions/admin/similar — soft duplicate-detection helper. Both
 * fields are required; the service returns an empty result for blanks
 * but we'd rather catch the obvious typo at the boundary.
 */
export const similarQueryValidators = [
  query('questionText')
    .isString()
    .trim()
    .isLength({ min: 3, max: 5000 })
    .withMessage('questionText must be 3..5000 chars'),
  query('subjectId').isMongoId().withMessage('subjectId is required'),
  query('excludeId').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid excludeId'),
];

/**
 * POST /questions/admin/import/commit — body validation for the JSON branch
 * of the commit endpoint. (Multipart re-uploads use `parseCsvBuffer` again
 * to re-validate from raw bytes.)
 *
 * `forceImportDuplicates`: when true, rows flagged as duplicates are
 * inserted anyway (admin override). Defaults to false.
 */
export const importCommitBodyValidators = [
  body('forceImportDuplicates').optional().isBoolean().toBoolean(),
];
