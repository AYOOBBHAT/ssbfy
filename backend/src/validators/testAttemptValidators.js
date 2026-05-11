import { body, param } from 'express-validator';

export const testIdParam = [
  param('id').isMongoId().withMessage('Invalid test id'),
];

/** POST /tests/:id/start — device id is mandatory for free-tier enforcement. */
export const startTestValidators = [
  body('deviceId')
    .isString()
    .trim()
    .isLength({ min: 4, max: 256 })
    .withMessage('deviceId must be a non-empty string (4–256 chars)'),
];

/** PATCH /tests/:id/progress — partial answer autosave (same shape as submit). */
export const saveProgressValidators = [
  body('answers').isArray({ min: 1 }).withMessage('answers must be a non-empty array'),
  body('answers.*.questionId').isMongoId().withMessage('Each answer needs a valid questionId'),
  body('answers.*.selectedOptionIndexes')
    .optional()
    .isArray()
    .withMessage('selectedOptionIndexes must be an array')
    .bail()
    .custom((arr) => {
      if (!Array.isArray(arr)) return false;
      for (const v of arr) {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) return false;
      }
      return true;
    })
    .withMessage('Each selectedOptionIndexes entry must be a non-negative integer'),
  body('answers.*.selectedOptionIndex')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined) return true;
      const n = Number(value);
      return Number.isInteger(n) && n >= 0;
    })
    .withMessage('selectedOptionIndex must be null (unanswered) or a non-negative integer'),
];

export const submitTestValidators = [
  body('answers').isArray().withMessage('answers must be an array'),
  body('answers.*.questionId').isMongoId().withMessage('Each answer needs a valid questionId'),

  // NEW canonical form — array of option indexes the user selected. Optional
  // because legacy clients may still send only `selectedOptionIndex`. Empty
  // array is allowed (means "unanswered"). The service requires at least
  // one of the two answer forms to be present per question.
  body('answers.*.selectedOptionIndexes')
    .optional()
    .isArray()
    .withMessage('selectedOptionIndexes must be an array')
    .bail()
    .custom((arr) => {
      if (!Array.isArray(arr)) return false;
      for (const v of arr) {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) return false;
      }
      return true;
    })
    .withMessage('Each selectedOptionIndexes entry must be a non-negative integer'),

  // LEGACY scalar — still accepted so older mobile builds keep working.
  body('answers.*.selectedOptionIndex')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined) return true;
      const n = Number(value);
      return Number.isInteger(n) && n >= 0;
    })
    .withMessage('selectedOptionIndex must be null (unanswered) or a non-negative integer'),
];
