export const VIDEO_LECTURE_ACCESS = {
  FREE: 'free',
  PREMIUM: 'premium',
};

export const VIDEO_LECTURE_ACCESS_VALUES = Object.values(VIDEO_LECTURE_ACCESS);

export const VIDEO_LECTURE_STATUS = {
  DRAFT: 'draft',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  PUBLISHED: 'published',
  FAILED: 'failed',
  ARCHIVED: 'archived',
};

export const VIDEO_LECTURE_STATUS_VALUES = Object.values(VIDEO_LECTURE_STATUS);

export const VIDEO_LECTURE_TITLE_MIN = 2;
export const VIDEO_LECTURE_TITLE_MAX = 200;
export const VIDEO_LECTURE_DESCRIPTION_MAX = 2000;

/** Client/env default reservation when a request omits maxDurationSeconds. */
export const VIDEO_LECTURE_DEFAULT_MAX_DURATION_SECONDS = 3600;

/** Hard cap — Cloudflare allows up to 36000; we keep a tighter lecture bound. */
export const VIDEO_LECTURE_ABSOLUTE_MAX_DURATION_SECONDS = 14400;

/** Direct-upload URL lifetime default (seconds). */
export const VIDEO_LECTURE_DEFAULT_UPLOAD_EXPIRY_SECONDS = 1800;

/** Signed playback JWT/token lifetime — never the PDF 90s TTL. */
export const VIDEO_LECTURE_PLAYBACK_TTL_MIN_SECONDS = 5 * 60;
export const VIDEO_LECTURE_PLAYBACK_TTL_MAX_SECONDS = 6 * 3600;
export const VIDEO_LECTURE_PLAYBACK_TTL_BUFFER_SECONDS = 15 * 60;
export const VIDEO_LECTURE_PLAYBACK_TTL_DEFAULT_SECONDS = 2 * 3600;

/**
 * TTL = clamp(durationSeconds + 15 minutes, 5 minutes, 6 hours).
 * Server-generated only. Unknown duration defaults to 2 hours before clamp.
 * Examples: 8s → 908s (~15m); 30m → 45m; 2h → 2h15m; 8h → 6h max.
 */
export function resolvePlaybackTtlSeconds(durationSeconds) {
  const duration = Number(durationSeconds);
  const base =
    Number.isFinite(duration) && duration > 0
      ? duration + VIDEO_LECTURE_PLAYBACK_TTL_BUFFER_SECONDS
      : VIDEO_LECTURE_PLAYBACK_TTL_DEFAULT_SECONDS;
  return Math.min(
    VIDEO_LECTURE_PLAYBACK_TTL_MAX_SECONDS,
    Math.max(VIDEO_LECTURE_PLAYBACK_TTL_MIN_SECONDS, Math.round(base))
  );
}
