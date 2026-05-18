import { param, query } from 'express-validator';

export const learningSessionIdParam = [
  param('sessionId').isMongoId().withMessage('Invalid session id'),
];

export const listRecentLearningSessionsQuery = [
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];
