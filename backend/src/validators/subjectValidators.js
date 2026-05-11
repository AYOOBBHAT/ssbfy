import { body, param } from 'express-validator';

export const createSubjectValidators = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('name must be 2-100 characters'),
  /** Optional legacy tag — global subjects omit `postId`. */
  body('postId')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId()
    .withMessage('postId must be a valid id when provided'),
  body('order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('order must be a non-negative integer')
    .toInt(),
];

export const updateSubjectValidators = [
  param('id').isMongoId().withMessage('Invalid subject id'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('name must be 2-100 characters'),
  body('order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('order must be a non-negative integer')
    .toInt(),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
    .toBoolean(),
];
