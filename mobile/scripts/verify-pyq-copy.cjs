/**
 * PYQ vs mock user-facing copy (no React Native).
 * Run from mobile/: node scripts/verify-pyq-copy.cjs
 */
const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

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

const pyq = loadModule('utils/previousYearPapers.js', [
  'TEST_KIND_PREVIOUS_YEAR',
  'isPreviousYearPaperSession',
]);

function run() {
  const testScreen = read('src/screens/TestScreen.js');
  const resultScreen = read('src/screens/ResultScreen.js');
  const hook = read('src/hooks/usePreviousYearPapers.js');
  const mockHook = read('src/hooks/useMockTests.js');
  const home = read('src/screens/HomeScreen.js');
  const battleResult = read('src/screens/BattleResultScreen.js');
  const flowNav = read('src/navigation/testFlowNavigation.js');

  assert.equal(pyq.TEST_KIND_PREVIOUS_YEAR, 'previous_year');
  assert.equal(pyq.isPreviousYearPaperSession({ kind: 'previous_year' }), true);
  assert.equal(pyq.isPreviousYearPaperSession({ kind: 'mock' }), false);
  assert.equal(pyq.isPreviousYearPaperSession({}), false);

  // PYQ start carries kind (no extra copy fetch)
  assert.match(hook, /kind:\s*TEST_KIND_PREVIOUS_YEAR/);
  assert.match(hook, /originMainTab/);

  // PYQ Result wording
  assert.match(resultScreen, /Previous Year Paper complete/);
  assert.match(resultScreen, /isPreviousYearPaperSession\(\{\s*kind:\s*resultKind\s*\}\)/);

  // PYQ leave dialog
  assert.match(
    testScreen,
    /resume later from Previous Year Papers/
  );
  assert.match(testScreen, /isPreviousYearPaperSession\(\{\s*kind:\s*params\.kind\s*\}\)/);

  // Mock Test wording preserved
  assert.match(resultScreen, /Mock test complete/);
  assert.match(testScreen, /resume later from Mock tests/);
  assert.match(mockHook, /originMainTab:\s*['"]Tests['"]/);
  assert.doesNotMatch(mockHook, /TEST_KIND_PREVIOUS_YEAR/);

  // Daily Practice copy remains
  assert.match(resultScreen, /Daily practice complete/);
  assert.match(home, /mode:\s*['"]daily['"]/);
  assert.match(testScreen, /Leave session\?/);

  // BattleResult unchanged for this copy
  assert.doesNotMatch(battleResult, /Previous Year Paper complete/);
  assert.doesNotMatch(battleResult, /Mock test complete/);
  assert.match(testScreen, /name:\s*['"]BattleResult['"]/);

  // Navigation origin helpers still present (this task does not rewrite them)
  assert.match(flowNav, /resolveTimedTestOriginMainTab/);
  assert.match(testScreen, /resolveTimedTestOriginMainTab\(originMainTab\)/);
  assert.match(hook, /resolvePyqOriginMainTab\(route\?\.name\)/);

  // Rank eligibility unchanged
  assert.match(
    resultScreen,
    /showPersonalRankCard\s*=\s*isMock && !isRetry && \(rankStatus === 'loading' \|\| rankStatus === 'ready'\)/
  );
  assert.match(
    resultScreen,
    /useMockPersonalRank\(\{\s*testId,\s*isRetry,\s*sessionType,/
  );

  // Streak chip unchanged
  assert.match(
    resultScreen,
    /!isHistoricalAttempt && !isRetry && returnMainTab === MAIN_TABS\.HOME && streakCount > 0/
  );

  console.log('verify-pyq-copy: all checks passed');
}

run();
