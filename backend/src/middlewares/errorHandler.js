import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';

function isMongoDuplicate(err) {
  return err.code === 11000;
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    const body = {
      success: false,
      message: err.message,
    };
    if (err.details) {
      body.details = err.details;
    }
    return res.status(err.statusCode).json(body);
  }

  if (err instanceof mongoose.Error.CastError) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Invalid ID format',
    });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
      success: false,
      message: 'Validation failed',
      details,
    });
  }

  if (isMongoDuplicate(err)) {
    return res.status(HTTP_STATUS.CONFLICT).json({
      success: false,
      message: 'Duplicate value',
    });
  }

  if (env.nodeEnv !== 'production') {
    console.error(err);
  }

  return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: env.nodeEnv === 'production' ? 'Internal server error' : err.message,
  });
}

export function notFoundHandler(req, res) {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}
