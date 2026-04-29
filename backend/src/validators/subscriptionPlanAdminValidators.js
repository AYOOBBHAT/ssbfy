import { body, param } from 'express-validator';

const PLAN_TYPES = ['monthly', 'quarterly', 'yearly', 'lifetime'];

export const planIdParam = [
  param('id').isMongoId().withMessage('id must be a valid plan id'),
];

/**
 * Cross-field rule: lifetime plans MUST NOT carry a duration; non-lifetime
 * plans MUST carry a positive integer duration. We validate it here in the
 * request layer so the controller never has to interpret an invalid combo.
 */
function assertDurationConsistency(req) {
  const planType = req.body?.planType;
  const durationDays = req.body?.durationDays;
  if (!PLAN_TYPES.includes(planType)) return;
  if (planType === 'lifetime') {
    if (durationDays !== null && durationDays !== undefined) {
      throw new Error('durationDays must be null for lifetime plans');
    }
    return;
  }
  if (!Number.isInteger(durationDays) || durationDays <= 0) {
    throw new Error('durationDays must be a positive integer for non-lifetime plans');
  }
}

export const createPlanValidators = [
  body('name').trim().notEmpty().withMessage('name is required').isLength({ max: 80 }),
  body('planType')
    .exists({ checkFalsy: true })
    .withMessage('planType is required')
    .bail()
    .isIn(PLAN_TYPES)
    .withMessage(`planType must be one of: ${PLAN_TYPES.join(', ')}`),
  body('durationDays')
    .custom((v) => {
      if (v === null || v === undefined) return true;
      if (!Number.isInteger(v)) {
        throw new Error('durationDays must be an integer or null');
      }
      if (v <= 0) {
        throw new Error('durationDays must be > 0');
      }
      return true;
    }),
  body('priceInr')
    .exists()
    .withMessage('priceInr is required')
    .bail()
    .isInt({ min: 1 })
    .withMessage('priceInr must be a positive integer (rupees)')
    .toInt(),
  body('isActive').optional().isBoolean().toBoolean(),
  body('displayOrder')
    .optional()
    .isInt({ min: 0, max: 9999 })
    .withMessage('displayOrder must be an integer 0–9999')
    .toInt(),
  body('description').optional().isString().isLength({ max: 240 }).trim(),
  body().custom((_value, { req }) => {
    assertDurationConsistency(req);
    return true;
  }),
];

/**
 * Update payload — every field optional, but if `durationDays` is provided
 * the service ALSO validates it against the plan's planType (which is
 * immutable post-create). planType itself cannot be changed at all.
 */
export const updatePlanValidators = [
  body('name').optional().trim().notEmpty().isLength({ max: 80 }),
  body('planType')
    .not()
    .exists()
    .withMessage('planType cannot be changed once a plan exists'),
  body('durationDays')
    .optional({ nullable: true })
    .custom((v) => {
      if (v === null) return true;
      if (!Number.isInteger(v) || v <= 0) {
        throw new Error('durationDays must be a positive integer or null');
      }
      return true;
    }),
  body('priceInr')
    .optional()
    .isInt({ min: 1 })
    .withMessage('priceInr must be a positive integer (rupees)')
    .toInt(),
  body('isActive').optional().isBoolean().toBoolean(),
  body('displayOrder')
    .optional()
    .isInt({ min: 0, max: 9999 })
    .withMessage('displayOrder must be an integer 0–9999')
    .toInt(),
  body('description').optional().isString().isLength({ max: 240 }).trim(),
];

export const setStatusValidators = [
  body('isActive')
    .exists()
    .withMessage('isActive is required')
    .bail()
    .isBoolean()
    .withMessage('isActive must be boolean')
    .toBoolean(),
];
