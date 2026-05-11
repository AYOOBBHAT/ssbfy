import pino from 'pino';
import { env, isProd } from '../config/env.js';

const level =
  process.env.LOG_LEVEL ||
  (isProd ? 'info' : 'debug');

/** Root logger — JSON lines on stdout (Railway-friendly). */
const root = pino({
  level,
  base: {
    service: 'ssbfy-api',
    env: env.nodeEnv,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Normalize legacy calls like `logger.warn('msg', { ... })` into pino's
 * `logger.warn({ ... }, 'msg')` so structured fields stay queryable.
 */
function normalizeArgs(args) {
  if (
    args.length === 2 &&
    typeof args[0] === 'string' &&
    args[1] instanceof Error
  ) {
    return { msg: args[0], err: args[1] };
  }
  if (
    args.length === 2 &&
    typeof args[0] === 'string' &&
    args[1] !== null &&
    typeof args[1] === 'object' &&
    !Array.isArray(args[1]) &&
    !(args[1] instanceof Error)
  ) {
    return { msg: args[0], obj: args[1] };
  }
  if (args.length === 1 && args[0] instanceof Error) {
    return { err: args[0] };
  }
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
    return { obj: args[0] };
  }
  if (args.length === 1 && typeof args[0] === 'string') {
    return { msg: args[0] };
  }
  return { rest: args };
}

function logAt(pinoLevel, args) {
  const { msg, obj, err, rest } = normalizeArgs(args);
  if (msg && err) {
    pinoLevel.call(root, { err }, msg);
    return;
  }
  if (err && !msg) {
    pinoLevel.call(root, { err }, err.message);
    return;
  }
  if (msg && obj) {
    pinoLevel.call(root, obj, msg);
    return;
  }
  if (obj) {
    pinoLevel.call(root, obj);
    return;
  }
  if (msg) {
    pinoLevel.call(root, msg);
    return;
  }
  pinoLevel.call(root, ...rest);
}

export const logger = {
  debug: (...args) => logAt(root.debug.bind(root), args),
  info: (...args) => logAt(root.info.bind(root), args),
  warn: (...args) => logAt(root.warn.bind(root), args),
  error: (...args) => logAt(root.error.bind(root), args),
  /** Raw pino for `pino-http` and child loggers. */
  raw: root,
  child(bindings) {
    return root.child(bindings);
  },
};

/**
 * Security / abuse signals — same JSON stream, grep-friendly `event` field.
 * Never pass passwords, tokens, or full webhook bodies.
 */
export function logSecurityEvent(event, meta = {}) {
  root.warn({ event, kind: 'security', ...meta }, `security:${event}`);
}

/**
 * Sanitize an Error for JSON logging (no stack in production on 4xx paths).
 */
export function serializeError(err) {
  if (!err) return {};
  return {
    name: err.name,
    message: err.message,
    ...(isProd ? {} : { stack: err.stack }),
  };
}
