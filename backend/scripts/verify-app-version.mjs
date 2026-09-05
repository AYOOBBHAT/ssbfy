/**
 * Android app version policy + public GET /api/app/version (no Mongo).
 *
 * Run: node scripts/verify-app-version.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANDROID_PACKAGE_ID,
  ANDROID_PLAY_STORE_URL,
  DEFAULT_ANDROID_FORCE_UPDATE,
  DEFAULT_ANDROID_LATEST_VERSION_CODE,
  DEFAULT_ANDROID_MINIMUM_VERSION_CODE,
  isOfficialAndroidPlayStoreUrl,
  resolveAndroidVersionPolicy,
} from '../src/constants/appVersion.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

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

test('official Play URL and package', () => {
  assert.equal(ANDROID_PACKAGE_ID, 'com.ayoobbhat.ssbfy');
  assert.equal(
    ANDROID_PLAY_STORE_URL,
    'https://play.google.com/store/apps/details?id=com.ayoobbhat.ssbfy'
  );
  assert.equal(isOfficialAndroidPlayStoreUrl(ANDROID_PLAY_STORE_URL), true);
  assert.equal(isOfficialAndroidPlayStoreUrl('https://evil.example/store'), false);
  assert.equal(
    isOfficialAndroidPlayStoreUrl(
      'https://play.google.com/store/apps/details?id=com.other.app'
    ),
    false
  );
  assert.equal(
    isOfficialAndroidPlayStoreUrl(
      'http://play.google.com/store/apps/details?id=com.ayoobbhat.ssbfy'
    ),
    false
  );
});

test('unset env uses safe defaults (does not force current store build)', () => {
  const p = resolveAndroidVersionPolicy({});
  assert.equal(p.minimumVersionCode, DEFAULT_ANDROID_MINIMUM_VERSION_CODE);
  assert.equal(p.latestVersionCode, DEFAULT_ANDROID_LATEST_VERSION_CODE);
  assert.equal(p.forceUpdate, DEFAULT_ANDROID_FORCE_UPDATE);
  assert.equal(p.minimumVersionCode, 1);
  assert.equal(p.forceUpdate, false);
  assert.equal(p.playStoreUrl, ANDROID_PLAY_STORE_URL);
});

test('explicit production-style policy', () => {
  const p = resolveAndroidVersionPolicy({
    ANDROID_MINIMUM_VERSION_CODE: '36',
    ANDROID_LATEST_VERSION_CODE: '36',
    ANDROID_FORCE_UPDATE: 'true',
  });
  assert.equal(p.minimumVersionCode, 36);
  assert.equal(p.latestVersionCode, 36);
  assert.equal(p.forceUpdate, true);
});

test('rejects non-positive and non-integer version codes', () => {
  expectThrow(
    () => resolveAndroidVersionPolicy({ ANDROID_MINIMUM_VERSION_CODE: '0' }),
    /positive integer/
  );
  expectThrow(
    () => resolveAndroidVersionPolicy({ ANDROID_LATEST_VERSION_CODE: '1.5' }),
    /positive integer/
  );
  expectThrow(
    () => resolveAndroidVersionPolicy({ ANDROID_MINIMUM_VERSION_CODE: 'nope' }),
    /positive integer/
  );
});

test('rejects minimum greater than latest', () => {
  expectThrow(
    () =>
      resolveAndroidVersionPolicy({
        ANDROID_MINIMUM_VERSION_CODE: '37',
        ANDROID_LATEST_VERSION_CODE: '36',
      }),
    /must not exceed/
  );
});

test('rejects invalid force flag', () => {
  expectThrow(
    () => resolveAndroidVersionPolicy({ ANDROID_FORCE_UPDATE: 'maybe' }),
    /true or false/
  );
});

test('route is public and health is unchanged', () => {
  const routes = readSrc('src/routes/index.js');
  assert.match(routes, /appVersionRoutes/);
  assert.match(routes, /router\.use\(appVersionRoutes\)/);
  assert.doesNotMatch(routes, /\/app\/version['"].*authenticate/);

  const appVersionRoutes = readSrc('src/routes/appVersionRoutes.js');
  assert.match(appVersionRoutes, /router\.get\('\/app\/version'/);
  assert.match(appVersionRoutes, /appVersionLimiter/);
  assert.doesNotMatch(appVersionRoutes, /adminChain|authenticate|requireRole/);

  const health = readSrc('src/routes/healthRoutes.js');
  assert.match(health, /status: 'ok'/);
  assert.doesNotMatch(health, /minimumVersionCode/);
  assert.doesNotMatch(health, /app\/version/);

  const appJs = readSrc('src/app.js');
  assert.match(appJs, /app\.get\('\/health', healthHandler\)/);
});

test('policy is not stored in Mongo and Play URL is not request-driven', () => {
  const service = readSrc('src/services/appVersionService.js');
  assert.doesNotMatch(service, /mongoose|findOne|insertMany/);
  const controller = readSrc('src/controllers/appVersionController.js');
  assert.doesNotMatch(controller, /req\.body|req\.query/);
  const constants = readSrc('src/constants/appVersion.js');
  assert.match(constants, /ANDROID_PLAY_STORE_URL/);
});

test('no request-reject middleware for missing version headers', () => {
  const auth = readSrc('src/middlewares/auth.js');
  assert.doesNotMatch(auth, /X-App-Version|versionCode/);
  const index = readSrc('src/routes/index.js');
  assert.doesNotMatch(index, /X-App-VersionCode/);
});

console.log(`\n${passed} checks passed`);
