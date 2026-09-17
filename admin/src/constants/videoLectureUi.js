/** Mirrors backend/src/constants/videoLecture.js for Admin validation only. */
export const LECTURE_TITLE_MIN = 2;
export const LECTURE_TITLE_MAX = 200;
export const LECTURE_DESCRIPTION_MAX = 2000;
export const LECTURE_MAX_DURATION_SECONDS = 14400;
export const LECTURE_DEFAULT_MAX_DURATION_SECONDS = 3600;

export const LECTURE_ACCESS = {
  FREE: 'free',
  PREMIUM: 'premium',
};

export const LECTURE_STATUS = {
  DRAFT: 'draft',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  PUBLISHED: 'published',
  FAILED: 'failed',
  ARCHIVED: 'archived',
};
