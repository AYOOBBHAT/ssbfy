/**
 * Phase 8D — READ-ONLY production signing-path verification helper.
 *
 * Does not mint playback tokens, upload videos, SSH with secret printing,
 * create Cloudflare keys, or write Mongo.
 *
 * Run from backend/:
 *   node scripts/fixtures/set-a/verify-video-lecture-phase8d-signing-production.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolvePlaybackTtlSeconds,
  VIDEO_LECTURE_PLAYBACK_TTL_MAX_SECONDS,
  VIDEO_LECTURE_PLAYBACK_TTL_MIN_SECONDS,
} from '../../../src/constants/videoLecture.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(here, '..', '..', '..');
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
    map.set(s.slice(0, i).trim(), s.slice(i + 1).trim());
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

const selfSource = fs.readFileSync(new URL(import.meta.url), 'utf8');
const stream = readBackend('src/services/cloudflareStreamService.js');
const envPath = path.join(backendRoot, '.env');
const envMap = fs.existsSync(envPath)
  ? parseDotenvPresence(fs.readFileSync(envPath, 'utf8'))
  : new Map();

const idRaw = envMap.get('CLOUDFLARE_STREAM_SIGNING_KEY_ID') || '';
const pemRaw = envMap.get('CLOUDFLARE_STREAM_SIGNING_KEY_PEM') || '';
const workspace = {
  signingKeyId: {
    configured: Boolean(idRaw.trim()),
    complete: Boolean(idRaw.trim()),
  },
  signingKeyPem: {
    configured: Boolean(String(pemRaw).trim()),
    complete: pemLooksComplete(pemRaw),
  },
};

test('this verifier does not mint playback, create keys, or write Mongo', () => {
  assert.doesNotMatch(selfSource, /createSignedPlaybackToken\s*\(/);
  assert.doesNotMatch(selfSource, /\/video-lectures\/[^'\n]+\/playback/);
  assert.doesNotMatch(selfSource, /createDirectUploadUrl\s*\(/);
  assert.doesNotMatch(selfSource, /\/stream\/keys/);
  assert.doesNotMatch(selfSource, /mongoose\.connect\s*\(/);
  assert.doesNotMatch(selfSource, /MongoClient\s*\(/);
  assert.doesNotMatch(selfSource, /pm2\s+(?:restart|start|stop|delete)\b/);
  assert.doesNotMatch(selfSource, /\.syncIndexes\s*\(/);
});

test('Phase 8B RS256 path requires both vars; incomplete fails closed; /token only if both absent', () => {
  const mint = stream.slice(stream.indexOf('async createSignedPlaybackToken'));
  assert.match(mint, /signingConfigured/);
  assert.match(mint, /Boolean\(keyId \|\| pemRaw\)/);
  assert.match(mint, /if \(!keyId \|\| !pem\)/);
  assert.match(mint, /signing key is incomplete/);
  assert.match(mint, /algorithm:\s*'RS256'/);
  assert.match(mint, /\/stream\/\$\{encodeURIComponent\(uid\)\}\/token/);
  const rsAt = mint.indexOf("algorithm: 'RS256'");
  const incompleteAt = mint.indexOf('signing key is incomplete');
  const tokenAt = mint.indexOf('/token');
  assert.ok(rsAt >= 0 && incompleteAt >= 0 && tokenAt > incompleteAt);
});

test('Phase 8B TTL is clamp(duration+15m, 5m, 6h)', () => {
  assert.equal(VIDEO_LECTURE_PLAYBACK_TTL_MIN_SECONDS, 5 * 60);
  assert.equal(VIDEO_LECTURE_PLAYBACK_TTL_MAX_SECONDS, 6 * 3600);
  assert.equal(resolvePlaybackTtlSeconds(8), 8 + 15 * 60);
  assert.equal(resolvePlaybackTtlSeconds(8 * 3600), 6 * 3600);
});

test('mobile does not contain Cloudflare signing credentials', () => {
  const mobile = [
    readRepo('mobile/src/services/videoLectureService.js'),
    readRepo('mobile/src/screens/LecturePlayerScreen.js'),
    readRepo('mobile/app.json'),
  ].join('\n');
  assert.doesNotMatch(mobile, /CLOUDFLARE_STREAM_SIGNING_KEY/);
  assert.doesNotMatch(mobile, /CLOUDFLARE_STREAM_API_TOKEN/);
});

const health = await fetch('https://api.jkssbfy.in/health', {
  method: 'GET',
  signal: AbortSignal.timeout(15000),
});
const healthJson = await health.json().catch(() => ({}));

test('production API health responds without exposing secrets', () => {
  assert.equal(health.ok, true);
  assert.equal(healthJson.success, true);
  assert.equal(healthJson.status, 'ok');
  assert.equal(healthJson.environment, 'production');
  const blob = JSON.stringify(healthJson);
  assert.doesNotMatch(blob, /BEGIN [A-Z ]+PRIVATE KEY/);
  assert.doesNotMatch(blob, /CLOUDFLARE_STREAM/);
});

console.log(`\n${passed} checks passed`);
console.log(
  JSON.stringify({
    ok: true,
    mongoWrites: 0,
    cloudflareVideosCreated: 0,
    playbackTokensMinted: 0,
    signingKeysCreated: 0,
    lecturePlayed: false,
    productionEc2Inspected: false,
    pm2Inspected: false,
    workspaceSigningKeyPairComplete:
      workspace.signingKeyId.complete && workspace.signingKeyPem.complete,
    workspaceSigningKeyIdConfigured: workspace.signingKeyId.configured,
    workspaceSigningKeyPemConfigured: workspace.signingKeyPem.configured,
    health: {
      ok: health.ok === true,
      environment: healthJson.environment || null,
      uptimeSeconds:
        typeof healthJson.uptime === 'number' ? healthJson.uptime : null,
    },
  })
);
console.log('PHASE 8D SIGNING PRODUCTION VERIFIER: STATIC CHECKS PASS');
console.log(
  'PHASE 8D OVERALL: FAIL — production EC2 signing-key env was not inspected (no SSH)'
);
