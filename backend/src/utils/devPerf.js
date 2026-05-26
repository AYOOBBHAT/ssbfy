import { AsyncLocalStorage } from 'async_hooks';
import mongoose from 'mongoose';
import { performance } from 'perf_hooks';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const requestPerfStore = new AsyncLocalStorage();
const isDevPerfEnabled = env.nodeEnv === 'development';
const QUERY_SLOW_MS = 80;
const ROUTE_SLOW_MS = 400;

let mongoosePerfInstalled = false;

function safeRoutePath(req) {
  return req.originalUrl?.split('?')[0] || req.url || '';
}

function estimateBytes(body) {
  if (body == null) return 0;
  if (Buffer.isBuffer(body)) return body.length;
  if (typeof body === 'string') return Buffer.byteLength(body);
  try {
    return Buffer.byteLength(JSON.stringify(body));
  } catch {
    return 0;
  }
}

function appendQueryMetric(metric) {
  const ctx = requestPerfStore.getStore();
  if (!ctx) return;
  ctx.queryCount += 1;
  ctx.queryMs += metric.durationMs;
  if (metric.durationMs >= QUERY_SLOW_MS && ctx.slowQueries.length < 5) {
    ctx.slowQueries.push(metric);
  }
}

function patchResponder(res, methodName) {
  const original = res[methodName].bind(res);
  return (body) => {
    if (res.locals.__payloadBytes == null) {
      res.locals.__payloadBytes = estimateBytes(body);
    }
    return original(body);
  };
}

function installQueryWrappers() {
  const originalQueryExec = mongoose.Query.prototype.exec;
  const originalAggregateExec = mongoose.Aggregate.prototype.exec;

  mongoose.Query.prototype.exec = async function patchedQueryExec(...args) {
    const startedAt = performance.now();
    try {
      return await originalQueryExec.apply(this, args);
    } finally {
      const durationMs = Math.round(performance.now() - startedAt);
      const metric = {
        kind: 'query',
        model: this.model?.modelName || 'unknown',
        op: this.op || 'exec',
        durationMs,
      };
      appendQueryMetric(metric);
      if (durationMs >= QUERY_SLOW_MS) {
        logger.debug('[perf.query]', metric);
      }
    }
  };

  mongoose.Aggregate.prototype.exec = async function patchedAggregateExec(...args) {
    const startedAt = performance.now();
    try {
      return await originalAggregateExec.apply(this, args);
    } finally {
      const durationMs = Math.round(performance.now() - startedAt);
      const metric = {
        kind: 'aggregate',
        model: this._model?.modelName || 'unknown',
        pipelineStages: Array.isArray(this._pipeline) ? this._pipeline.length : undefined,
        durationMs,
      };
      appendQueryMetric(metric);
      if (durationMs >= QUERY_SLOW_MS) {
        logger.debug('[perf.aggregate]', metric);
      }
    }
  };
}

export function installDevPerfInstrumentation() {
  if (!isDevPerfEnabled || mongoosePerfInstalled) return;
  mongoosePerfInstalled = true;
  installQueryWrappers();
  logger.info('[perf] dev request/query instrumentation enabled');
}

export function requestPerfMiddleware(req, res, next) {
  if (!isDevPerfEnabled) return next();

  const startedAt = performance.now();
  const ctx = {
    requestId: req.requestId,
    method: req.method,
    route: safeRoutePath(req),
    queryCount: 0,
    queryMs: 0,
    slowQueries: [],
  };

  res.locals.__payloadBytes = null;
  res.json = patchResponder(res, 'json');
  res.send = patchResponder(res, 'send');

  requestPerfStore.run(ctx, () => {
    res.on('finish', () => {
      const durationMs = Math.round(performance.now() - startedAt);
      const payloadBytes = Number(res.locals.__payloadBytes) || 0;
      const appMs = Math.max(0, durationMs - ctx.queryMs);
      const meta = {
        method: ctx.method,
        route: ctx.route,
        statusCode: res.statusCode,
        durationMs,
        queryMs: Math.round(ctx.queryMs),
        appMs,
        queryCount: ctx.queryCount,
        payloadBytes,
        slowQueries: ctx.slowQueries.length ? ctx.slowQueries : undefined,
        requestId: ctx.requestId,
      };
      if (durationMs >= ROUTE_SLOW_MS || payloadBytes >= 75_000 || ctx.queryMs >= 200) {
        logger.info('[perf.route]', meta);
      } else {
        logger.debug('[perf.route]', meta);
      }
    });
    next();
  });
}
