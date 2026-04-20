import { body, param } from 'express-validator';

export const createTopicValidators = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('name must be 2-100 characters'),
  body('subjectId').isMongoId().withMessage('Valid subjectId is required'),
  body('order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('order must be a non-negative integer')
    .toInt(),
];

export const updateTopicValidators = [
  param('id').isMongoId().withMessage('Invalid topic id'),
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
