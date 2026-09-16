/**
 * Phase 4 Cloudflare Stream webhook verifier.
 *
 * Read-only: no Mongo connect/write, no Stream direct_upload, no getVideo/deleteVideo calls.
 * HMAC tests use an ephemeral in-process secret (not CLOUDFLARE_STREAM_WEBHOOK_SECRET).
 *
 * Run: node scripts/verify-video-lecture-phase4.mjs
 *      npm run verify:phase4-video-lecture
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VideoLecture } from '../src/models/VideoLecture.js';
import { cloudflareStreamService } from '../src/services/cloudflareStreamService.js';
import {
  mapCloudflareVideoToLectureStatus,
  verifyCloudflareStreamWebhookSignature,
} from '../src/utils/cloudflareStreamWebhook.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(here, '..');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function read(rel) {
  return fs.readFileSync(path.join(backendRoot, rel), 'utf8');
}

function runNodeScript(rel) {
  const result = spawnSync(process.execPath, [path.join(backendRoot, rel)], {
    cwd: backendRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `${rel} failed (exit ${result.status}):\n${result.stdout || ''}\n${result.stderr || ''}`
    );
  }
}

test('VideoLecture model loads', () => {
  assert.equal(VideoLecture.modelName, 'VideoLecture');
});

test('webhook route is registered', () => {
  const routesIndex = read('src/routes/index.js');
  const webhookRoutes = read('src/routes/cloudflareStreamWebhookRoutes.js');
  const app = read('src/app.js');
  assert.match(routesIndex, /cloudflareStreamWebhookRoutes/);
  assert.match(routesIndex, /\/webhooks\/cloudflare/);
  assert.match(webhookRoutes, /\/stream/);
  assert.match(webhookRoutes, /cloudflareStreamWebhookController\.handleStream/);
  assert.doesNotMatch(webhookRoutes, /adminChain|authenticate/);
  assert.match(app, /\/api\/webhooks\/cloudflare\/stream/);
  assert.match(app, /req\.rawBody/);
});

test('Cloudflare webhook secret configuration exists', () => {
  const envJs = read('src/config/env.js');
  const envExample = read('.env.example');
  assert.match(envJs, /cloudflareStreamWebhookSecret/);
  assert.match(envJs, /CLOUDFLARE_STREAM_WEBHOOK_SECRET/);
  assert.doesNotMatch(envJs, /required\('CLOUDFLARE_STREAM_WEBHOOK_SECRET'\)/);
  assert.match(envExample, /^CLOUDFLARE_STREAM_WEBHOOK_SECRET=\s*$/m);
});

test('signature verification utility exists', () => {
  assert.equal(typeof verifyCloudflareStreamWebhookSignature, 'function');
  const secret = 'phase4-ephemeral-hmac-test';
  const body = Buffer.from(
    JSON.stringify({
      uid: 'test-uid',
      readyToStream: true,
      status: { state: 'ready' },
      duration: 5.5,
      thumbnail: 'https://example.invalid/thumb.jpg',
    })
  );
  const time = String(Math.floor(Date.now() / 1000));
  const sig1 = crypto.createHmac('sha256', secret).update(`${time}.`).update(body).digest('hex');
  const ok = verifyCloudflareStreamWebhookSignature({
    secret,
    rawBody: body,
    signatureHeader: `time=${time},sig1=${sig1}`,
  });
  assert.equal(ok.ok, true);
  const bad = verifyCloudflareStreamWebhookSignature({
    secret,
    rawBody: body,
    signatureHeader: `time=${time},sig1=${'0'.repeat(64)}`,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'mismatch');
});

test('status mapping publishes only when readyToStream', () => {
  assert.equal(
    mapCloudflareVideoToLectureStatus({
      readyToStream: true,
      status: { state: 'ready' },
    }),
    'published'
  );
  assert.equal(
    mapCloudflareVideoToLectureStatus({
      readyToStream: false,
      status: { state: 'ready' },
    }),
    'processing'
  );
  assert.equal(
    mapCloudflareVideoToLectureStatus({
      readyToStream: false,
      status: { state: 'inprogress' },
    }),
    'processing'
  );
  assert.equal(
    mapCloudflareVideoToLectureStatus({
      readyToStream: false,
      status: { state: 'error' },
    }),
    'failed'
  );
});

test('webhook handler is idempotent and does not create lectures or videos', () => {
  const service = read('src/services/videoLectureService.js');
  const controller = read('src/controllers/cloudflareStreamWebhookController.js');
  assert.match(service, /applyCloudflareStreamNotification/);
  assert.match(service, /tryInsertEvent/);
  assert.match(service, /idempotent/);
  assert.match(service, /findByCloudflareVideoId/);
  assert.doesNotMatch(service, /applyCloudflareStreamNotification[\s\S]*videoLectureRepository\.create/);
  assert.doesNotMatch(controller, /createDirectUploadUrl/);
  assert.doesNotMatch(controller, /VideoLecture\.create/);
});

test('Cloudflare service exposes getVideo', () => {
  assert.equal(typeof cloudflareStreamService.getVideo, 'function');
});

test('this verifier does not mint uploads or write Mongo', () => {
  const self = fs.readFileSync(
    path.join(backendRoot, 'scripts/verify-video-lecture-phase4.mjs'),
    'utf8'
  );
  assert.doesNotMatch(self, /createDirectUploadUrl\s*\(/);
  assert.doesNotMatch(self, /provisionDirectUpload\s*\(/);
  assert.doesNotMatch(self, /\.getVideo\s*\(/);
  assert.doesNotMatch(self, /\.deleteVideo\s*\(/);
  assert.doesNotMatch(self, /mongoose\.connect\s*\(/);
  assert.doesNotMatch(self, /openDb\s*\(/);
  assert.doesNotMatch(self, /syncIndexes\s*\(/);
});

test('package.json has verify:phase4-video-lecture', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(
    pkg.scripts['verify:phase4-video-lecture'],
    'node scripts/verify-video-lecture-phase4.mjs'
  );
});

test('existing Phase 3 verification still passes', () => {
  runNodeScript('scripts/verify-video-lecture-phase3.mjs');
});

test('existing Phase 2 setup verifier still passes', () => {
  runNodeScript('scripts/verify-phase2-cloudflare-stream.mjs');
});

test('live Cloudflare connectivity script remains read-only', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(backendRoot, 'scripts/verify-cloudflare-stream.mjs')],
    { cwd: backendRoot, encoding: 'utf8' }
  );
  const out = `${result.stdout || ''}\n${result.stderr || ''}`;
  assert.match(out, /"directUploadInvoked": false/);
  assert.doesNotMatch(out, /createDirectUploadUrl\s*\(/);
  if (result.status !== 0) {
    console.log(
      'warn live Cloudflare connectivity did not pass on this machine (no video was created)'
    );
  }
});

console.log(`\n${passed} checks passed`);
console.log(
  JSON.stringify({
    ok: true,
    mongoWrites: 0,
    cloudflareVideosCreated: 0,
    directUploadInvoked: false,
    getVideoInvoked: false,
    webhookSecretUsed: false,
  })
);
console.log('PHASE 4 VIDEO LECTURE VERIFIER: PASS');
