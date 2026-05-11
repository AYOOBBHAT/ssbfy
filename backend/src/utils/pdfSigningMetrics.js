/**
 * Per-request counters for PDF signing batches (nested-safe via stack).
 * Used when `pdfSigningBatchStart` / `pdfSigningBatchEnd` wrap a handler.
 */

const stack = [];

function current() {
  return stack.length ? stack[stack.length - 1] : null;
}

export function pdfSigningBatchStart() {
  const ctx = { cacheHits: 0, signCalls: 0, waitDedupes: 0, t0: Date.now() };
  stack.push(ctx);
  return ctx;
}

/** @returns {{ cacheHits: number, signCalls: number, waitDedupes: number, t0: number } | null} */
export function pdfSigningBatchEnd() {
  return stack.pop() || null;
}

export function pdfSigningRecordCacheHit() {
  const c = current();
  if (c) c.cacheHits += 1;
}

export function pdfSigningRecordSignCall() {
  const c = current();
  if (c) c.signCalls += 1;
}

export function pdfSigningRecordWaitDedupe() {
  const c = current();
  if (c) c.waitDedupes += 1;
}
