import { body } from 'express-validator';

// Slug is optional on input — the service derives it from `name` when
// missing. When provided, we restrict to the canonical kebab-case shape so
// URLs stay predictable.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createPostValidators = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('name must be 2-100 characters'),
  body('slug')
    .optional({ values: 'falsy' })
    .trim()
    .toLowerCase()
    .matches(SLUG_PATTERN)
    .withMessage(
      'slug must be lowercase letters, numbers, and single hyphens (e.g. "jkssb-je")'
    ),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('description must be 500 characters or fewer'),
];
