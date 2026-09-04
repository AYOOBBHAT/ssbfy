/**
 * Test product kind — distinct from `Test.type` (subject/post/topic/mixed taxonomy).
 *
 * `mock` is the default and matches every existing Test that has no `kind`.
 * `previous_year` marks a Previous Year Paper that still uses the same Test /
 * TestAttempt engine.
 */
export const TEST_KIND = {
  MOCK: 'mock',
  PREVIOUS_YEAR: 'previous_year',
};

export const TEST_KIND_VALUES = Object.values(TEST_KIND);

/** Same bounds as Question.year. */
export const TEST_YEAR_MIN = 1900;
export const TEST_YEAR_MAX = 2100;

export const TEST_DESCRIPTION_MAX = 2000;
