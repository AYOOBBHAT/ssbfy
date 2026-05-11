import { redis } from '../lib/redis.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { logger, logSecurityEvent } from '../utils/logger.js';

const RATE_LIMIT_BODY = {
  success: false,
  message: 'Too many requests, please try again later.',
};

const REDIS_UNAVAILABLE_BODY = {
  success: false,
  message: 'Service temporarily unavailable',
};

/**
 * Atomic INCR + EXPIRE on first hit (single round-trip, no race between incr/expire).
 */
const LUA_INCR_EXPIRE = `
local c = redis.call("INCR", KEYS[1])
if c == 1 then
  redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1]))
end
return c
`;

let warnedAllowWithoutRedis = false;

function resolveClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  const first =
    typeof xff === 'string'
      ? xff.split(',')[0]?.trim()
      : Array.isArray(xff) && xff.length > 0
        ? String(xff[0]).trim()
        : '';
  return first || req.ip || req.socket?.remoteAddress || 'unknown';
}

async function atomicIncrExpire(key, windowSeconds) {
  const argv = await redis.eval(LUA_INCR_EXPIRE, [key], [String(windowSeconds)]);
  const count = Number(argv);
  if (!Number.isFinite(count)) {
    throw new TypeError(`Unexpected EVAL return: ${argv}`);
  }
  return count;
}

/**
 * @param {object} opts
 * @param {number} opts.windowSeconds
 * @param {number} opts.maxRequests
 * @param {'auth'|'otp'|'api'|'payment'|'webhook'} opts.routeName — static bucket id (never use req.path)
 * @param {boolean} [opts.allowWithoutRedis=false] — only for webhook: if Redis is unset, log error once and allow traffic
 */
export function createUpstashLimiter({
  windowSeconds,
  maxRequests,
  routeName,
  allowWithoutRedis = false,
}) {
  if (!routeName || typeof routeName !== 'string') {
    throw new Error('createUpstashLimiter requires `routeName`');
  }

  return async function upstashRateLimit(req, res, next) {
    if (!redis) {
      if (allowWithoutRedis) {
        if (!warnedAllowWithoutRedis) {
          warnedAllowWithoutRedis = true;
          logger.error('Rate limiter disabled or failed', {
            route: routeName,
            reason: 'redis_not_configured',
            mode: 'webhook_fail_open',
          });
        }
        return next();
      }
      logger.error('Rate limiter disabled or failed', {
        route: routeName,
        reason: 'redis_not_configured',
      });
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(REDIS_UNAVAILABLE_BODY);
    }

    const ip = String(resolveClientIp(req));
    const key = `rate_limit:${ip}:${routeName}`;

    let count;
    try {
      count = await atomicIncrExpire(key, windowSeconds);
    } catch (e) {
      logger.error('Rate limiter Upstash error', {
        route: routeName,
        message: e?.message,
      });
      return next();
    }

    if (count > maxRequests) {
      logSecurityEvent('rate_limit_exceeded', {
        bucket: routeName,
        requestId: req.requestId,
        ipSuffix: ip.length > 8 ? ip.slice(-8) : 'unknown',
      });
      res.set('Retry-After', String(windowSeconds));
      return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(RATE_LIMIT_BODY);
    }

    return next();
  };
}

/** Login, signup, reset-password — 15 min, 20. */
export const authLimiter = createUpstashLimiter({
  windowSeconds: 900,
  maxRequests: 20,
  routeName: 'auth',
});

/** Forgot-password OTP send + verify — 10 min, 5. */
export const otpLimiter = createUpstashLimiter({
  windowSeconds: 600,
  maxRequests: 5,
  routeName: 'otp',
});

/** General API — 1 min, 60. */
export const apiLimiter = createUpstashLimiter({
  windowSeconds: 60,
  maxRequests: 60,
  routeName: 'api',
});

/** Create-order + verify — 1 min, 10. */
export const paymentLimiter = createUpstashLimiter({
  windowSeconds: 60,
  maxRequests: 10,
  routeName: 'payment',
});

/**
 * Razorpay webhook — 100/min per IP; allows traffic if Redis is not configured (fail-open).
 */
export const webhookLimiter = createUpstashLimiter({
  windowSeconds: 60,
  maxRequests: 100,
  routeName: 'webhook',
  allowWithoutRedis: true,
});
