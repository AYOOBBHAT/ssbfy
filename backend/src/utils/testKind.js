import { HTTP_STATUS } from '../constants/httpStatus.js';
import { isTestDisabled } from '../constants/testStatus.js';
import {
  TEST_DESCRIPTION_MAX,
  TEST_KIND,
  TEST_YEAR_MAX,
  TEST_YEAR_MIN,
} from '../constants/testKind.js';
import { AppError } from './AppError.js';

/**
 * Missing / null / unknown kind → mock. Only `previous_year` is treated as PYQ.
 * Lean documents do not receive Mongoose defaults, so this must not require `kind`.
 */
export function normalizeTestKind(testOrKind) {
  const raw =
    testOrKind && typeof testOrKind === 'object' && !Array.isArray(testOrKind)
      ? testOrKind.kind
      : testOrKind;
  return raw === TEST_KIND.PREVIOUS_YEAR ? TEST_KIND.PREVIOUS_YEAR : TEST_KIND.MOCK;
}

export function resolveDiscoveryKind(kind) {
  if (kind == null || kind === '') return TEST_KIND.MOCK;
  if (kind === TEST_KIND.PREVIOUS_YEAR) return TEST_KIND.PREVIOUS_YEAR;
  if (kind === TEST_KIND.MOCK) return TEST_KIND.MOCK;
  return TEST_KIND.MOCK;
}

export function isValidTestYear(year) {
  if (year == null || year === '') return false;
  const n = Number(year);
  return Number.isInteger(n) && n >= TEST_YEAR_MIN && n <= TEST_YEAR_MAX;
}

function postIdOf(test) {
  const post = test?.postId;
  if (post == null || post === '') return '';
  if (typeof post === 'object' && post._id != null) return String(post._id);
  return String(post);
}

/**
 * Mongo filter for GET /tests.
 *
 * Default / `kind=mock`: explicit mock **or** legacy docs with missing/null kind.
 * Do not query `{ kind: 'mock' }` alone — lean legacy tests would disappear.
 *
 * `kind=previous_year`: PYQ only; optional `postId` and `year`.
 * Extra postId/year on the mock catalog are ignored so GET /tests?year=2024
 * does not hide every mock.
 */
export function buildTestDiscoveryMongoFilter({ kind, postId, year } = {}) {
  const requested = resolveDiscoveryKind(kind);
  if (requested === TEST_KIND.PREVIOUS_YEAR) {
    const filter = { kind: TEST_KIND.PREVIOUS_YEAR };
    if (postId) filter.postId = postId;
    if (year != null && year !== '') filter.year = Number(year);
    return filter;
  }
  return { kind: { $in: [null, TEST_KIND.MOCK] } };
}

export function matchesDiscoveryQuery(test, query = {}) {
  const requested = resolveDiscoveryKind(query.kind);
  if (normalizeTestKind(test) !== requested) return false;
  if (requested !== TEST_KIND.PREVIOUS_YEAR) return true;
  if (query.postId && postIdOf(test) !== String(query.postId)) return false;
  if (query.year != null && query.year !== '' && Number(test.year) !== Number(query.year)) {
    return false;
  }
  return true;
}

/**
 * Same visibility rules as the existing mock catalog:
 * skip empty question sets; hide disabled tests unless the user has an open attempt.
 */
export function isVisibleInStudentDiscovery(test, { userId = null, openTestIds = new Set() } = {}) {
  const hasQuestions = (test?.questionIds || []).length > 0;
  if (!hasQuestions) return false;
  if (!isTestDisabled(test)) return true;
  return Boolean(userId) && openTestIds.has(String(test._id));
}

export function applyStudentDiscoveryRules(
  tests,
  { userId = null, openTestIds = new Set(), kind, postId, year } = {}
) {
  return (tests || []).filter((t) => {
    if (!matchesDiscoveryQuery(t, { kind, postId, year })) return false;
    return isVisibleInStudentDiscovery(t, { userId, openTestIds });
  });
}

/**
 * Guarantee API payloads always expose kind (legacy docs → mock).
 * Collapse any populated PdfNote to an id and drop URL/storage fields so
 * public test APIs never leak signed URLs or fileUrl.
 */
export function withTestKindDefaults(test) {
  if (!test) return test;
  const rest = { ...test };
  delete rest.signedUrl;
  delete rest.fileUrl;
  delete rest.storedName;
  const kind = normalizeTestKind(rest);
  const yearNum = rest.year == null || rest.year === '' ? null : Number(rest.year);
  let pdfNoteId = rest.pdfNoteId ?? null;
  if (pdfNoteId && typeof pdfNoteId === 'object') {
    pdfNoteId = pdfNoteId._id ?? null;
  }
  return {
    ...rest,
    kind,
    year: Number.isInteger(yearNum) ? yearNum : null,
    description: typeof rest.description === 'string' ? rest.description : '',
    pdfNoteId: pdfNoteId || null,
  };
}

export function resolveCreateKind(kind) {
  if (kind == null || kind === '') return TEST_KIND.MOCK;
  if (kind === TEST_KIND.PREVIOUS_YEAR) return TEST_KIND.PREVIOUS_YEAR;
  if (kind === TEST_KIND.MOCK) return TEST_KIND.MOCK;
  throw new AppError('Invalid test kind', HTTP_STATUS.BAD_REQUEST);
}

/**
 * Kind metadata written on Test.create.
 * Mock (default / omitted kind): PYQ fields are cleared so clients cannot
 * accidentally tag a mock. PYQ requires year + postId; pdfNoteId is optional.
 */
export function buildCreateKindFields(data = {}) {
  const kind = resolveCreateKind(data.kind);
  if (kind !== TEST_KIND.PREVIOUS_YEAR) {
    return {
      kind: TEST_KIND.MOCK,
      year: null,
      postId: null,
      description: '',
      pdfNoteId: null,
    };
  }

  if (!isValidTestYear(data.year)) {
    throw new AppError(
      `year is required for previous year papers (${TEST_YEAR_MIN}–${TEST_YEAR_MAX})`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  const postId = data.postId ? String(data.postId).trim() : '';
  if (!postId) {
    throw new AppError('postId is required for previous year papers', HTTP_STATUS.BAD_REQUEST);
  }

  let description = '';
  if (data.description != null && String(data.description).trim() !== '') {
    description = String(data.description).trim();
    if (description.length > TEST_DESCRIPTION_MAX) {
      throw new AppError(
        `description must be at most ${TEST_DESCRIPTION_MAX} characters`,
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }

  const pdfNoteId =
    data.pdfNoteId != null && String(data.pdfNoteId).trim() !== ''
      ? String(data.pdfNoteId).trim()
      : null;

  return {
    kind: TEST_KIND.PREVIOUS_YEAR,
    year: Number(data.year),
    postId,
    description,
    pdfNoteId,
  };
}

/**
 * Final Test.create payload shape — proves PYQ reuses questionIds / duration /
 * title / negativeMarking and does not invent a separate attempt type.
 */
export function assembleTestCreateDocument({
  title,
  type,
  questionIds,
  duration,
  negativeMarking,
  status,
  disabledAt,
  kindFields,
}) {
  return {
    title,
    type,
    questionIds,
    duration,
    negativeMarking,
    status,
    disabledAt,
    ...kindFields,
  };
}
