/**
 * Student Previous Year Papers helpers (display + catalog filtering).
 * Identification uses Test.kind / postId / year — never title strings.
 */

export const TEST_KIND_MOCK = 'mock';
export const TEST_KIND_PREVIOUS_YEAR = 'previous_year';

/** Stack route names that mount PreviousYearPapersScreen. */
export const PYQ_ROUTE_PAPERS_TAB = 'PapersMain';
export const PYQ_ROUTE_HOME = 'PreviousYearPapers';

/**
 * Return tab for a PYQ start. Based on which navigator mounted the screen,
 * never on test.kind — the same paper can open from Home or Papers.
 */
export function resolvePyqOriginMainTab(routeName) {
  return routeName === PYQ_ROUTE_PAPERS_TAB ? 'Papers' : 'Home';
}

export function isPreviousYearPaper(test) {
  return test?.kind === TEST_KIND_PREVIOUS_YEAR;
}

/** Nav/session copy: use `kind` already on the paper/session. No extra fetch. */
export function isPreviousYearPaperSession(session = {}) {
  return session?.kind === TEST_KIND_PREVIOUS_YEAR;
}

export function keepPreviousYearPapers(tests) {
  return (Array.isArray(tests) ? tests : []).filter(isPreviousYearPaper);
}

/** Legacy mocks have no kind; treat anything except previous_year as a mock. */
export function keepMockTests(tests) {
  return (Array.isArray(tests) ? tests : []).filter((t) => !isPreviousYearPaper(t));
}

/**
 * Query params for GET /tests.
 * Omitted `kind` keeps the default mock catalog.
 * postId / year are only sent with kind=previous_year.
 */
export function buildGetTestsParams(opts = {}) {
  const params = {};
  if (opts.kind === TEST_KIND_PREVIOUS_YEAR || opts.kind === TEST_KIND_MOCK) {
    params.kind = opts.kind;
  }
  if (opts.kind === TEST_KIND_PREVIOUS_YEAR) {
    const postId = opts.postId != null ? String(opts.postId).trim() : '';
    if (postId) params.postId = postId;
    if (opts.year != null && opts.year !== '') {
      const year = Number(opts.year);
      if (Number.isInteger(year)) params.year = year;
    }
  }
  return params;
}

export function postIdOf(test) {
  const post = test?.postId;
  if (post == null || post === '') return '';
  if (typeof post === 'object' && post._id != null) return String(post._id);
  return String(post);
}

export function paperYear(test) {
  if (test?.year == null || test.year === '') return null;
  const n = Number(test.year);
  return Number.isInteger(n) ? n : null;
}

export function questionCount(test) {
  return Array.isArray(test?.questionIds) ? test.questionIds.length : 0;
}

/**
 * Exam label from the posts catalog. Never returns a Mongo id.
 */
export function examLabel(test, postsById = new Map()) {
  const id = postIdOf(test);
  if (!id) return '';
  const post = postsById.get(id);
  const name = post?.name || post?.slug || '';
  return name ? String(name).trim() : '';
}

export function buildPostsById(posts) {
  const map = new Map();
  for (const p of posts || []) {
    const id = String(p?._id ?? '').trim();
    if (id) map.set(id, p);
  }
  return map;
}

/**
 * Active papers for the student catalog. Disabled papers stay hidden unless
 * the API returned them for an in-progress attempt (`hasOpenAttempt`).
 */
export function isStudentVisiblePyq(test, { hasOpenAttempt = false } = {}) {
  if (!isPreviousYearPaper(test)) return false;
  if (test?.status === 'disabled' && !hasOpenAttempt) return false;
  if (questionCount(test) === 0 && !hasOpenAttempt) return false;
  return true;
}

export function uniqueExamOptions(tests, postsById = new Map()) {
  const seen = new Map();
  for (const t of tests || []) {
    const id = postIdOf(t);
    if (!id || seen.has(id)) continue;
    const name = examLabel(t, postsById);
    if (!name) continue;
    seen.set(id, name);
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function uniqueYears(tests) {
  const set = new Set();
  for (const t of tests || []) {
    const y = paperYear(t);
    if (y != null) set.add(y);
  }
  return [...set].sort((a, b) => b - a);
}

export function filterPreviousYearPapers(tests, { postId, year } = {}) {
  const wantPost = postId != null && String(postId).trim() !== '' ? String(postId) : '';
  const wantYear =
    year != null && year !== '' && Number.isInteger(Number(year)) ? Number(year) : null;
  return (tests || []).filter((t) => {
    if (!isPreviousYearPaper(t)) return false;
    if (wantPost && postIdOf(t) !== wantPost) return false;
    if (wantYear != null && paperYear(t) !== wantYear) return false;
    return true;
  });
}

export function groupPreviousYearPapersByYear(tests) {
  const byYear = new Map();
  for (const t of tests || []) {
    const y = paperYear(t);
    const key = y == null ? 'unknown' : String(y);
    if (!byYear.has(key)) byYear.set(key, []);
    byYear.get(key).push(t);
  }
  const keys = [...byYear.keys()].sort((a, b) => {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return Number(b) - Number(a);
  });
  return keys.map((key) => ({
    key: `year-${key}`,
    yearKey: key,
    title: key === 'unknown' ? 'Year not set' : key,
    data: byYear.get(key),
  }));
}

const PYQ_CTA_LABELS = {
  'Start Mock': 'Start Paper',
  'Continue Mock': 'Continue Paper',
  'Retry Mock': 'Retry Paper',
  'Open Mock': 'Open Paper',
};

export function resolvePyqCtaLabels(presentation = {}) {
  const ctaLabel = PYQ_CTA_LABELS[presentation.ctaLabel] || presentation.ctaLabel;
  return { ...presentation, ctaLabel };
}
