import mongoose from 'mongoose';
import { body, param, query } from 'express-validator';
import { DIFFICULTY_VALUES } from '../constants/difficulty.js';
import { QUESTION_SORT_VALUES } from '../constants/questionSort.js';

export const questionIdParam = [
  param('id').isMongoId().withMessage('Invalid question id'),
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
  body('correctAnswerIndex')
    .isInt({ min: 0 })
    .withMessage('correctAnswerIndex must be a non-negative integer')
    .toInt(),
  body('correctAnswerValue').optional().trim().notEmpty(),
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

export const updateQuestionValidators = [
  body('questionText').optional().trim().notEmpty(),
  body('options')
    .optional()
    .isArray({ min: 2 })
    .withMessage('options must be an array with at least 2 items'),
  body('options.*').optional().trim().notEmpty(),
  body('correctAnswerIndex').optional().isInt({ min: 0 }).toInt(),
  body('correctAnswerValue').optional().trim().notEmpty(),
  body('explanation').optional().isString(),
  body('subjectId').optional().isMongoId(),
  body('topicId').optional().isMongoId(),
  body('postIds').optional().isArray(),
  body('postIds.*').optional().isMongoId(),
  body('year').optional({ nullable: true }).isInt({ min: 1900, max: 2100 }),
  body('difficulty')
    .optional()
    .isIn(DIFFICULTY_VALUES)
    .withMessage(`difficulty must be one of: ${DIFFICULTY_VALUES.join(', ')}`),
];
