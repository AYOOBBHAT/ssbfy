import { HTTP_STATUS } from '../constants/httpStatus.js';

export class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode]
   * @param {unknown} [details] — validation-style details (kept under `details` in JSON)
   * @param {Record<string, unknown> | null} [meta] — merged into the JSON body (e.g. code, result for 409 recovery)
   */
  constructor(message, statusCode = HTTP_STATUS.BAD_REQUEST, details = null, meta = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    this.meta = meta;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
