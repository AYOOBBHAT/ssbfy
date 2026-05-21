import { body, param, query } from 'express-validator';
import { BATTLE_MAX_QUESTIONS, BATTLE_MIN_QUESTIONS, BATTLE_TIMER_MODES } from '../constants/battle.js';
import { DIFFICULTY_VALUES } from '../constants/difficulty.js';

export const battleCreateValidators = [
  body('subjectId').isMongoId().withMessage('subjectId must be a valid ObjectId'),
  body('topicId').isMongoId().withMessage('topicId must be a valid ObjectId'),
  body('difficulty')
    .optional()
    .isString()
    .custom((v) => {
      const d = String(v).trim().toLowerCase();
      return d === 'all' || DIFFICULTY_VALUES.includes(d);
    })
    .withMessage('Invalid difficulty'),
  body('questionCount')
    .isInt({ min: BATTLE_MIN_QUESTIONS, max: BATTLE_MAX_QUESTIONS })
    .withMessage(`questionCount must be ${BATTLE_MIN_QUESTIONS}–${BATTLE_MAX_QUESTIONS}`),
  body('timerMode')
    .optional()
    .isIn([...BATTLE_TIMER_MODES])
    .withMessage('Invalid timerMode'),
  body('timerSeconds').optional().isInt({ min: 10, max: 7200 }),
];

export const battleAvailabilityValidators = [
  query('subjectId').isMongoId(),
  query('topicId').isMongoId(),
  query('difficulty').optional().isString(),
];

export const battleIdParamValidators = [param('id').isMongoId()];

export const battleInviteParamValidators = [
  param('inviteCode')
    .isString()
    .trim()
    .isLength({ min: 4, max: 12 })
    .matches(/^[A-Z0-9]+$/i),
];
