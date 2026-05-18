import { body } from 'express-validator';

const PRACTICE_TYPES = ['topic', 'smart', 'weak', 'daily', 'practice', 'retry'];

export const practiceRevealValidators = [
  body('questionIds')
    .isArray({ min: 1, max: 50 })
    .withMessage('questionIds must be a non-empty array (max 50)'),
  body('questionIds.*').isMongoId().withMessage('Each questionId must be a valid ObjectId'),
  body('userAnswers')
    .exists()
    .withMessage('userAnswers is required')
    .custom((val) => {
      if (val == null || typeof val !== 'object' || Array.isArray(val)) {
        throw new Error('userAnswers must be an object');
      }
      return true;
    }),
  body('practiceType')
    .optional()
    .isString()
    .trim()
    .isIn(PRACTICE_TYPES)
    .withMessage(`practiceType must be one of: ${PRACTICE_TYPES.join(', ')}`),
  body('clientSessionKey').optional().isString().trim().isLength({ max: 128 }),
  body('retryMeta').optional().isObject(),
  body('sourceAttemptId').optional().isMongoId(),
];
