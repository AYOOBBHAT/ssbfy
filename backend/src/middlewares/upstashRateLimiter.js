import { redis } from '../lib/redis.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import {
  RateLimitSensitivity,
  buildRateLimitUnavailableBody,
} from '../constants/rateLimitPolicy.js';
import { tryEmergencyConsume } from '../lib/emergencyMemoryLimiter.js';
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

/** @type {Map<string, number>} */
const providerFailureStreaks = new Map();

function bumpProviderFailureStreak(routeName) {
  const prev = providerFailureStreaks.get(routeName) || 0;
  const next = prev + 1;
  providerFailureStreaks.set(routeName, next);
  if (next === 1 || next % 25 === 0 || next % 100 === 0) {
    logSecurityEvent('rate_limit_provider_failure', {
      bucket: routeName,
      consecutiveFailures: next,
    });
  }
}

function resetProviderFailureStreak(routeName) {
  providerFailureStreaks.delete(routeName);
}

/** Structured log tag for `/tests` buckets (grep `apiSurface":"tests"`). */
function testsApiSurface(routeName) {
  return String(routeName || '').startsWith('tests_') ? { apiSurface: 'tests' } : {};
}

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
 * @param {string} opts.routeName — static bucket id (never use req.path)
 * @param {boolean} [opts.allowWithoutRedis=false] — only for webhook: if Redis is unset, log error once and allow traffic
 * @param {'high'|'medium'|'low'} [opts.sensitivity] — provider-error policy; default MEDIUM
 */
