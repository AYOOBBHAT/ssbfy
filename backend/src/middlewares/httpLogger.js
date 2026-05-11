import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';

/** Strip noisy / sensitive headers from serialized req. */
function safeReq(req) {
  return {
    id: req.id,
    method: req.method,
    path: req.originalUrl?.split('?')[0] || req.url,
    requestId: req.requestId,
  };
}

function safeRes(res) {
  return {
    statusCode: res.statusCode,
  };
}

/**
 * One structured log line per HTTP request (latency + status).
 * Uses request ids from `requestContext` when present.
 */
export const httpLogger = pinoHttp({
  logger: logger.raw,
  genReqId(req, res) {
    return req.requestId || randomUUID();
  },
  serializers: {
    req: safeReq,
    res: safeRes,
  },
  customLogLevel(req, res, err) {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.originalUrl?.split('?')[0]} completed`;
  },
  customErrorMessage(req, res, err) {
    return `${req.method} ${req.originalUrl?.split('?')[0]} failed`;
  },
  customProps(req, res) {
    const uid = req.user?.id ?? req.user?._id;
    return {
      userIdSuffix: uid ? String(uid).slice(-8) : undefined,
    };
  },
});
