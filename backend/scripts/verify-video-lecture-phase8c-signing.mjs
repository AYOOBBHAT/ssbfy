/**
 * Phase 8C — READ-ONLY Cloudflare Stream signing-key configuration audit.
 *
 * Static code contracts + presence-only env flags (yes/no). Never prints
 * secrets, PEMs, tokens, JWTs, or Account IDs. Does not mint playback tokens
 * or upload URLs. Does not create or rotate Cloudflare keys.
 *
 * Run: node scripts/verify-video-lecture-phase8c-signing.mjs
 *      npm run verify:phase8c-video-lecture-signing
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(here, '..');
const repoRoot = path.join(backendRoot, '..');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function readBackend(rel) {
  return fs.readFileSync(path.join(backendRoot, rel), 'utf8');
}

function readRepo(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function parseDotenvPresence(fileText) {
  const map = new Map();
  for (const line of String(fileText || '').split(/\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i <= 0) continue;
    const key = s.slice(0, i).trim();
    let value = s.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function pemLooksComplete(raw) {
  const input = String(raw || '').trim();
  if (!input) return false;
  let pem = input.replace(/\\n/g, '\n');
  if (!pem.includes('BEGIN')) {
    try {
      pem = Buffer.from(pem, 'base64').toString('utf8').trim();
    } catch {
      return false;
    }
  }
  return pem.includes('BEGIN');
}

function flag(map, name, { pem = false } = {}) {
  const presentInFile = map.has(name);
  const raw = presentInFile ? map.get(name) : '';
  const configured = Boolean(String(raw || '').trim());
  const complete = pem ? pemLooksComplete(raw) : configured;
  return { configured, complete };
}

const selfSource = fs.readFileSync(new URL(import.meta.url), 'utf8');
const stream = readBackend('src/services/cloudflareStreamService.js');
const envJs = readBackend('src/config/env.js');
const envExample = readBackend('.env.example');
const service = readBackend('src/services/videoLectureService.js');
const envPath = path.join(backendRoot, '.env');
const envFileExists = fs.existsSync(envPath);
const envMap = envFileExists ? parseDotenvPresence(fs.readFileSync(envPath, 'utf8')) : new Map();

const signingId = flag(envMap, 'CLOUDFLARE_STREAM_SIGNING_KEY_ID');
const signingPem = flag(envMap, 'CLOUDFLARE_STREAM_SIGNING_KEY_PEM', { pem: true });
const apiToken = flag(envMap, 'CLOUDFLARE_STREAM_API_TOKEN');
const accountId = flag(envMap, 'CLOUDFLARE_ACCOUNT_ID');
const webhookSecret = flag(envMap, 'CLOUDFLARE_STREAM_WEBHOOK_SECRET');

let workspacePlaybackPath = 'token-fallback';
if (signingId.configured || signingPem.configured) {
  workspacePlaybackPath =
    signingId.complete && signingPem.complete ? 'rs256' : 'fail-closed';
} else if (!apiToken.configured || !accountId.configured) {
  workspacePlaybackPath = 'token-fallback-but-stream-api-incomplete';
}

test('this verifier does not mint tokens, call Cloudflare writes, or write Mongo', () => {
  assert.doesNotMatch(selfSource, /createSignedPlaybackToken\s*\(/);
  assert.doesNotMatch(selfSource, /createDirectUploadUrl\s*\(/);
  assert.doesNotMatch(selfSource, /\/stream\/keys/);
  assert.doesNotMatch(selfSource, /mongoose\.connect\s*\(/);
  assert.doesNotMatch(selfSource, /MongoClient\s*\(/);
  assert.doesNotMatch(selfSource, /openDb\s*\(/);
  assert.doesNotMatch(selfSource, /\.syncIndexes\s*\(/);
});

test('Phase 8B requires both signing-key vars together and fails closed if incomplete', () => {
  assert.match(stream, /signingConfigured/);
  assert.match(stream, /Boolean\(keyId \|\| pemRaw\)/);
  assert.match(stream, /Cloudflare Stream signing key is incomplete/);
  assert.match(stream, /if \(!keyId \|\| !pem\)/);
  assert.match(stream, /algorithm:\s*'RS256'/);
});

test('/token fallback is only used when both signing-key variables are absent', () => {
  const mint = stream.slice(stream.indexOf('async createSignedPlaybackToken'));
  assert.match(mint, /signingConfigured/);
  assert.match(mint, /\/stream\/\$\{encodeURIComponent\(uid\)\}\/token/);
  const rsAt = mint.indexOf("algorithm: 'RS256'");
  const incompleteAt = mint.indexOf('signing key is incomplete');
  const tokenAt = mint.indexOf('/token');
  assert.ok(rsAt >= 0 && incompleteAt >= 0 && tokenAt > incompleteAt);
  assert.match(envExample, /BOTH are unset/);
});

test('signing credentials and Stream API token remain backend-only', () => {
  const mobile = [
    readRepo('mobile/src/services/videoLectureService.js'),
    readRepo('mobile/src/screens/LecturePlayerScreen.js'),
    readRepo('mobile/src/services/api.js'),
    readRepo('mobile/app.json'),
  ].join('\n');
  assert.doesNotMatch(mobile, /CLOUDFLARE_STREAM_SIGNING_KEY/);
  assert.doesNotMatch(mobile, /CLOUDFLARE_STREAM_API_TOKEN/);
  assert.doesNotMatch(mobile, /CLOUDFLARE_STREAM_WEBHOOK_SECRET/);
  assert.doesNotMatch(mobile, /CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(envJs, /EXPO_PUBLIC_CLOUDFLARE/);
  assert.doesNotMatch(envJs, /VITE_CLOUDFLARE/);
  assert.match(envJs, /cloudflareStreamSigningKeyId:/);
  assert.match(envJs, /cloudflareStreamSigningKeyPem:/);
  assert.match(envExample, /^CLOUDFLARE_STREAM_SIGNING_KEY_ID=\s*$/m);
  assert.match(envExample, /^CLOUDFLARE_STREAM_SIGNING_KEY_PEM=\s*$/m);
  assert.match(service, /createSignedPlaybackToken/);
});

test('package.json has verify:phase8c-video-lecture-signing', () => {
  const pkg = JSON.parse(readBackend('package.json'));
  assert.equal(
    pkg.scripts['verify:phase8c-video-lecture-signing'],
    'node scripts/verify-video-lecture-phase8c-signing.mjs'
  );
});

console.log(`\n${passed} checks passed`);
console.log(
  JSON.stringify({
    ok: true,
    mongoWrites: 0,
    cloudflareVideosCreated: 0,
    directUploadInvoked: false,
    playbackTokensMinted: 0,
    signingKeysCreated: 0,
    workspaceDotenv: {
      filePresent: envFileExists,
      signingKeyId: { configured: signingId.configured, complete: signingId.complete },
      signingKeyPem: { configured: signingPem.configured, complete: signingPem.complete },
      pairComplete: signingId.complete && signingPem.complete,
      playbackPath: workspacePlaybackPath,
      apiTokenConfigured: apiToken.configured,
      accountIdConfigured: accountId.configured,
      webhookSecretConfigured: webhookSecret.configured,
    },
  })
);
console.log('PHASE 8C CLOUDFLARE STREAM SIGNING AUDIT VERIFIER: PASS');
