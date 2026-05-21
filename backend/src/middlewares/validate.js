import { validationResult } from 'express-validator';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { logSecurityEvent } from '../utils/logger.js';

function practiceRevealValidationReason(fields) {
  const set = new Set(fields);
  if (set.has('practiceSessionId')) return 'missing_practice_session';
  if (set.has('questionIds') || set.has('questionIds.*')) return 'invalid_question_ids';
  if (set.has('userAnswers')) return 'invalid_user_answers';
  if (set.has('practiceType')) return 'practice_type_mismatch';
  if (set.has('sourceAttemptId')) return 'retry_field_on_non_retry';
  return 'validation_failed';
}

export function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
    }));
    const pathOnly = String(req.originalUrl || '').split('?')[0];
    if (pathOnly.endsWith('/practice/reveal')) {
      const fields = details.map((d) => d.field);
      logSecurityEvent('practice_reveal_validation_failed', {
        reason: practiceRevealValidationReason(fields),
        fields,
        fieldCount: fields.length,
        userIdSuffix: req.user?.id ? String(req.user.id).slice(-8) : null,
      });
    }
    return next(new AppError('Validation failed', HTTP_STATUS.UNPROCESSABLE_ENTITY, details));
  }
  next();
}
