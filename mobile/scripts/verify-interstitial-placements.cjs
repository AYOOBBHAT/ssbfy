/**
 * Interstitial placement / cooldown / premium-safety checks (no React Native).
 * Run from mobile/: node scripts/verify-interstitial-placements.cjs
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

function loadModule(rel, exportNames, preamble = '') {
  const filename = path.join(SRC, rel);
  const source = fs.readFileSync(filename, 'utf8');
  const cjs = `${preamble}
${source
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
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

const cooldown = loadModule('services/ads/interstitialOrchestrator.js', [
  'INTERSTITIAL_COOLDOWN_MS',
  'INTERSTITIAL_COOLDOWN_MIN_MS',
  'INTERSTITIAL_COOLDOWN_MAX_MS',
  'clampInterstitialCooldownMs',
]);

function countCalls(src, name) {
  return (src.match(new RegExp(`${name}\\(`, 'g')) || []).length;
}

function run() {
  const mockHook = read('src/hooks/useMockTests.js');
  const pyqHook = read('src/hooks/usePreviousYearPapers.js');
  const home = read('src/screens/HomeScreen.js');
  const testScreen = read('src/screens/TestScreen.js');
  const orchestrator = read('src/services/ads/interstitialOrchestrator.js');
  const service = read('src/services/ads/interstitialAdService.js');
  const adsReady = read('src/services/ads/AdsReadyProvider.js');
  const banner = read('src/components/ads/AppBannerAd.js');
  const login = read('src/screens/LoginScreen.js');
  const premium = read('src/screens/PremiumScreen.js');
  const profile = read('src/screens/ProfileScreen.js');
  const app = read('App.js');
  const battleCreate = read('src/screens/BattleCreateScreen.js');
  const battleJoin = read('src/screens/BattleJoinScreen.js');
  const battleLobby = read('src/screens/BattleLobbyScreen.js');
  const battleResult = read('src/screens/BattleResultScreen.js');
  const pdfList = read('src/screens/PdfListScreen.js');
  const saved = read('src/screens/SavedMaterialsScreen.js');
  const result = read('src/screens/ResultScreen.js');
  const admob = read('src/config/admob.js');

  // 1. Mock start → interstitial after successful start/resume, before Test
  assert.match(orchestrator, /showBeforeMockStart/);
  assert.match(orchestrator, /before_mock_start/);
  assert.match(mockHook, /await showBeforeMockStart\(\{\s*user\s*\}\)/);
  assert.equal(countCalls(mockHook, 'showBeforeMockStart'), 1);
  assert.match(
    mockHook,
    /if \(!data\.attempt\)[\s\S]*showBeforeMockStart[\s\S]*navigation\.navigate\('Test'/s
  );
  assert.match(mockHook, /ads must never block test navigation/);

  // 2. PYQ start → interstitial (same boundary as mock start)
  assert.match(orchestrator, /showBeforePyqStart/);
  assert.match(orchestrator, /before_pyq_start/);
  assert.match(pyqHook, /await showBeforePyqStart\(\{\s*user\s*\}\)/);
  assert.equal(countCalls(pyqHook, 'showBeforePyqStart'), 1);
  assert.match(
    pyqHook,
    /if \(!data\.attempt\)[\s\S]*showBeforePyqStart[\s\S]*navigation\.navigate\('Test'/s
  );
  assert.match(pyqHook, /ads must never block test navigation/);

  // 3. Mock / PYQ completion → interstitial after successful submit, before Result
  assert.match(testScreen, /showAfterMockFinish\(\{\s*user\s*\}\)/);
  assert.equal(countCalls(testScreen, 'showAfterMockFinish'), 2);
  assert.match(testScreen, /await showAfterMockFinish[\s\S]*navigateToResult/s);
  assert.match(testScreen, /ads must never block result navigation/);

  // 4. Battle start → interstitial after successful startBattleAttempt, before Test
  assert.match(orchestrator, /showBeforeBattleStart/);
  assert.match(orchestrator, /before_battle_start/);
  assert.match(battleLobby, /await showBeforeBattleStart\(\{\s*user\s*\}\)/);
  assert.equal(countCalls(battleLobby, 'showBeforeBattleStart'), 1);
  assert.match(
    battleLobby,
    /startBattleAttempt\(battleId\)[\s\S]*if \(!practiceSessionId \|\| !questionIds\.length\)[\s\S]*showBeforeBattleStart[\s\S]*navigation\.navigate\('Test'/s
  );
  assert.match(battleLobby, /ads must never block battle navigation/);

  // Battle lobby waiting / invite / completed-result view do not show ads
  assert.doesNotMatch(battleLobby, /showAfterBattleFinish|showBeforePdf|showAfterMockFinish/);
  assert.doesNotMatch(
    battleLobby,
    /handleViewResult[\s\S]*showBefore|showAfter[\s\S]*handleViewResult/
  );

  // 5. Battle completion → interstitial after successful reveal, before Battle Result
  assert.match(orchestrator, /showAfterBattleFinish/);
  assert.match(orchestrator, /after_battle_finish/);
  assert.match(testScreen, /await showAfterBattleFinish\(\{\s*user\s*\}\)/);
  assert.equal(countCalls(testScreen, 'showAfterBattleFinish'), 1);
  assert.match(
    testScreen,
    /practiceType === 'battle' && isBattle && battleId[\s\S]*showAfterBattleFinish[\s\S]*name: 'BattleResult'/s
  );

  // 6. Daily: completion only — no start ad
  assert.doesNotMatch(home, /showBeforeDailyPractice|interstitialOrchestrator|showBeforeMockStart/);
  assert.match(testScreen, /showAfterDailyPractice\(\{\s*user\s*\}\)/);
  assert.equal(countCalls(testScreen, 'showAfterDailyPractice'), 1);
  assert.doesNotMatch(orchestrator, /showBeforeDailyPractice|before_daily_practice/);
  assert.match(testScreen, /practiceType === 'daily'/);

  // 7. PDF still uses shared orchestrator
  assert.match(pdfList, /showBeforePdf\(\{\s*user\s*\}\)/);
  assert.match(saved, /showBeforePdf\(\{\s*user\s*\}\)/);
  assert.match(result, /showBeforePdf\(\{\s*user\s*\}\)/);
  assert.match(orchestrator, /showBeforePdf/);
  assert.match(orchestrator, /before_pdf/);

  // 8. No interstitial during Test / Battle question answering
  assert.doesNotMatch(testScreen, /showBeforeMockStart|showBeforePyqStart|showBeforeBattleStart|showBeforeDailyPractice/);
  assert.match(testScreen, /await showAfterMockFinish/);
  assert.match(testScreen, /await showAfterDailyPractice/);
  assert.match(testScreen, /await showAfterBattleFinish/);

  // 9. No interstitial on Battle create / join / result view, Login, Premium, Update Required, Profile, Home nav
  for (const src of [battleCreate, battleJoin, battleResult]) {
    assert.doesNotMatch(
      src,
      /interstitialOrchestrator|showAfterMockFinish|showBeforePdf|showBeforeBattleStart|showAfterBattleFinish/
    );
  }
  assert.doesNotMatch(login, /interstitialOrchestrator|AppOpenAd|RewardedAd/);
  assert.doesNotMatch(premium, /interstitialOrchestrator|AppOpenAd|RewardedAd/);
  assert.doesNotMatch(profile, /interstitialOrchestrator|showBefore|showAfter/);
  assert.doesNotMatch(app, /AppOpenAd|RewardedAd|showAfterMockFinish|showBeforeMockStart|interstitialOrchestrator/);
  assert.match(app, /useAppVersionGate/);

  // 10. Premium users never show ads — checked before every placement
  assert.match(orchestrator, /userHasPremiumAccess\(user\)/);
  assert.match(
    orchestrator,
    /async function runPlacement[\s\S]*if \(userHasPremiumAccess\(user\)\)[\s\S]*return 'skipped_premium'/s
  );
  assert.match(service, /userHasPremiumAccess\(premiumUserRef\)/);
  assert.match(service, /interstitial_skipped_premium/);

  // 11. Cooldown remains 45s and is not bypassed per placement
  assert.equal(cooldown.INTERSTITIAL_COOLDOWN_MIN_MS, 45_000);
  assert.equal(cooldown.INTERSTITIAL_COOLDOWN_MAX_MS, 90_000);
  assert.equal(cooldown.INTERSTITIAL_COOLDOWN_MS, 45_000);
  assert.equal(cooldown.clampInterstitialCooldownMs(10_000), 45_000);
  assert.equal(cooldown.clampInterstitialCooldownMs(120_000), 90_000);
  assert.equal(cooldown.clampInterstitialCooldownMs(60_000), 60_000);
  assert.equal(cooldown.clampInterstitialCooldownMs('nope'), 45_000);
  assert.match(orchestrator, /if \(remaining > 0\)[\s\S]*return 'skipped_cooldown'/s);
  assert.doesNotMatch(orchestrator, /bypass.*cooldown|cooldown.*=\s*0/i);

  // 12. Cooldown starts only when the interstitial actually OPENED
  assert.match(orchestrator, /onOpened:\s*\(\)\s*=>\s*\{[\s\S]*lastShownAtMs = Date\.now\(\)/);
  assert.match(
    orchestrator,
    /Skipped \/ failed shows do not start cooldown|starts only after open/
  );

  // 13. Fail-open / 4s ready wait / 15s close watchdog
  assert.match(service, /DEFAULT_CLOSE_WATCHDOG_MS = 15_000/);
  assert.match(service, /DEFAULT_READY_TIMEOUT_MS = 4000/);
  assert.match(orchestrator, /INTERSTITIAL_READY_TIMEOUT_MS = 4000/);
  assert.match(orchestrator, /INTERSTITIAL_CLOSE_WATCHDOG_MS = 15_000/);
  assert.match(service, /interstitial_close_watchdog/);
  assert.match(orchestrator, /never throws/);
  assert.match(service, /Never throws/);

  // 14. Session cap of 24 remains
  assert.match(service, /MAX_SESSION_SHOWS = 24/);

  // 15. Logout cannot leak a cached free-user ad
  assert.match(service, /interstitial_discarded_logout/);
  assert.match(service, /if \(!user\) \{\s*discardLoadedAd\(\)/);
  assert.match(adsReady, /onPremiumStatusChanged\(user\)/);

  // 16. No double show — single-flight + showing guard
  assert.match(orchestrator, /if \(inFlight\)/);
  assert.match(service, /if \(showing\)/);

  // 17. Production interstitial ID remains the Interstitial unit
  assert.match(admob, /mockTestInterstitial: 'ca-app-pub-7420252276948628\/3642433314'/);
  assert.doesNotMatch(admob, /3197743041/);
  assert.match(admob, /homeBanner: 'ca-app-pub-7420252276948628\/8115027800'/);
  assert.match(admob, /profileBanner: 'ca-app-pub-7420252276948628\/6721366723'/);
  assert.match(admob, /notesBanner: 'ca-app-pub-7420252276948628\/6223361636'/);

  // 18. No App Open / Rewarded; banners unchanged
  assert.doesNotMatch(admob, /AppOpenAd|RewardedAd/);
  assert.match(banner, /BannerAd/);
  assert.doesNotMatch(banner, /InterstitialAd|AppOpenAd|RewardedAd/);

  // Dead frequency-3 path remains removed
  assert.ok(!fs.existsSync(path.join(SRC, 'services/ads/mockTestAdCounter.js')));
  assert.doesNotMatch(testScreen, /incrementStandardMockCompletion|mockTestAdCounter/);

  console.log('verify-interstitial-placements: ok');
}

run();