export function createUpstashLimiter({
  windowSeconds,
  maxRequests,
  routeName,
  allowWithoutRedis = false,
  sensitivity = RateLimitSensitivity.MEDIUM,
}) {
  if (!routeName || typeof routeName !== 'string') {
    throw new Error('createUpstashLimiter requires `routeName`');
  }

  return async function upstashRateLimit(req, res, next) {
    const ip = String(resolveClientIp(req));
    const key = `rate_limit:${ip}:${routeName}`;

    if (!redis) {
      if (allowWithoutRedis) {
        if (!warnedAllowWithoutRedis) {
          warnedAllowWithoutRedis = true;
          logger.error('Rate limiter disabled or failed', {
            route: routeName,
            reason: 'redis_not_configured',
            mode: 'webhook_fail_open',
            sensitivity,
          });
        }
        logSecurityEvent('rate_limit_fail_open', {
          bucket: routeName,
          sensitivity: RateLimitSensitivity.LOW,
          reason: 'redis_not_configured',
        });
        return next();
      }
      logger.error('Rate limiter disabled or failed', {
        route: routeName,
        reason: 'redis_not_configured',
        sensitivity,
      });
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(REDIS_UNAVAILABLE_BODY);
    }

    let count;
    try {
      count = await atomicIncrExpire(key, windowSeconds);
    } catch (e) {
      bumpProviderFailureStreak(routeName);
      logger.error('Rate limiter Upstash error', {
        route: routeName,
        sensitivity,
        message: e?.message,
      });

      if (sensitivity === RateLimitSensitivity.HIGH) {
        const emergencyKey = `emergency:${ip}:${routeName}`;
        let allowed;
        try {
          allowed = tryEmergencyConsume(emergencyKey, windowSeconds, maxRequests);
        } catch (inner) {
          logger.error('Emergency rate limiter internal error', {
            route: routeName,
            message: inner?.message,
          });
          return res
            .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
            .json(buildRateLimitUnavailableBody());
        }
        if (!allowed) {
          logSecurityEvent('rate_limit_emergency_exceeded', {
            bucket: routeName,
            requestId: req.requestId,
            ipSuffix: ip.length > 8 ? ip.slice(-8) : 'unknown',
          });
          res.set('Retry-After', String(windowSeconds));
          return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(RATE_LIMIT_BODY);
        }
        logSecurityEvent('rate_limit_degraded_emergency', {
          bucket: routeName,
          sensitivity,
          reason: 'provider_error',
          requestId: req.requestId,
          ipSuffix: ip.length > 8 ? ip.slice(-8) : 'unknown',
        });
        return next();
      }

      logSecurityEvent('rate_limit_fail_open', {
        bucket: routeName,
        sensitivity,
        reason: 'provider_error',
        requestId: req.requestId,
        ...testsApiSurface(routeName),
      });
      return next();
    }

    resetProviderFailureStreak(routeName);

    if (count > maxRequests) {
      logSecurityEvent('rate_limit_exceeded', {
        bucket: routeName,
        requestId: req.requestId,
        ipSuffix: ip.length > 8 ? ip.slice(-8) : 'unknown',
        ...testsApiSurface(routeName),
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
  sensitivity: RateLimitSensitivity.HIGH,
});

/** Forgot-password OTP send + verify — 10 min, 5. */
export const otpLimiter = createUpstashLimiter({
  windowSeconds: 600,
  maxRequests: 5,
  routeName: 'otp',
  sensitivity: RateLimitSensitivity.HIGH,
});

/** General API — 1 min, 60. */
export const apiLimiter = createUpstashLimiter({
  windowSeconds: 60,
  maxRequests: 60,
  routeName: 'api',
  sensitivity: RateLimitSensitivity.MEDIUM,
});

/** Create-order + verify — 1 min, 10. */
export const paymentLimiter = createUpstashLimiter({
  windowSeconds: 60,
  maxRequests: 10,
  routeName: 'payment',
  sensitivity: RateLimitSensitivity.HIGH,
});

/** POST /practice/issue — issuance / provenance (abuse-sensitive). */
export const practiceIssueLimiter = createUpstashLimiter({
  windowSeconds: 60,
  maxRequests: 40,
  routeName: 'practice_issue',
  sensitivity: RateLimitSensitivity.HIGH,
});

/** POST /practice/reveal — answer reveal (abuse-sensitive). */
export const practiceRevealLimiter = createUpstashLimiter({
  windowSeconds: 60,
  maxRequests: 40,
  routeName: 'practice_reveal',
  sensitivity: RateLimitSensitivity.HIGH,
});

/** POST /questions/smart-practice — includes retry issuance paths. */
export const smartPracticeIssueLimiter = createUpstashLimiter({
  windowSeconds: 60,
  maxRequests: 40,
  routeName: 'smart_practice_issue',
  sensitivity: RateLimitSensitivity.HIGH,
});

/** Admin mutation surface — conservative shared bucket per IP. */
export const adminMutationLimiter = createUpstashLimiter({
  windowSeconds: 60,
  maxRequests: 120,
  routeName: 'admin_mutation',
  sensitivity: RateLimitSensitivity.HIGH,
});

/** Authenticated password change — HIGH (credential abuse). */
export const changePasswordLimiter = createUpstashLimiter({
  windowSeconds: 900,
  maxRequests: 15,
  routeName: 'change_password',
  sensitivity: RateLimitSensitivity.HIGH,
});

/**
 * Razorpay webhook — 100/min per IP; allows traffic if Redis is not configured (fail-open).
 */
export const webhookLimiter = createUpstashLimiter({
  windowSeconds: 60,
  maxRequests: 100,
  routeName: 'webhook',
  allowWithoutRedis: true,
  sensitivity: RateLimitSensitivity.LOW,
});

// --- /tests operational shaping (MEDIUM; poll-tolerant, separate buckets) ---

/** List, detail, status, quota — shared read surface (pull-to-refresh tolerant). */
export const testsReadLimiter = createUpstashLimiter({
  windowSeconds: 60,
  maxRequests: 100,
  routeName: 'tests_read',
  sensitivity: RateLimitSensitivity.MEDIUM,
});

/** Start + submit — low frequency lifecycle writes. */
export const testsLifecycleLimiter = createUpstashLimiter({
  windowSeconds: 60,
  maxRequests: 35,
  routeName: 'tests_lifecycle',
  sensitivity: RateLimitSensitivity.MEDIUM,
});

/** PATCH progress autosaves — higher ceiling than generic reads. */
export const testsProgressLimiter = createUpstashLimiter({
  windowSeconds: 60,
  maxRequests: 120,
  routeName: 'tests_progress',
  sensitivity: RateLimitSensitivity.MEDIUM,
});

/** Attempt/history reads per test — tighter to slow enumeration across many test ids. */
export const testsAttemptsReadLimiter = createUpstashLimiter({
  windowSeconds: 60,
  maxRequests: 50,
  routeName: 'tests_attempts_read',
  sensitivity: RateLimitSensitivity.MEDIUM,
});
