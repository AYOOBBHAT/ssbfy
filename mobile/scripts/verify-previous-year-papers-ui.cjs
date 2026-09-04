/**
 * Student Previous Year Papers UI verification (no React Native).
 * Run from mobile/: node scripts/verify-previous-year-papers-ui.cjs
 */
const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function loadModule(rel, exportNames) {
  const filename = path.join(SRC, rel);
  const source = fs.readFileSync(filename, 'utf8');
  const cjs = `${source
    .replace(/\bexport\s+function\s+/g, 'function ')
    .replace(/\bexport\s+const\s+/g, 'const ')
    .replace(/\bexport\s+\{[\s\S]*?\};?/g, '')}

module.exports = { ${exportNames.join(', ')} };
`;
  const m = new Module(filename);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  m._compile(cjs, filename);
  return m.exports;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const pyq = loadModule('utils/previousYearPapers.js', [
  'TEST_KIND_PREVIOUS_YEAR',
  'buildGetTestsParams',
  'keepPreviousYearPapers',
  'keepMockTests',
  'filterPreviousYearPapers',
  'groupPreviousYearPapersByYear',
  'isStudentVisiblePyq',
  'questionCount',
  'paperYear',
  'examLabel',
  'buildPostsById',
  'uniqueExamOptions',
  'uniqueYears',
  'isPreviousYearPaper',
  'resolvePyqCtaLabels',
]);

const rank = loadModule('utils/mockPersonalRank.js', [
  'shouldFetchMockPersonalRank',
]);

const POST_A = '64c0000000000000000000c1';
const POST_B = '64c0000000000000000000c2';
const MOCK_ID = '64a0000000000000000000aa';
const PYQ_ID = '64a0000000000000000000bb';

const mock = {
  _id: MOCK_ID,
  kind: 'mock',
  title: 'Full Mock 1',
  questionIds: ['q1', 'q2'],
  duration: 60,
  status: 'active',
};

const legacyMock = {
  _id: 'legacy1',
  title: 'Old Mock',
  questionIds: ['q1'],
  duration: 30,
  status: 'active',
};

const pyq2025 = {
  _id: PYQ_ID,
  kind: 'previous_year',
  title: 'JKAS Combined Competitive Examination',
  year: 2025,
  postId: POST_A,
  description: 'Official paper',
  questionIds: new Array(100).fill('q'),
  duration: 120,
  status: 'active',
};

const pyq2024 = {
  _id: 'pyq2024',
  kind: 'previous_year',
  title: 'JKAS 2024',
  year: 2024,
  postId: POST_A,
  questionIds: new Array(80).fill('q'),
  duration: 90,
  status: 'active',
};

const pyqOther = {
  _id: 'pyq-jkssb',
  kind: 'previous_year',
  title: 'JKSSB 2025',
  year: 2025,
  postId: POST_B,
  questionIds: ['q1'],
  duration: 45,
  status: 'active',
};

const disabledPyq = {
  ...pyq2025,
  _id: 'pyq-disabled',
  status: 'disabled',
};

const postsById = pyq.buildPostsById([
  { _id: POST_A, name: 'JKAS' },
  { _id: POST_B, name: 'JKSSB' },
]);

function run() {
  const all = [mock, legacyMock, pyq2025, pyq2024, pyqOther, disabledPyq];

  // 1 + 2. PYQ screen loads previous_year only
  const pyqParams = pyq.buildGetTestsParams({ kind: pyq.TEST_KIND_PREVIOUS_YEAR });
  assert.deepEqual(pyqParams, { kind: 'previous_year' });
  assert.deepEqual(
    pyq.keepPreviousYearPapers(all).map((t) => t._id).sort(),
    ['pyq-disabled', 'pyq-jkssb', 'pyq2024', PYQ_ID].sort()
  );

  // 3. Mock tests do not appear in PYQ screen
  assert.equal(pyq.keepPreviousYearPapers(all).some((t) => t.kind === 'mock'), false);
  assert.equal(pyq.keepPreviousYearPapers(all).some((t) => !t.kind), false);

  // 4. PYQs do not appear in mock catalog helper / default GET params
  assert.deepEqual(pyq.buildGetTestsParams({}), {});
  assert.deepEqual(
    pyq.keepMockTests(all).map((t) => t._id).sort(),
    [MOCK_ID, 'legacy1'].sort()
  );
  const mockHook = read('src/hooks/useMockTests.js');
  assert.match(mockHook, /getTests\(\{\s*signal:\s*ac\.signal\s*\}\)/);
  assert.match(mockHook, /keepMockTests/);
  assert.doesNotMatch(mockHook, /kind:\s*['"]previous_year['"]/);
  const testsList = read('src/screens/TestsListScreen.js');
  assert.doesNotMatch(testsList, /PreviousYearPapers/);
  assert.doesNotMatch(testsList, /previous_year/);

  const pyqHook = read('src/hooks/usePreviousYearPapers.js');
  assert.match(pyqHook, /kind:\s*TEST_KIND_PREVIOUS_YEAR/);
  assert.match(pyqHook, /keepPreviousYearPapers/);
  assert.match(pyqHook, /startTest\(testId\)/);
  assert.match(pyqHook, /navigate\('Test'/);

  // 5. Exam/Post filter
  const byExam = pyq.filterPreviousYearPapers(pyq.keepPreviousYearPapers(all), {
    postId: POST_A,
  });
  assert.deepEqual(
    byExam.map((t) => t._id).sort(),
    ['pyq-disabled', 'pyq2024', PYQ_ID].sort()
  );
  const examOpts = pyq.uniqueExamOptions([pyq2025, pyqOther], postsById);
  assert.deepEqual(
    examOpts.map((o) => o.name).sort(),
    ['JKAS', 'JKSSB']
  );

  // 6. Year filter
  const byYear = pyq.filterPreviousYearPapers(pyq.keepPreviousYearPapers(all), {
    year: 2025,
  });
  assert.ok(byYear.every((t) => t.year === 2025));
  assert.deepEqual(pyq.uniqueYears([pyq2025, pyq2024]), [2025, 2024]);
  const grouped = pyq.groupPreviousYearPapersByYear([pyq2024, pyq2025]);
  assert.equal(grouped[0].title, '2025');
  assert.equal(grouped[1].title, '2024');

  // 7. Question count
  assert.equal(pyq.questionCount(pyq2025), 100);
  assert.equal(pyq.questionCount(mock), 2);

  // 8. Duration stays on the test (card reads item.duration)
  assert.equal(pyq2025.duration, 120);
  const cardSrc = read('src/components/PreviousYearPaperCard.js');
  assert.match(cardSrc, /item\?\.duration/);
  assert.match(cardSrc, /Question/);
  assert.doesNotMatch(cardSrc, /humanizeMockTitle/);

  // 9 + 10. Start uses existing /tests/:id/start — no PYQ attempt endpoint
  const testService = read('src/services/testService.js');
  assert.match(testService, /api\.post\(`\/tests\/\$\{id\}\/start`/);
  assert.doesNotMatch(testService, /previous-year-papers/);
  assert.doesNotMatch(pyqHook, /previous-year-papers/);
  assert.doesNotMatch(read('src/screens/PreviousYearPapersScreen.js'), /previous-year-papers/);

  // 11. Existing TestScreen opens
  assert.match(pyqHook, /navigation\.navigate\('Test'/);
  assert.doesNotMatch(read('src/navigation/AppNavigator.js'), /PYQTestScreen/);
  assert.match(read('src/navigation/AppNavigator.js'), /PreviousYearPapersScreen/);
  assert.match(read('src/navigation/AppNavigator.js'), /component=\{TestScreen\}/);

  // 12. Existing ResultScreen — PYQ start does not pass sessionType/retry
  assert.doesNotMatch(pyqHook, /sessionType/);
  assert.doesNotMatch(pyqHook, /retry:\s*true/);
  assert.match(read('src/screens/ResultScreen.js'), /const isMock = !!testId && !isRetry/);
  assert.match(read('src/screens/ResultScreen.js'), /useMockPersonalRank/);

  // 13. Personal rank after PYQ completion (normal testId, not retry)
  assert.equal(
    rank.shouldFetchMockPersonalRank({ testId: PYQ_ID, isRetry: false }),
    true
  );

  // 14. Battle result does not show mock rank
  assert.equal(
    rank.shouldFetchMockPersonalRank({
      testId: PYQ_ID,
      isRetry: false,
      sessionType: 'battle',
    }),
    false
  );

  // 15. Daily Practice result does not show mock rank
  assert.equal(
    rank.shouldFetchMockPersonalRank({
      testId: PYQ_ID,
      isRetry: false,
      sessionType: 'daily',
    }),
    false
  );

  // 16. Empty state copy
  const empty = read('src/theme/stateCopy.js');
  assert.match(empty, /PREVIOUS_YEAR_PAPERS:/);
  assert.match(empty, /No previous year papers available yet/);
  assert.match(empty, /Check back soon/);
  assert.doesNotMatch(
    empty.slice(empty.indexOf('PREVIOUS_YEAR_PAPERS:'), empty.indexOf('PREVIOUS_YEAR_PAPERS_FILTER')),
    /No tests found/
  );

  // 17. API error state
  const screen = read('src/screens/PreviousYearPapersScreen.js');
  assert.match(screen, /Unable to load previous year papers/);
  assert.match(screen, /ErrorState/);
  assert.match(screen, /retryLabel="Try again"/);

  // 18. Disabled PYQs are not exposed without an open attempt
  assert.equal(pyq.isStudentVisiblePyq(disabledPyq), false);
  assert.equal(pyq.isStudentVisiblePyq(disabledPyq, { hasOpenAttempt: true }), true);
  assert.equal(pyq.isStudentVisiblePyq(pyq2025), true);
  assert.equal(pyq.isStudentVisiblePyq(mock), false);
  assert.match(screen, /isStudentVisiblePyq/);

  // Exam labels never fall back to Mongo ids
  assert.equal(pyq.examLabel(pyq2025, postsById), 'JKAS');
  assert.equal(pyq.examLabel(pyq2025, new Map()), '');

  // CTA copy
  assert.equal(
    pyq.resolvePyqCtaLabels({ ctaLabel: 'Start Mock' }).ctaLabel,
    'Start Paper'
  );

  // Home entry + no PDF URL construction
  const home = read('src/screens/HomeScreen.js');
  assert.match(home, /Previous Year Papers/);
  assert.match(home, /Explore Papers/);
  assert.match(home, /navigate\('PreviousYearPapers'\)/);
  assert.doesNotMatch(screen, /signedUrl|fileUrl/);
  assert.doesNotMatch(cardSrc, /signedUrl|fileUrl/);
  assert.doesNotMatch(pyqHook, /pdfNoteId/);

  // Grouping uses postId/year fields, not title inference
  const util = read('src/utils/previousYearPapers.js');
  assert.match(util, /test\?\.kind === TEST_KIND_PREVIOUS_YEAR/);
  assert.doesNotMatch(util, /title\.includes/);

  console.log('verify-previous-year-papers-ui: all checks passed');
}

run();
