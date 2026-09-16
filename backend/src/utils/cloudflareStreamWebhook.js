import crypto from 'crypto';

/** Discard webhook signatures older than this (Cloudflare `time=` is unix seconds). */
export const CLOUDFLARE_STREAM_WEBHOOK_MAX_AGE_SECONDS = 300;

function safeEqualHex(a, b) {
  try {
    const left = String(a);
    const right = String(b);
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Verify Cloudflare Stream `Webhook-Signature: time=...,sig1=...`
 * HMAC-SHA256 over `${time}.${rawBody}` using the dashboard/API signing secret.
 * https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
 *
 * @param {{ secret: string, rawBody: Buffer, signatureHeader: string, nowSeconds?: number, maxAgeSeconds?: number }} input
 * @returns {{ ok: true, time: number } | { ok: false, reason: string }}
 */
export function verifyCloudflareStreamWebhookSignature(input) {
  const secret = String(input?.secret || '');
  if (!secret) return { ok: false, reason: 'missing_secret' };

  const header = String(input?.signatureHeader || '').trim();
  if (!header) return { ok: false, reason: 'missing_signature' };

  const rawBody = input?.rawBody;
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    return { ok: false, reason: 'missing_body' };
  }

  const parts = {};
  for (const piece of header.split(',')) {
    const idx = piece.indexOf('=');
    if (idx <= 0) continue;
    parts[piece.slice(0, idx).trim()] = piece.slice(idx + 1).trim();
  }
  const timeRaw = parts.time;
  const sig1 = parts.sig1;
  const time = Number(timeRaw);
  if (!timeRaw || !Number.isFinite(time) || !sig1) {
    return { ok: false, reason: 'malformed_signature' };
  }

  const nowSeconds = Number.isFinite(input?.nowSeconds)
    ? input.nowSeconds
    : Math.floor(Date.now() / 1000);
  const maxAgeSeconds =
    Number.isFinite(input?.maxAgeSeconds) && input.maxAgeSeconds > 0
      ? input.maxAgeSeconds
      : CLOUDFLARE_STREAM_WEBHOOK_MAX_AGE_SECONDS;
  if (Math.abs(nowSeconds - time) > maxAgeSeconds) {
    return { ok: false, reason: 'timestamp_expired' };
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timeRaw}.`);
  hmac.update(rawBody);
  const expected = hmac.digest('hex');
  if (!safeEqualHex(expected, sig1)) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true, time };
}

export function extractCloudflareStreamUid(payload) {
  const uid = payload?.uid;
  return uid != null && String(uid).trim() ? String(uid).trim() : '';
}

/**
 * Map a Cloudflare Stream video object to VideoLecture.status.
 * Published only when encoding is ready AND readyToStream is true.
 */
export function mapCloudflareVideoToLectureStatus(video) {
  const state = String(video?.status?.state || '').toLowerCase();
  const readyToStream = video?.readyToStream === true;
  if (state === 'error') return 'failed';
  if (state === 'ready' && readyToStream) return 'published';
  if (
    state === 'pendingupload' ||
    state === 'downloading' ||
    state === 'queued' ||
    state === 'inprogress' ||
    (state === 'ready' && !readyToStream)
  ) {
    return 'processing';
  }
  return null;
}

export function extractLectureMediaMetadata(video) {
  const durationRaw = video?.duration;
  let durationSeconds = null;
  if (typeof durationRaw === 'number' && Number.isFinite(durationRaw) && durationRaw > 0) {
    durationSeconds = Math.round(durationRaw);
  }
  const thumb = typeof video?.thumbnail === 'string' ? video.thumbnail.trim() : '';
  return {
    durationSeconds,
    thumbnailUrl: thumb || null,
  };
}

export function buildCloudflareStreamWebhookEventId(payload) {
  const uid = extractCloudflareStreamUid(payload) || 'unknown';
  const state = String(payload?.status?.state || 'unknown');
  const modified = String(payload?.modified || payload?.created || 'na');
  return `cf-stream:${uid}:${state}:${modified}`;
}
