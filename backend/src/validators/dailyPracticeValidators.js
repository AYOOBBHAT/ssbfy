import { query } from 'express-validator';

export const dailyPracticeListValidators = [
  query('deviceId')
    .isString()
    .trim()
    .isLength({ min: 4, max: 256 })
    .withMessage('deviceId query parameter is required (4–256 chars)'),
];
