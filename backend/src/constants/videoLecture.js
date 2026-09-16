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
