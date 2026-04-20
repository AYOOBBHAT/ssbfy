import { HTTP_STATUS } from '../constants/httpStatus.js';

export class AppError extends Error {
  constructor(message, statusCode = HTTP_STATUS.BAD_REQUEST, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
