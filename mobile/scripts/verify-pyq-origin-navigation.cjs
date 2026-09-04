/**
 * PYQ origin-tab navigation (no React Native).
 * Run from mobile/: node scripts/verify-pyq-origin-navigation.cjs
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

function loadModule(rel, exportNames, { rewrite } = {}) {
  const filename = path.join(SRC, rel);
  let source = fs.readFileSync(filename, 'utf8');
  if (rewrite) source = rewrite(source);
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
  'PYQ_ROUTE_PAPERS_TAB',
  'PYQ_ROUTE_HOME',
  'resolvePyqOriginMainTab',
]);

const nav = loadModule(
  'navigation/testFlowNavigation.js',
  [
    'MAIN_TABS',
    'resolveTimedTestOriginMainTab',
    'buildMainReturnRoute',
    'resolveResultBackTarget',
    'resolveRetryOriginMainTab',
  ],
  {
    rewrite: (source) =>
      source.replace(
        /import \{ logNavigationPayload \} from '\.\.\/utils\/navigationPayloadStore';/,
        'function logNavigationPayload() {}'
      ),
  }
);

function run() {
  const hook = read('src/hooks/usePreviousYearPapers.js');
  const testScreen = read('src/screens/TestScreen.js');
  const resultScreen = read('src/screens/ResultScreen.js');
  const home = read('src/screens/HomeScreen.js');
  const mockHook = read('src/hooks/useMockTests.js');
  const battleLobby = read('src/screens/BattleLobbyScreen.js');
  const appNav = read('src/navigation/AppNavigator.js');
  const flowNav = read('src/navigation/testFlowNavigation.js');

  // 1. PreviousYearPapersScreen / hook can pass an origin from route context
  assert.match(hook, /useRoute\(\)/);
  assert.match(hook, /resolvePyqOriginMainTab\(route\?\.name\)/);
  assert.match(hook, /originMainTab,/);
  assert.doesNotMatch(hook, /originMainTab:\s*['"]Home['"]/);
  assert.doesNotMatch(hook, /kind:\s*TEST_KIND_PREVIOUS_YEAR[\s\S]*originMainTab:\s*['"]Home['"]/);

  // 2–3. Origin is the navigator that mounted the screen, not test.kind
  assert.equal(pyq.PYQ_ROUTE_PAPERS_TAB, 'PapersMain');
  assert.equal(pyq.PYQ_ROUTE_HOME, 'PreviousYearPapers');
  assert.equal(pyq.resolvePyqOriginMainTab('PapersMain'), 'Papers');
  assert.equal(pyq.resolvePyqOriginMainTab('PreviousYearPapers'), 'Home');
  assert.equal(pyq.resolvePyqOriginMainTab(undefined), 'Home');
  assert.match(appNav, /name="PapersMain"/);
  assert.match(appNav, /name="PreviousYearPapers"/);

  // 4. TestScreen does not blindly overwrite a supplied origin with Tests
  assert.match(testScreen, /resolveTimedTestOriginMainTab\(originMainTab\)/);
  assert.doesNotMatch(testScreen, /originMainTab:\s*MAIN_TABS\.TESTS/);
  assert.doesNotMatch(
    testScreen,
    /navigation\.navigate\('Main',\s*\{\s*screen:\s*MAIN_TABS\.TESTS/
  );

  // 5. Mock fallback remains Tests; mocks still start with Tests origin
  assert.equal(nav.resolveTimedTestOriginMainTab(undefined), 'Tests');
  assert.equal(nav.resolveTimedTestOriginMainTab(null), 'Tests');
  assert.equal(nav.resolveTimedTestOriginMainTab('not-a-tab'), 'Tests');
  assert.equal(nav.resolveTimedTestOriginMainTab('Tests'), 'Tests');
  assert.equal(nav.resolveTimedTestOriginMainTab('Papers'), 'Papers');
  assert.equal(nav.resolveTimedTestOriginMainTab('Home'), 'Home');
  assert.match(mockHook, /originMainTab:\s*['"]Tests['"]/);

  // 6. Daily Practice remains Home
  assert.match(home, /mode:\s*['"]daily['"]/);
  assert.match(home, /originMainTab:\s*['"]Home['"]/);

  // 7. Battle navigation remains unchanged
  assert.match(battleLobby, /mode:\s*['"]battle['"]/);
  assert.match(battleLobby, /originMainTab:\s*MAIN_TABS\.HOME/);
  assert.match(testScreen, /practiceType === 'battle' && battleId/);
  assert.match(testScreen, /name:\s*['"]BattleResult['"]/);

  // 8. Result navigation preserves origin (returnMainTab + Papers back target)
  assert.match(flowNav, /returnMainTab:\s*tab/);
  assert.equal(nav.MAIN_TABS.PAPERS, 'Papers');
  assert.deepEqual(nav.buildMainReturnRoute('Papers'), {
    name: 'Main',
    params: { screen: 'Papers', params: { screen: 'PapersMain' } },
  });
  assert.deepEqual(nav.buildMainReturnRoute('Home'), {
    name: 'Main',
    params: { screen: 'Home', params: { screen: 'HomeMain' } },
  });
  assert.deepEqual(nav.buildMainReturnRoute('Tests'), {
    name: 'Main',
    params: { screen: 'Tests', params: { screen: 'TestsMain' } },
  });
  const papersBack = nav.resolveResultBackTarget({ returnMainTab: 'Papers' });
  assert.equal(papersBack.label, 'Back to Papers');
  assert.equal(papersBack.route.params.screen, 'Papers');
  const testsBack = nav.resolveResultBackTarget({ returnMainTab: 'Tests' });
  assert.equal(testsBack.label, 'Back to Tests');
  const homeBack = nav.resolveResultBackTarget({ returnMainTab: 'Home' });
  assert.equal(homeBack.label, 'Back to Home');
  const histBack = nav.resolveResultBackTarget({
    viewingHistoricalAttempt: true,
  });
  assert.equal(histBack.label, 'Back to Profile');
  assert.equal(
    nav.resolveRetryOriginMainTab({
      isHistoricalAttempt: true,
      testId: '64a0000000000000000000aa',
    }),
    'Profile'
  );
  assert.match(resultScreen, /resolveResultBackTarget\(params\)/);

  // 9. Rank UI eligibility unchanged
  assert.match(
    resultScreen,
    /useMockPersonalRank\(\{\s*testId,\s*isRetry,\s*sessionType,/
  );
  assert.match(
    resultScreen,
    /showPersonalRankCard\s*=\s*isMock && !isRetry && \(rankStatus === 'loading' \|\| rankStatus === 'ready'\)/
  );

  // 10. Streak chip logic unchanged
  assert.match(
    resultScreen,
    /showStreakChip\s*=\s*\n?\s*!isHistoricalAttempt && !isRetry && returnMainTab === MAIN_TABS\.HOME && streakCount > 0/
  );

  console.log('verify-pyq-origin-navigation: all checks passed');
}

run();
