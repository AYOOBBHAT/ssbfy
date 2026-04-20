import { body, param } from 'express-validator';

export const testIdParam = [
  param('id').isMongoId().withMessage('Invalid test id'),
];

export const submitTestValidators = [
  body('answers').isArray().withMessage('answers must be an array'),
  body('answers.*.questionId').isMongoId().withMessage('Each answer needs a valid questionId'),
  body('answers.*.selectedOptionIndex')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined) return true;
      const n = Number(value);
      return Number.isInteger(n) && n >= 0;
    })
    .withMessage('selectedOptionIndex must be null (unanswered) or a non-negative integer'),
];
