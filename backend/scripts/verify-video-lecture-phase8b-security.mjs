/**
 * Phase 8B — READ-ONLY / static Video Lecture security hardening verifier.
 *
 * Does not mint playback tokens or upload URLs, upload videos, or write Mongo.
 *
 * Run: node scripts/verify-video-lecture-phase8b-security.mjs
 *      npm run verify:phase8b-video-lecture-security
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolvePlaybackTtlSeconds,
  VIDEO_LECTURE_PLAYBACK_TTL_MAX_SECONDS,
  VIDEO_LECTURE_PLAYBACK_TTL_MIN_SECONDS,
} from '../src/constants/videoLecture.js';

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

const selfSource = fs.readFileSync(new URL(import.meta.url), 'utf8');
const routes = readBackend('src/routes/videoLectureRoutes.js');
const service = readBackend('src/services/videoLectureService.js');
const controller = readBackend('src/controllers/videoLectureController.js');
const stream = readBackend('src/services/cloudflareStreamService.js');
const envJs = readBackend('src/config/env.js');
const envExample = readBackend('.env.example');
const repo = readBackend('src/repositories/videoLectureRepository.js');
const model = readBackend('src/models/VideoLecture.js');
const validators = readBackend('src/validators/videoLectureValidators.js');
const webhookUtil = readBackend('src/utils/cloudflareStreamWebhook.js');
const webhookController = readBackend('src/controllers/cloudflareStreamWebhookController.js');
const webhookEventRepo = readBackend('src/repositories/webhookEventRepository.js');
const limiter = readBackend('src/middlewares/upstashRateLimiter.js');
const player = readRepo('mobile/src/screens/LecturePlayerScreen.js');
const mobileApi = readRepo('mobile/src/services/videoLectureService.js');
const progress = readRepo('mobile/src/utils/lectureProgress.js');

test('this verifier does not mint tokens, upload URLs, or write Mongo', () => {
  assert.doesNotMatch(selfSource, /createSignedPlaybackToken\s*\(/);
  assert.doesNotMatch(selfSource, /createDirectUploadUrl\s*\(/);
  assert.doesNotMatch(selfSource, /\.getVideo\s*\(/);
  assert.doesNotMatch(selfSource, /mongoose\.connect\s*\(/);
  assert.doesNotMatch(selfSource, /MongoClient\s*\(/);
  assert.doesNotMatch(selfSource, /openDb\s*\(/);
  assert.doesNotMatch(selfSource, /\.syncIndexes\s*\(/);
});

test('TTL no longer has a 1-hour minimum; max remains 6 hours', () => {
  assert.equal(VIDEO_LECTURE_PLAYBACK_TTL_MIN_SECONDS, 5 * 60);
  assert.notEqual(VIDEO_LECTURE_PLAYBACK_TTL_MIN_SECONDS, 3600);
  assert.equal(VIDEO_LECTURE_PLAYBACK_TTL_MAX_SECONDS, 6 * 3600);
  assert.equal(resolvePlaybackTtlSeconds(8), 8 + 15 * 60);
  assert.equal(resolvePlaybackTtlSeconds(30 * 60), 30 * 60 + 15 * 60);
  assert.equal(resolvePlaybackTtlSeconds(2 * 3600), 2 * 3600 + 15 * 60);
  assert.equal(resolvePlaybackTtlSeconds(8 * 3600), 6 * 3600);
  assert.ok(resolvePlaybackTtlSeconds(8) < 3600);
  assert.ok(resolvePlaybackTtlSeconds(1) >= 5 * 60);
});

test('client cannot control TTL, expiresAt, duration, or Cloudflare UID', () => {
  const start = service.indexOf('async authorizePlayback');
  const fn = service.slice(start, start + 2200);
  assert.match(fn, /resolvePlaybackTtlSeconds\(doc\.durationSeconds\)/);
  assert.doesNotMatch(fn, /req\.body/);
  assert.doesNotMatch(fn, /query\.expiresAt|body\.expiresAt|body\.durationSeconds|body\.cloudflareVideoId/);
  const cStart = controller.indexOf('authorizePlayback: asyncHandler');
  const cEnd = controller.indexOf('update: asyncHandler');
  const playbackHandler = controller.slice(cStart, cEnd);
  assert.match(playbackHandler, /req\.params\.id, req\.user/);
  assert.doesNotMatch(playbackHandler, /req\.body/);
});

test('dedicated signing key is preferred when configured; fallback remains', () => {
  assert.match(stream, /signingConfigured/);
  assert.match(stream, /Cloudflare Stream signing key is incomplete/);
  assert.match(stream, /algorithm:\s*'RS256'/);
  assert.match(stream, /\/stream\/\$\{encodeURIComponent\(uid\)\}\/token/);
  const mint = stream.slice(stream.indexOf('async createSignedPlaybackToken'));
  const rsAt = mint.indexOf("algorithm: 'RS256'");
  const tokenAt = mint.indexOf('/token');
  assert.ok(rsAt >= 0 && tokenAt > rsAt, 'RS256 path must be attempted before /token fallback');
});

test('signing credentials remain backend-only', () => {
  const mobile = [mobileApi, player, progress].join('\n');
  assert.doesNotMatch(mobile, /CLOUDFLARE_STREAM_SIGNING_KEY/);
  assert.doesNotMatch(mobile, /CLOUDFLARE_STREAM_API_TOKEN/);
  assert.doesNotMatch(mobile, /CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(envJs, /EXPO_PUBLIC_CLOUDFLARE/);
  assert.match(envExample, /CLOUDFLARE_STREAM_SIGNING_KEY_ID=/);
  assert.match(envExample, /BOTH are unset/);
});

test('upload-url has dedicated rate limiting and remains admin-only', () => {
  assert.match(limiter, /lectureUploadUrlLimiter/);
  assert.match(limiter, /routeName: 'video_lecture_upload_url'/);
  assert.match(limiter, /resolveBucketKey/);
  assert.match(limiter, /admin:\$\{req\.user\.id\}/);
  const uploadStart = routes.indexOf("'/admin/upload-url'");
  const uploadEnd = routes.indexOf("router.get(");
  const chunk = routes.slice(uploadStart, uploadEnd);
  assert.match(chunk, /adminChain/);
  assert.match(chunk, /lectureUploadUrlLimiter/);
  assert.doesNotMatch(chunk, /adminMutationLimiter/);
  const chainAt = chunk.indexOf('adminChain');
  const limAt = chunk.indexOf('lectureUploadUrlLimiter');
  assert.ok(chainAt >= 0 && limAt > chainAt, 'auth before upload-url limiter so admin id exists');
});

test('upload-url validation: maxDurationSeconds, no client UID, no client status', () => {
  assert.match(validators, /maxDurationSeconds/);
  assert.match(validators, /cloudflareVideoId must not be sent by the client/);
  assert.match(validators, /status cannot be changed through this endpoint/);
  assert.match(service, /requireSignedURLs:\s*true/);
  assert.match(service, /status:\s*VIDEO_LECTURE_STATUS\.UPLOADING/);
});

test('webhook retains HMAC, timestamp, and insert-first idempotency', () => {
  assert.match(webhookController, /verifyCloudflareStreamWebhookSignature/);
  assert.match(webhookUtil, /timingSafeEqual/);
  assert.match(webhookUtil, /timestamp_expired/);
  assert.match(webhookEventRepo, /tryInsertEvent/);
  const apply = service.slice(service.indexOf('async applyCloudflareStreamNotification'));
  const insertAt = apply.indexOf('tryInsertEvent');
  const updateAt = apply.indexOf('videoLectureRepository.updateById');
  assert.ok(insertAt >= 0 && updateAt > insertAt, 'event identity claimed before state write');
});

test('webhook cannot create lectures or alter access/subject/topic/ownership', () => {
  const apply = service.slice(service.indexOf('async applyCloudflareStreamNotification'));
  assert.match(apply, /findByCloudflareVideoId/);
  assert.doesNotMatch(apply, /videoLectureRepository\.create/);
  assert.doesNotMatch(apply, /patch\.access|next\.access|patch\.subjectId|patch\.topicId|patch\.title/);
  assert.match(apply, /const patch = \{ status: incomingStatus \}/);
});

test('published cannot be downgraded; archived cannot be resurrected', () => {
  const apply = service.slice(service.indexOf('async applyCloudflareStreamNotification'));
  assert.match(
    apply,
    /existing\.status === VIDEO_LECTURE_STATUS\.PUBLISHED &&\s*\r?\n\s*incomingStatus !== VIDEO_LECTURE_STATUS\.PUBLISHED/
  );
  assert.match(apply, /VIDEO_LECTURE_STATUS\.ARCHIVED/);
  assert.match(apply, /skip archived lecture/);
});

test('signed playback URLs are not persisted or logged', () => {
  assert.doesNotMatch(model, /playbackUrl/);
  assert.doesNotMatch(repo, /playbackUrl/);
  const authLogAt = service.indexOf('[VIDEO LECTURE PLAYBACK] authorized');
  assert.ok(authLogAt >= 0);
  assert.doesNotMatch(service.slice(authLogAt, authLogAt + 160), /playbackUrl/);
  assert.doesNotMatch(player, /AsyncStorage\.setItem\([\s\S]*playbackUrl/);
  assert.doesNotMatch(progress, /playbackUrl/);
  assert.match(controller, /authorizePlayback/);
  assert.match(service, /playbackUrl: signed\.playbackUrl/);
  assert.match(service, /expiresAt: signed\.expiresAt/);
});

test('no Question/Test/PYQ/Battle/Daily, Playlist, or syncIndexes changes in lecture files', () => {
  assert.doesNotMatch(service, /syncIndexes\s*\(/);
  assert.doesNotMatch(repo, /syncIndexes\s*\(/);
  assert.doesNotMatch(readBackend('src/models/index.js'), /Playlist|VideoLectureProgress/);
  assert.doesNotMatch(routes, /playlist|examId|testId/);
  assert.doesNotMatch(readBackend('src/services/questionService.js'), /videoLecture/);
  assert.doesNotMatch(readBackend('src/services/testService.js'), /videoLecture/);
  assert.doesNotMatch(readBackend('src/services/battleService.js'), /videoLecture/);
  assert.doesNotMatch(readBackend('src/controllers/dailyPracticeController.js'), /videoLecture/);
});

test('package.json has verify:phase8b-video-lecture-security', () => {
  const pkg = JSON.parse(readBackend('package.json'));
  assert.equal(
    pkg.scripts['verify:phase8b-video-lecture-security'],
    'node scripts/verify-video-lecture-phase8b-security.mjs'
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
  })
);
console.log('PHASE 8B VIDEO LECTURE SECURITY HARDENING VERIFIER: PASS');
