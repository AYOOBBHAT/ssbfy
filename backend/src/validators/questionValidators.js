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
