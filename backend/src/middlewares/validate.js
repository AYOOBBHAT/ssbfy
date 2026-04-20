import { validationResult } from 'express-validator';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';

export function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
    }));
    return next(new AppError('Validation failed', HTTP_STATUS.UNPROCESSABLE_ENTITY, details));
  }
  next();
}
