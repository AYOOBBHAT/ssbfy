/**
 * Fourth bottom tab is Video Lectures; Previous Year Papers stays on Home.
 * Public streak Leaderboard remains retired.
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
  const profile = read('src/screens/ProfileScreen.js');
  const daily = read('src/services/dailyPracticeService.js');

  assert.doesNotMatch(nav, /name="Papers"/);
  assert.doesNotMatch(nav, /tabBarLabel: 'Papers'/);
  assert.doesNotMatch(nav, /function PapersStackNavigator/);
  assert.doesNotMatch(nav, /name="PapersMain"/);
  assert.match(nav, /name="VideoLecturesTab"/);
  assert.match(nav, /tabBarLabel: 'Video Lectures'/);
  assert.match(nav, /VideoLecturesTab: 'play-circle-outline'/);
  assert.match(nav, /function VideoLecturesStackNavigator/);
  assert.match(nav, /name="VideoLecturesMain"/);
  assert.match(nav, /VideoLecturesStack\.Screen[\s\S]*component=\{VideoLecturesScreen\}/);
  assert.match(nav, /name="LecturePlayer"/);
  assert.doesNotMatch(nav, /name="VideoLectures"/);

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
  assert.doesNotMatch(home, /navigate\('VideoLectures'\)/);
  assert.match(
    profile,
    /navigate\('Main',\s*\{\s*screen:\s*'VideoLecturesTab'\s*\}\)/
  );
  assert.doesNotMatch(profile, /navigate\('VideoLectures'\)/);

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
