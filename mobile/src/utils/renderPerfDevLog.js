import { useEffect, useRef } from 'react';
import logger from './logger';

const itemMountCounts = new Map();

function nowMs() {
  const perfNow = globalThis?.performance?.now;
  return typeof perfNow === 'function' ? perfNow.call(globalThis.performance) : Date.now();
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function resolveDetail(detail) {
  return typeof detail === 'function' ? detail() : detail;
}

function normalizeDetail(detail) {
  try {
    const resolved = resolveDetail(detail);
    if (!resolved || typeof resolved !== 'object') return {};
    return resolved;
  } catch (error) {
    return {
      detailError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function renderPerfDevLog(event, detail = {}) {
  if (!__DEV__) return;
  logger.debug(`[RenderPerf] ${event}`, detail);
}

export function useDevRenderTrace(label, detail, options = {}) {
  const { logEvery = 10, slowRenderMs = 18, logFirstRender = true } = options;
  const renderCountRef = useRef(0);
  const previousCommitAtRef = useRef(0);
  const detailRef = useRef(detail);
  detailRef.current = detail;
  const renderStartedAt = nowMs();

  useEffect(() => {
    if (!__DEV__) return;
    renderCountRef.current += 1;
    const commitAt = nowMs();
    const renderCount = renderCountRef.current;
    const elapsedMs = roundMs(commitAt - renderStartedAt);
    const sinceLastCommitMs =
      previousCommitAtRef.current > 0
        ? roundMs(commitAt - previousCommitAtRef.current)
        : undefined;
    previousCommitAtRef.current = commitAt;

    const shouldLog =
      (renderCount === 1 && logFirstRender) ||
      (slowRenderMs > 0 && elapsedMs >= slowRenderMs) ||
      (logEvery > 0 && renderCount > 1 && renderCount % logEvery === 0);

    if (!shouldLog) return;

    const event =
      renderCount === 1
        ? 'render'
        : elapsedMs >= slowRenderMs
        ? 'slow-render'
        : 'rerender';

    renderPerfDevLog(event, {
      label,
      renderCount,
      elapsedMs,
      ...(sinceLastCommitMs != null ? { sinceLastCommitMs } : {}),
      ...normalizeDetail(detailRef.current),
    });
  });
}

export function useDevMountTrace(label, detail, options = {}) {
  const { slowMountMs = 40 } = options;
  const mountedAtRef = useRef(nowMs());
  const detailRef = useRef(detail);
  detailRef.current = detail;

  useEffect(() => {
    if (!__DEV__) return undefined;
    const elapsedMs = roundMs(nowMs() - mountedAtRef.current);
    renderPerfDevLog(elapsedMs >= slowMountMs ? 'slow-mount' : 'mount', {
      label,
      elapsedMs,
      ...normalizeDetail(detailRef.current),
    });
    return () => {
      renderPerfDevLog('unmount', {
        label,
        ...normalizeDetail(detailRef.current),
      });
    };
  }, [label, slowMountMs]);
}

export function useDevItemMountCounter(label, itemKey, options = {}) {
  const { logEvery = 10 } = options;
  const normalizedItemKey =
    itemKey == null ? null : String(itemKey).trim() || null;

  useEffect(() => {
    if (!__DEV__ || !normalizedItemKey) return undefined;
    const counterKey = `${label}:${normalizedItemKey}`;
    const nextCount = (itemMountCounts.get(counterKey) || 0) + 1;
    itemMountCounts.set(counterKey, nextCount);

    if (nextCount === 1 || (logEvery > 0 && nextCount % logEvery === 0)) {
      renderPerfDevLog('item-mount-count', {
        label,
        itemKey: normalizedItemKey,
        mountCount: nextCount,
      });
    }

    return undefined;
  }, [label, normalizedItemKey, logEvery]);
}
