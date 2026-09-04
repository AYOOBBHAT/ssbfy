/**
 * HomeScreen PYQ hero replacement checks (no React Native).
 * Run from mobile/: node scripts/verify-home-pyq-card.cjs
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function run() {
  const home = read('src/screens/HomeScreen.js');
  const nav = read('src/navigation/AppNavigator.js');

  // 1. Previous Year Papers is the Home hero
  assert.match(home, /heroTitle}>Previous Year Papers/);
  assert.match(home, /Practice with real previous-year questions/);
  assert.match(home, />Explore Papers</);
  assert.doesNotMatch(home, /Today&apos;s practice/);
  assert.doesNotMatch(home, /Start your streak/);
  assert.doesNotMatch(home, /streakCount/);

  // 2. Explore Papers opens the existing PreviousYearPapers route
  assert.match(home, /navigate\('PreviousYearPapers'\)/);
  const homeNavHits = home.match(/navigate\('PreviousYearPapers'\)/g) || [];
  assert.equal(homeNavHits.length, 1);

  // 10. No duplicate navigation route
  const routeHits = nav.match(/name="PreviousYearPapers"/g) || [];
  assert.equal(routeHits.length, 1);
  assert.doesNotMatch(nav, /name="PreviousYearPapersHome"/);
  assert.doesNotMatch(nav, /name="ExplorePapers"/);

  // 3 + 4. Daily Practice still startable from Home (same flow)
  assert.match(home, /handleStartDailyPractice/);
  assert.match(home, /getDailyPractice/);
  assert.match(home, /mode: 'daily'/);
  assert.match(home, /Daily Practice/);
  assert.match(home, /10 questions today/);
  assert.match(home, /dailyLoading \? 'Starting…' : 'Practice'/);
  assert.doesNotMatch(home, /Start daily practice/);

  // 5–9. Home presentation only — Profile streak still exists; public board retired
  assert.doesNotMatch(home, /claimDailyPracticeForToday/);
  const profile = read('src/screens/ProfileScreen.js');
  assert.match(profile, /streakCount|streak/i);
  const testsList = read('src/screens/TestsListScreen.js');
  assert.match(testsList, /useMockTests/);
  assert.doesNotMatch(testsList, /Previous Year Papers/);
  const battleCreate = read('src/screens/BattleCreateScreen.js');
  assert.ok(battleCreate.length > 0);

  console.log('verify-home-pyq-card: all checks passed');
}

run();
