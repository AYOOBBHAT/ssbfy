/**
 * Google-sub uniqueness: email/password users omit `sub`; unique index is
 * partial `$type: 'string'` (not sparse). No Mongo connection.
 *
 * Run: node scripts/verify-google-sub-uniqueness.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.join(root, '..');

function read(rel, fromRepo = false) {
  return fs.readFileSync(path.join(fromRepo ? repo : root, rel), 'utf8');
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

const userModel = read('src/models/User.js');
const authService = read('src/services/authService.js');
const googleAuth = read('src/services/googleAuthService.js');
const userRepo = read('src/repositories/userRepository.js');
const buildIndexes = read('scripts/build-indexes.mjs');
const errorHandler = read('src/middlewares/errorHandler.js');
const mobileSignup = read('mobile/src/screens/SignupScreen.js', true);
const mobileAuth = read('mobile/src/services/authService.js', true);

test('email unique:true is unchanged', () => {
  assert.match(userModel, /email:\s*\{[\s\S]*?unique:\s*true/s);
});

test('google.sub has no default null', () => {
  const googleBlock = userModel.match(/google:\s*\{[\s\S]*?linkedAt:[\s\S]*?\}/);
  assert.ok(googleBlock, 'google provider block');
  assert.doesNotMatch(googleBlock[0], /sub:\s*\{[^}]*default:\s*null/);
});

test('partial unique index uses $type string, not sparse', () => {
  assert.match(userModel, /name:\s*'uniq_authProviders_google_sub'/);
  assert.match(
    userModel,
    /partialFilterExpression:\s*\{\s*'authProviders\.google\.sub':\s*\{\s*\$type:\s*'string'\s*\}/
  );
  assert.match(userModel, /unique:\s*true/);
  const indexCall = userModel.match(
    /userSchema\.index\(\s*\{\s*'authProviders\.google\.sub':\s*1\s*\}[\s\S]*?\);/
  );
  assert.ok(indexCall, 'google.sub schema.index');
  assert.doesNotMatch(indexCall[0], /sparse:\s*true/);
  assert.doesNotMatch(indexCall[0], /\$exists|\$ne/);
});

test('signup omits google.sub and maps email E11000', () => {
  assert.match(authService, /userRepository\.create\(\{[\s\S]*role:\s*ROLES\.USER/);
  assert.doesNotMatch(
    authService,
    /create\(\{[\s\S]*authProviders[\s\S]*ROLES\.USER/
  );
  assert.match(authService, /Email already registered/);
  assert.match(authService, /err\?\.code === 11000/);
});

test('Google create/link still writes a real sub', () => {
  assert.match(userRepo, /createGoogleUser/);
  assert.match(
    userRepo,
    /authProviders:\s*\{\s*google:\s*\{\s*sub,/
  );
  assert.match(userRepo, /'authProviders\.google\.sub':\s*sub/);
  assert.match(googleAuth, /findByGoogleSub\(sub\)/);
  assert.match(googleAuth, /createGoogleUser/);
  assert.match(googleAuth, /linkGoogleSafely|linkGoogleProvider/);
  assert.match(googleAuth, /isDuplicateKeyError/);
});

test('build-indexes does not syncIndexes or drop', () => {
  assert.match(buildIndexes, /Does NOT call `syncIndexes\(\)`/);
  assert.match(buildIndexes, /await model\.createIndexes\(CREATE_OPTIONS\)/);
  assert.doesNotMatch(buildIndexes, /await .*\.syncIndexes\(/);
  assert.doesNotMatch(buildIndexes, /await .*\.dropIndex/);
});

test('generic Duplicate value mapper still exists; signup maps first', () => {
  assert.match(errorHandler, /message:\s*'Duplicate value'/);
  assert.match(authService, /Could not create this account/);
});

test('mobile signup payload is name, email, password only', () => {
  assert.match(
    mobileSignup,
    /signup\(\{\s*name:\s*name\.trim\(\),\s*email:\s*email\.trim\(\),\s*password,/
  );
  assert.match(
    mobileAuth,
    /api\.post\('\/auth\/signup',\s*\{\s*name,\s*email,\s*password\s*\}/
  );
  assert.doesNotMatch(mobileAuth, /googleId|google\.sub|idToken.*signup/);
});

console.log(`verify-google-sub-uniqueness: ${passed} checks passed`);
