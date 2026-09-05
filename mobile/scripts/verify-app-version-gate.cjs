/**
 * Forced-update gate (no React Native runtime).
 * Run from mobile/: node scripts/verify-app-version-gate.cjs
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
    .replace(/import\s+\{[\s\S]*?\}\s+from\s+['"][^'"]+['"];?/g, '')
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

const constants = loadModule('constants/appVersion.js', [
  'ANDROID_PACKAGE_ID',
  'PLAY_STORE_URL',
  'UPDATE_REQUIRED_TITLE',
  'UPDATE_REQUIRED_MESSAGE',
  'UPDATE_NOW_LABEL',
]);

const policy = loadModule(
  'utils/appVersionPolicy.js',
  [
    'parseVersionCode',
    'isOfficialPlayStoreUrl',
    'resolvePlayStoreUrl',
    'parseAndroidPolicy',
    'shouldForceAndroidUpdate',
  ],
  `const ANDROID_PACKAGE_ID = ${JSON.stringify(constants.ANDROID_PACKAGE_ID)};
const PLAY_STORE_URL = ${JSON.stringify(constants.PLAY_STORE_URL)};`
);

function axiosBody(android) {
  return { success: true, data: { android } };
}

function run() {
  assert.equal(constants.ANDROID_PACKAGE_ID, 'com.ayoobbhat.ssbfy');
  assert.equal(
    constants.PLAY_STORE_URL,
    'https://play.google.com/store/apps/details?id=com.ayoobbhat.ssbfy'
  );
  assert.equal(constants.UPDATE_REQUIRED_TITLE, 'Update Required');
  assert.match(constants.UPDATE_REQUIRED_MESSAGE, /Google Play/);
  assert.equal(constants.UPDATE_NOW_LABEL, 'Update Now');

  // 1. installed 36 + minimum 36 → normal
  assert.equal(
    policy.shouldForceAndroidUpdate(
      36,
      policy.parseAndroidPolicy(
        axiosBody({
          minimumVersionCode: 36,
          latestVersionCode: 36,
          forceUpdate: true,
          playStoreUrl: constants.PLAY_STORE_URL,
        })
      )
    ),
    false
  );

  // 2. installed 36 + minimum 37 → Update Required
  assert.equal(
    policy.shouldForceAndroidUpdate(
      36,
      policy.parseAndroidPolicy(
        axiosBody({
          minimumVersionCode: 37,
          latestVersionCode: 37,
          forceUpdate: true,
        })
      )
    ),
    true
  );

  // 3. forceUpdate false → normal even if below minimum
  assert.equal(
    policy.shouldForceAndroidUpdate(
      36,
      policy.parseAndroidPolicy(
        axiosBody({
          minimumVersionCode: 37,
          latestVersionCode: 37,
          forceUpdate: false,
        })
      )
    ),
    false
  );

  // 4. malformed → null policy → fail open
  assert.equal(policy.parseAndroidPolicy(null), null);
  assert.equal(policy.parseAndroidPolicy({ success: true, data: {} }), null);
  assert.equal(
    policy.parseAndroidPolicy(
      axiosBody({
        minimumVersionCode: 'x',
        latestVersionCode: 36,
        forceUpdate: true,
      })
    ),
    null
  );
  assert.equal(
    policy.parseAndroidPolicy(
      axiosBody({
        minimumVersionCode: 37,
        latestVersionCode: 36,
        forceUpdate: true,
      })
    ),
    null
  );
  assert.equal(policy.shouldForceAndroidUpdate(36, null), false);

  // 5–7. 500 / timeout / offline are catch paths (no valid policy) → fail open
  assert.equal(policy.shouldForceAndroidUpdate(36, undefined), false);

  // 8. Update Now uses official Play URL; untrusted backend URL is ignored
  assert.equal(
    policy.resolvePlayStoreUrl('https://evil.example/update'),
    constants.PLAY_STORE_URL
  );
  assert.equal(
    policy.resolvePlayStoreUrl(
      'https://play.google.com/store/apps/details?id=com.ayoobbhat.ssbfy'
    ),
    constants.PLAY_STORE_URL
  );
  assert.equal(policy.isOfficialPlayStoreUrl('https://play.google.com/store'), false);

  const ui = read('src/components/UpdateRequiredScreen.js');
  assert.match(ui, /Linking\.openURL\(PLAY_STORE_URL\)/);
  assert.match(ui, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(ui, /UPDATE_REQUIRED_TITLE/);
  assert.match(ui, /UPDATE_NOW_LABEL/);

  // 9. Android back cannot bypass
  assert.match(ui, /hardwareBackPress', \(\) => true/);

  const app = read('App.js');
  assert.match(app, /useAppVersionGate/);
  assert.match(app, /UpdateRequiredScreen/);
  assert.match(app, /updateRequired \?/);
  assert.doesNotMatch(app, /name=["']UpdateRequired["']/);

  // Gate is outside AppNavigator
  const nav = read('src/navigation/AppNavigator.js');
  assert.doesNotMatch(nav, /useAppVersionGate|UpdateRequiredScreen/);

  // 10. AuthProvider / Login / Google unchanged; auth still wraps bootstrap
  assert.match(app, /<AuthProvider>/);
  const auth = read('src/context/AuthContext.js');
  assert.doesNotMatch(auth, /app\/version|useAppVersionGate/);
  const login = read('src/screens/LoginScreen.js');
  assert.doesNotMatch(login, /useAppVersionGate|UpdateRequired/);

  // 11. Deep-link config unchanged when update is not required
  assert.match(app, /path: 'battle\/:inviteCode'/);
  assert.match(app, /https:\/\/api\.jkssbfy\.in/);
  assert.match(app, /linking=\{linking\}/);
  assert.match(app, /versionChecking \? null/);

  const api = read('src/services/api.js');
  assert.doesNotMatch(api, /X-App-Version|versionCode/);

  const installed = read('src/utils/installedAppVersion.js');
  assert.match(installed, /Application\.nativeBuildVersion/);
  assert.match(installed, /Constants\.expoConfig\?\.android\?\.versionCode/);
  assert.doesNotMatch(installed, /AsyncStorage\./);

  const hook = read('src/hooks/useAppVersionGate.js');
  assert.match(hook, /Platform\.OS !== 'android'/);
  assert.match(hook, /setUpdateRequired\(false\)/);
  assert.doesNotMatch(hook, /AsyncStorage/);

  console.log('verify-app-version-gate: ok');
}

run();
