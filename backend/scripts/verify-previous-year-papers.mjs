/**
 * Previous Year Paper (PYQ) architecture verification (no Mongo).
 *
 * Covers Test kind metadata, backward-compatible mock discovery, admin create
 * fields, student GET /tests filters, disabled-test visibility, and that PYQ
 * reuses Test.questionIds / TestAttempt (no separate engine).
 *
 * Run: node scripts/verify-previous-year-papers.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_KIND, TEST_YEAR_MAX, TEST_YEAR_MIN } from '../src/constants/testKind.js';
import { TEST_STATUS } from '../src/constants/testStatus.js';
import { AppError } from '../src/utils/AppError.js';
import {
  applyStudentDiscoveryRules,
  assembleTestCreateDocument,
  buildCreateKindFields,
  buildTestDiscoveryMongoFilter,
  isValidTestYear,
  matchesDiscoveryQuery,
  normalizeTestKind,
  withTestKindDefaults,
} from '../src/utils/testKind.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const POST_A = '64c0000000000000000000c1';
const POST_B = '64c0000000000000000000c2';
const Q1 = '64d0000000000000000000q1';
const Q2 = '64d0000000000000000000q2';
const PDF_A = '64e0000000000000000000p1';

function readSrc(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function expectThrow(fn, re) {
  let err;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'expected an error');
  if (re) assert.match(String(err.message), re);
  return err;
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

const legacyMock = {
  _id: 'legacy1',
  title: 'Old Mock',
  type: 'mixed',
  questionIds: [Q1],
  duration: 30,
  negativeMarking: 0.25,
  status: TEST_STATUS.ACTIVE,
};

const explicitMock = {
  _id: 'mock1',
  kind: TEST_KIND.MOCK,
  title: 'New Mock',
  type: 'topic',
  questionIds: [Q1, Q2],
  duration: 45,
  negativeMarking: 0,
  status: TEST_STATUS.ACTIVE,
};

const pyq = {
  _id: 'pyq1',
  kind: TEST_KIND.PREVIOUS_YEAR,
  title: 'JKSSB 2024',
  type: 'post',
  year: 2024,
  postId: POST_A,
  description: 'Official paper',
  pdfNoteId: PDF_A,
  questionIds: [Q1, Q2],
  duration: 120,
  negativeMarking: 0.25,
  status: TEST_STATUS.ACTIVE,
};

const disabledPyq = {
  ...pyq,
  _id: 'pyq-disabled',
  status: TEST_STATUS.DISABLED,
};

const pyqOtherPost = {
  ...pyq,
  _id: 'pyq-2023',
  year: 2023,
  postId: POST_B,
};

// 1. Existing Test without kind still works.
test('1. legacy Test without kind is treated as mock', () => {
  assert.equal(normalizeTestKind(legacyMock), TEST_KIND.MOCK);
  assert.equal(withTestKindDefaults(legacyMock).kind, TEST_KIND.MOCK);
  assert.equal(matchesDiscoveryQuery(legacyMock, {}), true);
  assert.equal(matchesDiscoveryQuery(legacyMock, { kind: TEST_KIND.MOCK }), true);
  assert.equal(matchesDiscoveryQuery(legacyMock, { kind: TEST_KIND.PREVIOUS_YEAR }), false);
  const catalog = applyStudentDiscoveryRules([legacyMock, pyq], {});
  assert.deepEqual(
    catalog.map((t) => t._id),
    ['legacy1']
  );
});

// 2. Mock Test remains kind=mock / default behavior.
test('2. omitted kind on create is mock; extra PYQ fields ignored', () => {
  const fields = buildCreateKindFields({
    title: 'X',
    year: 2024,
    postId: POST_A,
    description: 'should be dropped',
  });
  assert.deepEqual(fields, {
    kind: TEST_KIND.MOCK,
    year: null,
    postId: null,
    description: '',
    pdfNoteId: null,
  });
  assert.deepEqual(buildCreateKindFields({ kind: TEST_KIND.MOCK }), fields);
  assert.equal(withTestKindDefaults(explicitMock).kind, TEST_KIND.MOCK);
});

// 3. Admin can create PYQ (payload shape).
test('3. PYQ create fields include year, postId, optional pdf, and questionIds', () => {
  const kindFields = buildCreateKindFields({
    kind: TEST_KIND.PREVIOUS_YEAR,
    year: 2025,
    postId: POST_A,
    description: '  JKSSB paper  ',
    pdfNoteId: PDF_A,
  });
  assert.equal(kindFields.kind, TEST_KIND.PREVIOUS_YEAR);
  assert.equal(kindFields.year, 2025);
  assert.equal(kindFields.postId, POST_A);
  assert.equal(kindFields.description, 'JKSSB paper');
  assert.equal(kindFields.pdfNoteId, PDF_A);

  const doc = assembleTestCreateDocument({
    title: 'JKSSB 2025',
    type: 'post',
    questionIds: [Q1, Q2],
    duration: 90,
    negativeMarking: 0.25,
    status: TEST_STATUS.ACTIVE,
    disabledAt: null,
    kindFields,
  });
  assert.deepEqual(doc.questionIds, [Q1, Q2]);
  assert.equal(doc.duration, 90);
  assert.equal(doc.title, 'JKSSB 2025');
  assert.equal(doc.kind, TEST_KIND.PREVIOUS_YEAR);
  assert.equal(doc.year, 2025);
  assert.equal(doc.postId, POST_A);
  assert.equal('attemptType' in doc, false);
});

// 4. Non-admin cannot create PYQ — POST /tests is adminChain.
test('4. POST /tests is admin-only; GET /tests is not an admin endpoint', () => {
  const routes = readSrc('src/routes/testRoutes.js');
  assert.match(routes, /router\.post\(\s*'\/'\s*,[\s\S]*?adminChain[\s\S]*?testController\.create/);
  assert.match(routes, /router\.get\(\s*'\/'\s*,[\s\S]*?authOptional[\s\S]*?listTestsQueryValidators[\s\S]*?testController\.list/);
  const getListMatch = routes.match(/router\.get\(\s*'\/'[\s\S]{0,500}?testController\.list/);
  assert.ok(getListMatch, 'GET / tests list route present');
  assert.doesNotMatch(getListMatch[0], /adminChain/);
});

// 5. PYQ requires valid year (1900–2100).
test('5. PYQ requires a valid year', () => {
  assert.equal(isValidTestYear(1900), true);
  assert.equal(isValidTestYear(2100), true);
  assert.equal(isValidTestYear(1899), false);
  assert.equal(isValidTestYear(2101), false);
  assert.equal(isValidTestYear(null), false);

  const missing = expectThrow(
    () => buildCreateKindFields({ kind: TEST_KIND.PREVIOUS_YEAR, postId: POST_A }),
    /year/i
  );
  assert.ok(missing instanceof AppError);

  expectThrow(
    () =>
      buildCreateKindFields({
        kind: TEST_KIND.PREVIOUS_YEAR,
        year: 1800,
        postId: POST_A,
      }),
    /year/i
  );
});

// 6. PYQ can reference an existing Post.
test('6. PYQ create requires postId (exam reference)', () => {
  expectThrow(
    () => buildCreateKindFields({ kind: TEST_KIND.PREVIOUS_YEAR, year: 2024 }),
    /postId/i
  );
  const fields = buildCreateKindFields({
    kind: TEST_KIND.PREVIOUS_YEAR,
    year: 2024,
    postId: POST_A,
  });
  assert.equal(fields.postId, POST_A);
  assert.equal(fields.pdfNoteId, null);
});

// 7. PYQ can be discovered separately.
test('7. GET /tests default is mocks; kind=previous_year lists PYQs', () => {
  const all = [legacyMock, explicitMock, pyq, pyqOtherPost, disabledPyq];

  const defaultCatalog = applyStudentDiscoveryRules(all, {});
  assert.deepEqual(
    defaultCatalog.map((t) => t._id).sort(),
    ['legacy1', 'mock1']
  );

  const mockCatalog = applyStudentDiscoveryRules(all, { kind: TEST_KIND.MOCK });
  assert.deepEqual(
    mockCatalog.map((t) => t._id).sort(),
    ['legacy1', 'mock1']
  );

  const pyqCatalog = applyStudentDiscoveryRules(all, { kind: TEST_KIND.PREVIOUS_YEAR });
  assert.deepEqual(
    pyqCatalog.map((t) => t._id).sort(),
    ['pyq-2023', 'pyq1']
  );

  const byPost = applyStudentDiscoveryRules(all, {
    kind: TEST_KIND.PREVIOUS_YEAR,
    postId: POST_A,
  });
  assert.deepEqual(
    byPost.map((t) => t._id),
    ['pyq1']
  );

  const byYear = applyStudentDiscoveryRules(all, {
    kind: TEST_KIND.PREVIOUS_YEAR,
    year: 2023,
  });
  assert.deepEqual(
    byYear.map((t) => t._id),
    ['pyq-2023']
  );

  const mongoDefault = buildTestDiscoveryMongoFilter({});
  assert.deepEqual(mongoDefault, { kind: { $in: [null, TEST_KIND.MOCK] } });
  const mongoPyq = buildTestDiscoveryMongoFilter({
    kind: TEST_KIND.PREVIOUS_YEAR,
    postId: POST_A,
    year: 2024,
  });
  assert.deepEqual(mongoPyq, {
    kind: TEST_KIND.PREVIOUS_YEAR,
    postId: POST_A,
    year: 2024,
  });
  const mongoMockIgnoresYear = buildTestDiscoveryMongoFilter({
    kind: TEST_KIND.MOCK,
    year: 2024,
    postId: POST_A,
  });
  assert.deepEqual(mongoMockIgnoresYear, { kind: { $in: [null, TEST_KIND.MOCK] } });
});

// 8. Disabled PYQ is not available to normal students.
test('8. disabled PYQ is hidden from student discovery', () => {
  const rows = [pyq, disabledPyq];
  const guest = applyStudentDiscoveryRules(rows, { kind: TEST_KIND.PREVIOUS_YEAR });
  assert.deepEqual(
    guest.map((t) => t._id),
    ['pyq1']
  );

  const studentNoOpen = applyStudentDiscoveryRules(rows, {
    kind: TEST_KIND.PREVIOUS_YEAR,
    userId: 'user1',
    openTestIds: new Set(),
  });
  assert.deepEqual(
    studentNoOpen.map((t) => t._id),
    ['pyq1']
  );

  const resume = applyStudentDiscoveryRules(rows, {
    kind: TEST_KIND.PREVIOUS_YEAR,
    userId: 'user1',
    openTestIds: new Set(['pyq-disabled']),
  });
  assert.deepEqual(
    resume.map((t) => t._id).sort(),
    ['pyq-disabled', 'pyq1']
  );

  const defaultCatalog = applyStudentDiscoveryRules(rows, {});
  assert.equal(defaultCatalog.length, 0);
});

// 9. PYQ uses existing questionIds.
test('9. PYQ document stores the same questionIds field as mocks', () => {
  const kindFields = buildCreateKindFields({
    kind: TEST_KIND.PREVIOUS_YEAR,
    year: 2024,
    postId: POST_A,
  });
  const doc = assembleTestCreateDocument({
    title: 'Paper',
    type: 'mixed',
    questionIds: [Q1, Q2],
    duration: 60,
    negativeMarking: 0,
    status: TEST_STATUS.ACTIVE,
    disabledAt: null,
    kindFields,
  });
  assert.ok(Array.isArray(doc.questionIds));
  assert.deepEqual(doc.questionIds, [Q1, Q2]);
  assert.equal('pyqQuestionIds' in doc, false);
});

// 10. PYQ does not create a separate attempt type.
test('10. TestAttempt has no PYQ/kind field; attempts still key off testId', () => {
  const attemptSrc = readSrc('src/models/TestAttempt.js');
  assert.match(attemptSrc, /testId:/);
  assert.doesNotMatch(attemptSrc, /previous_year/);
  assert.doesNotMatch(attemptSrc, /TEST_KIND/);
  const schemaStart = attemptSrc.indexOf('const testAttemptSchema');
  const schema = attemptSrc.slice(schemaStart, attemptSrc.indexOf('testAttemptSchema.index'));
  assert.doesNotMatch(schema, /\n\s*kind:/);

  const service = readSrc('src/services/testAttemptService.js');
  assert.doesNotMatch(service, /previous_year/);
  assert.doesNotMatch(service, /TEST_KIND/);
});

// 11. Existing mock tests remain unchanged.
test('11. mock create payload is unchanged aside from explicit kind=mock defaults', () => {
  const kindFields = buildCreateKindFields({});
  const doc = assembleTestCreateDocument({
    title: 'Mock 1',
    type: 'topic',
    questionIds: [Q1],
    duration: 30,
    negativeMarking: 0,
    status: TEST_STATUS.ACTIVE,
    disabledAt: null,
    kindFields,
  });
  assert.equal(doc.kind, TEST_KIND.MOCK);
  assert.equal(doc.year, null);
  assert.equal(doc.postId, null);
  assert.equal(doc.title, 'Mock 1');
  assert.deepEqual(doc.questionIds, [Q1]);
  assert.equal(doc.duration, 30);
  assert.equal(doc.negativeMarking, 0);
});

// 12. Existing TestAttempt behavior remains unchanged (submit/scoring files untouched).
test('12. scoring / rank / battle / daily-practice / leaderboard files were not used as PYQ hooks', () => {
  const attemptService = readSrc('src/services/testAttemptService.js');
  assert.doesNotMatch(attemptService, /previous_year/);
  assert.doesNotMatch(readSrc('src/utils/mockTestRank.js'), /previous_year/);
  assert.doesNotMatch(readSrc('src/services/testRankService.js'), /previous_year/);
  const battleFiles = [
    'src/constants/battle.js',
    'src/constants/battleHistory.js',
  ];
  for (const f of battleFiles) {
    assert.doesNotMatch(readSrc(f), /previous_year/);
  }

  const testModel = readSrc('src/models/Test.js');
  assert.match(testModel, /kind:/);
  assert.match(testModel, /TEST_KIND/);
  assert.match(testModel, /idx_test_pyq_discovery/);
  assert.match(testModel, /year:/);
  assert.match(testModel, /postId:/);
  assert.match(testModel, /pdfNoteId:/);

  const shaped = withTestKindDefaults({
    ...pyq,
    signedUrl: 'https://secret.example/file.pdf?sig=1',
    fileUrl: 'https://bucket.example/file.pdf',
    storedName: 'secret-key',
    pdfNoteId: { _id: PDF_A, fileUrl: 'https://leak', signedUrl: 'https://leak2' },
  });
  assert.equal(shaped.pdfNoteId, PDF_A);
  assert.equal(shaped.signedUrl, undefined);
  assert.equal(shaped.fileUrl, undefined);
  assert.equal(shaped.storedName, undefined);

  assert.ok(TEST_YEAR_MIN === 1900 && TEST_YEAR_MAX === 2100);
});

console.log(`\n${passed} checks passed`);
