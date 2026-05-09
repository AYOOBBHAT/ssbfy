import { body } from 'express-validator';
import { TEST_TYPE_VALUES } from '../constants/testType.js';

export const createTestValidators = [
  body('title').trim().notEmpty().withMessage('title is required'),
  body('type')
    .optional({ checkFalsy: true })
    .isIn(TEST_TYPE_VALUES)
    .withMessage(`type must be one of: ${TEST_TYPE_VALUES.join(', ')}`),
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
];
