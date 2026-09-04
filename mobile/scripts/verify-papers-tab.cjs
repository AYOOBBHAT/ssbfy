/**
 * Papers tab replaces public streak Leaderboard in bottom navigation.
 * Run from mobile/: node scripts/verify-papers-tab.cjs
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function run() {
  const nav = read('src/navigation/AppNavigator.js');
  const home = read('src/screens/HomeScreen.js');
  const daily = read('src/services/dailyPracticeService.js');

  assert.match(nav, /name="Papers"/);
  assert.match(nav, /tabBarLabel: 'Papers'/);
  assert.match(nav, /Papers: 'document-text-outline'/);
  assert.match(nav, /function PapersStackNavigator/);
  assert.match(nav, /name="PapersMain"/);
  assert.match(nav, /PapersStack\.Screen[\s\S]*component=\{PreviousYearPapersScreen\}/);

  assert.doesNotMatch(nav, /LeaderboardScreen/);
  assert.doesNotMatch(nav, /LeaderboardStackNavigator/);
  assert.doesNotMatch(nav, /name="Leaderboard"/);
  assert.doesNotMatch(nav, /name="LeaderboardMain"/);
  assert.doesNotMatch(nav, /tabBarLabel: 'Leaderboard'/);

  assert.match(nav, /name="PreviousYearPapers"/);
  assert.match(nav, /HomeStack\.Screen[\s\S]*name="PreviousYearPapers"[\s\S]*PreviousYearPapersScreen/);
  const homeRouteHits = nav.match(/name="PreviousYearPapers"/g) || [];
  assert.equal(homeRouteHits.length, 1);

  assert.match(home, /navigate\('PreviousYearPapers'\)/);
  assert.match(home, /Previous Year Papers/);
  assert.match(home, /Daily Practice/);
  assert.match(home, /getDailyPractice/);
  assert.match(home, /mode: 'daily'/);

  assert.match(daily, /export async function getDailyPractice/);
  assert.match(daily, /export async function completeDailyPractice/);
  assert.match(daily, /\/daily-practice\/complete/);

  assert.match(nav, /name="BattleCreate"/);
  assert.match(nav, /name="Tests"/);
  assert.match(nav, /component=\{TestsStackNavigator\}/);
  assert.match(nav, /name="Profile"/);
  assert.match(nav, /component=\{ProfileStackNavigator\}/);

  assert.equal(fs.existsSync(path.join(ROOT, 'src/screens/LeaderboardScreen.js')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'src/services/leaderboardService.js')), false);

  console.log('verify-papers-tab: all checks passed');
}

run();
