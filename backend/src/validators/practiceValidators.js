import { body } from 'express-validator';

const PRACTICE_TYPES = ['topic', 'smart', 'weak', 'daily', 'practice', 'retry'];
const ISSUE_TYPES = ['topic', 'smart', 'weak', 'daily', 'practice', 'retry'];

export const practiceIssueValidators = [
  body('practiceType')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('practiceType is required')
    .bail()
    .isIn(ISSUE_TYPES)
    .withMessage(`practiceType must be one of: ${ISSUE_TYPES.join(', ')}`),
  body('questionIds')
    .isArray({ min: 1, max: 50 })
    .withMessage('questionIds must be a non-empty array (max 50)'),
  body('questionIds.*').isMongoId().withMessage('Each questionId must be a valid ObjectId'),
  body('sourceAttemptId')
    .optional({ nullable: true })
    .isMongoId()
    .withMessage('sourceAttemptId must be a valid id'),
  body().custom((value) => {
    const t = String(value?.practiceType ?? '')
      .trim()
      .toLowerCase();
    if (t === 'retry' && !value?.sourceAttemptId) {
      throw new Error('sourceAttemptId is required when practiceType is retry');
    }
    if (t !== 'retry' && value?.sourceAttemptId) {
      throw new Error('sourceAttemptId must only be sent for retry issuance');
    }
    return true;
  }),
];

export const practiceRevealValidators = [
  body('practiceSessionId')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('practiceSessionId is required')
    .bail()
    .isMongoId()
    .withMessage('practiceSessionId must be a valid id'),
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
