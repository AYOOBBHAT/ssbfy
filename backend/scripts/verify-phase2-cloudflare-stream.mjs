/**
 * Phase 2 Cloudflare Stream setup verifier (no Mongo writes, no Stream mutations).
 *
 * Run: node scripts/verify-phase2-cloudflare-stream.mjs
 *      npm run verify:phase2-cloudflare-stream
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(here, '..');
const repoRoot = path.join(backendRoot, '..');

const MD_REL = 'scripts/fixtures/video-lectures/PHASE2_CLOUDFLARE_STREAM_SETUP_REPORT.md';
const JSON_REL = 'scripts/fixtures/video-lectures/PHASE2_CLOUDFLARE_STREAM_SETUP_REPORT.json';

const REQUIRED_MD_HEADINGS = [
  '# Phase 2 — Cloudflare Stream Setup',
  '## Cloudflare Account',
  '## API Configuration',
  '## Token Permissions',
  '## Backend Integration',
  '## Connectivity Test',
  '## Direct Upload Capability',
  '## Webhook Preparation',
  '## Signed Playback Preparation',
  '## Local Environment',
  '## Production Environment',
  '## Cloudflare Resource Counts',
  '## MongoDB Changes',
  '## Security',
  '## Issues',
  '## Phase 3 Readiness',
];

const REQUIRED_JSON_KEYS = [
  'accountConfigured',
  'tokenConfigured',
  'connectivity',
  'directUploadCapability',
  'webhookReadyForFuturePhase',
  'signedPlaybackReadyForFuturePhase',
  'mongoWrites',
  'cloudflareVideosCreated',
  'productionConfigured',
  'phase3Ready',
];

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function readBackend(rel) {
  return fs.readFileSync(path.join(backendRoot, rel), 'utf8');
}

function walkFiles(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist') {
      continue;
    }
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

test('phase 2 report files exist', () => {
  assert.equal(fs.existsSync(path.join(backendRoot, MD_REL)), true);
  assert.equal(fs.existsSync(path.join(backendRoot, JSON_REL)), true);
});

const md = readBackend(MD_REL);
const jsonText = readBackend(JSON_REL);
const report = JSON.parse(jsonText);
const pkg = JSON.parse(readBackend('package.json'));
const envJs = readBackend('src/config/env.js');
const envExample = readBackend('.env.example');
const service = readBackend('src/services/cloudflareStreamService.js');
const connectivity = readBackend('scripts/verify-cloudflare-stream.mjs');
const modelsIndex = readBackend('src/models/index.js');

test('package.json scripts', () => {
  assert.equal(pkg.scripts['verify:cloudflare-stream'], 'node scripts/verify-cloudflare-stream.mjs');
  assert.equal(
    pkg.scripts['verify:phase2-cloudflare-stream'],
    'node scripts/verify-phase2-cloudflare-stream.mjs'
  );
});

test('markdown required sections exist', () => {
  for (const heading of REQUIRED_MD_HEADINGS) {
    assert.equal(md.includes(heading), true, `missing heading: ${heading}`);
  }
});

test('json required keys exist', () => {
  for (const key of REQUIRED_JSON_KEYS) {
    assert.ok(key in report, `missing json key: ${key}`);
  }
});

test('env.js loads Cloudflare vars optionally (not required())', () => {
  assert.match(envJs, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(envJs, /CLOUDFLARE_STREAM_API_TOKEN/);
  assert.match(envJs, /cloudflareAccountId:/);
  assert.match(envJs, /cloudflareStreamApiToken:/);
  const requiredBlock = envJs.match(/function required[\s\S]*?^}/m);
  assert.ok(requiredBlock);
  assert.doesNotMatch(requiredBlock[0], /CLOUDFLARE/);
});

test('.env.example has empty Cloudflare placeholders', () => {
  assert.match(envExample, /^CLOUDFLARE_ACCOUNT_ID=\s*$/m);
  assert.match(envExample, /^CLOUDFLARE_STREAM_API_TOKEN=\s*$/m);
});

test('backend-only Stream service exists and uses fetch', () => {
  assert.match(service, /CLOUDFLARE_API_BASE/);
  assert.match(service, /cloudflareApiRequest/);
  assert.match(service, /verifyApiToken/);
  assert.match(service, /listVideosSummary/);
  assert.match(service, /createDirectUploadUrl/);
  assert.match(service, /api\.cloudflare\.com\/client\/v4/);
  assert.doesNotMatch(service, /from ['"]axios['"]/);
  assert.doesNotMatch(service, /console\.log\(.*token/i);
});

test('connectivity script is read-only (no mint, no mongo, no upload)', () => {
  assert.doesNotMatch(connectivity, /createDirectUploadUrl\s*\(/);
  assert.doesNotMatch(connectivity, /openDb\s*\(/);
  assert.doesNotMatch(connectivity, /mongoose\.connect\s*\(/);
  assert.match(connectivity, /verifyApiToken/);
  assert.match(connectivity, /listVideosSummary/);
});

test('Playlist model is still absent (VideoLecture is allowed after Phase 3)', () => {
  assert.equal(fs.existsSync(path.join(backendRoot, 'src/models/Playlist.js')), false);
  assert.doesNotMatch(modelsIndex, /Playlist/);
});

test('report records zero mongo writes and zero videos created', () => {
  assert.equal(report.mongoWrites, 0);
  assert.equal(report.cloudflareVideosCreated, 0);
});

test('tracked source does not hardcode a Stream token value', () => {
  const files = walkFiles(path.join(backendRoot, 'src')).concat(
    walkFiles(path.join(backendRoot, 'scripts'))
  );
  for (const file of files) {
    if (!/\.(js|mjs|md|json|example)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      text,
      /CLOUDFLARE_STREAM_API_TOKEN\s*[:=]\s*['"][A-Za-z0-9_-]{20,}/,
      file
    );
    assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9_-]{40,}/, file);
  }
});

test('startup does not import Stream API client', () => {
  const app = readBackend('src/app.js');
  const routes = readBackend('src/routes/index.js');
  const server = readBackend('src/server.js');
  assert.doesNotMatch(app, /cloudflareStreamService/);
  assert.doesNotMatch(routes, /cloudflareStreamService/);
  assert.doesNotMatch(server, /cloudflareStreamService/);
});

test('connectivity script does not print secret assignment values', () => {
  assert.doesNotMatch(connectivity, /cloudflareStreamApiToken/);
  assert.doesNotMatch(connectivity, /console\.log\(env/);
});

test('gitignore keeps backend/.env untracked', () => {
  const gi = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
  const backendGi = fs.readFileSync(path.join(backendRoot, '.gitignore'), 'utf8');
  assert.match(gi, /backend\/\.env|\.env/);
  assert.match(backendGi, /^\.env$/m);
});

console.log(`\n${passed} checks passed`);
console.log('PHASE 2 CLOUDFLARE STREAM VERIFIER: PASS');
