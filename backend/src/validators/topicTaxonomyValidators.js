import { body, param } from 'express-validator';

export const topicIdParam = [param('id').isMongoId().withMessage('Invalid topic id')];

export const renameTopicTaxonomyValidators = [
  ...topicIdParam,
  body('name').trim().notEmpty().isLength({ min: 2, max: 100 }),
];

export const aliasTopicTaxonomyValidators = [
  ...topicIdParam,
  body('alias').trim().notEmpty().isLength({ min: 2, max: 100 }),
];

export const mergeTopicsTaxonomyValidators = [
  body('targetTopicId').isMongoId(),
  body('sourceTopicIds').isArray({ min: 1, max: 20 }),
  body('sourceTopicIds.*').isMongoId(),
];

export const splitTopicTaxonomyValidators = [
  ...topicIdParam,
  body('splits').isArray({ min: 1, max: 10 }),
  body('splits.*.name').trim().notEmpty().isLength({ min: 2, max: 100 }),
  body('splits.*.order').optional().isInt({ min: 0 }).toInt(),
];
