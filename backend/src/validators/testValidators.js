import { body, query } from 'express-validator';
import { TEST_TYPE_VALUES } from '../constants/testType.js';
import { TEST_STATUS_VALUES } from '../constants/testStatus.js';
import {
  TEST_DESCRIPTION_MAX,
  TEST_KIND,
  TEST_KIND_VALUES,
  TEST_YEAR_MAX,
  TEST_YEAR_MIN,
} from '../constants/testKind.js';

export const createTestValidators = [
  body('title').trim().notEmpty().withMessage('title is required'),
  body('type')
    .optional({ checkFalsy: true })
    .isIn(TEST_TYPE_VALUES)
    .withMessage(`type must be one of: ${TEST_TYPE_VALUES.join(', ')}`),
  body('kind')
    .optional({ checkFalsy: true })
    .isIn(TEST_KIND_VALUES)
    .withMessage(`kind must be one of: ${TEST_KIND_VALUES.join(', ')}`),
  body('year')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: TEST_YEAR_MIN, max: TEST_YEAR_MAX })
    .withMessage(`year must be an integer between ${TEST_YEAR_MIN} and ${TEST_YEAR_MAX}`)
    .toInt(),
  body('postId')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId()
    .withMessage('Invalid postId'),
  body('description')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: TEST_DESCRIPTION_MAX })
    .withMessage(`description must be at most ${TEST_DESCRIPTION_MAX} characters`),
  body('pdfNoteId')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId()
    .withMessage('Invalid pdfNoteId'),
  body('questionIds')
    .isArray({ min: 1 })
    .withMessage('questionIds must contain at least 1 question'),
  body('questionIds.*').isMongoId().withMessage('Each questionId must be a valid id'),
  body('duration')
    .isInt({ min: 1 })
    .withMessage('duration must be a positive integer (minutes)')
    .toInt(),
  body('negativeMarking')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('negativeMarking must be a non-negative number')
    .toFloat(),
  body().custom((payload) => {
    const kind = payload.kind || TEST_KIND.MOCK;
    if (kind === TEST_KIND.PREVIOUS_YEAR) {
      if (payload.year == null || payload.year === '') {
        throw new Error('year is required for previous year papers');
      }
      if (!payload.postId) {
        throw new Error('postId is required for previous year papers');
      }
    }
    return true;
  }),
];

/** GET /tests — optional discovery filters. Omitted `kind` remains mock catalog. */
export const listTestsQueryValidators = [
  query('kind')
    .optional({ checkFalsy: true })
    .isIn(TEST_KIND_VALUES)
    .withMessage(`kind must be one of: ${TEST_KIND_VALUES.join(', ')}`),
  query('postId').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid postId'),
  query('year')
    .optional({ checkFalsy: true })
    .isInt({ min: TEST_YEAR_MIN, max: TEST_YEAR_MAX })
    .withMessage(`year must be an integer between ${TEST_YEAR_MIN} and ${TEST_YEAR_MAX}`)
    .toInt(),
];

export const setTestStatusValidators = [
  body('status')
    .isIn(TEST_STATUS_VALUES)
    .withMessage(`status must be one of: ${TEST_STATUS_VALUES.join(', ')}`),
];
