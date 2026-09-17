/**
 * Phase 8A — READ-ONLY / static Video Lecture security contract verifier.
 *
 * Does not mint upload URLs or playback tokens, upload videos, or modify
 * Mongo / Cloudflare / application source.
 *
 * Run: node scripts/verify-video-lecture-phase8a-security.mjs
 *      npm run verify:phase8a-video-lecture-security
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
const webhookRoutes = readBackend('src/routes/cloudflareStreamWebhookRoutes.js');
const webhookController = readBackend('src/controllers/cloudflareStreamWebhookController.js');
const webhookUtil = readBackend('src/utils/cloudflareStreamWebhook.js');
const webhookEventModel = readBackend('src/models/WebhookEvent.js');
const webhookEventRepo = readBackend('src/repositories/webhookEventRepository.js');
const limiter = readBackend('src/middlewares/upstashRateLimiter.js');
const adminGuard = readBackend('src/middlewares/adminGuard.js');
const auth = readBackend('src/middlewares/auth.js');
const app = readBackend('src/app.js');
const modelsIndex = readBackend('src/models/index.js');
const mobileApi = readRepo('mobile/src/services/videoLectureService.js');
const mobileHttp = readRepo('mobile/src/services/api.js');
const player = readRepo('mobile/src/screens/LecturePlayerScreen.js');
const listScreen = readRepo('mobile/src/screens/VideoLecturesScreen.js');
const progress = readRepo('mobile/src/utils/lectureProgress.js');
const sentry = readRepo('mobile/src/monitoring/sentry.js');
const adminApi = readRepo('admin/src/services/api.js');
const adminUpload = readRepo('admin/src/utils/cloudflareDirectUpload.js');

const mobileBundle = [
  mobileApi,
  mobileHttp,
  player,
  listScreen,
  progress,
  readRepo('mobile/src/navigation/AppNavigator.js'),
  sentry,
].join('\n');

test('this verifier does not mint tokens, call Cloudflare, or write Mongo', () => {
  assert.doesNotMatch(selfSource, /createSignedPlaybackToken\s*\(/);
  assert.doesNotMatch(selfSource, /createDirectUploadUrl\s*\(/);
  assert.doesNotMatch(selfSource, /\.getVideo\s*\(/);
  assert.doesNotMatch(selfSource, /mongoose\.connect\s*\(/);
  assert.doesNotMatch(selfSource, /MongoClient\s*\(/);
  assert.doesNotMatch(selfSource, /openDb\s*\(/);
  assert.doesNotMatch(selfSource, /\.syncIndexes\s*\(/);
  assert.doesNotMatch(selfSource, /VideoLecture\.create/);
});

test('premium authorization uses existing isPremiumUser before signed mint', () => {
  assert.match(service, /import \{ isPremiumUser \}/);
  assert.match(service, /premium: isPremiumUser\(user\)/);
  const start = service.indexOf('async authorizePlayback');
  const fn = service.slice(start, start + 2200);
  assert.match(fn, /resolveStudentEntitlement/);
  assert.match(fn, /isLectureLocked/);
  assert.match(fn, /Premium required/);
  assert.match(fn, /findPublishedById/);
  const mintAt = fn.indexOf('createSignedPlaybackToken');
  const lockAt = fn.indexOf('isLectureLocked');
  assert.ok(lockAt >= 0 && mintAt > lockAt, 'entitlement must run before mint');
});

test('published filter and archived rejection exist', () => {
  assert.match(repo, /findPublishedById/);
  assert.match(repo, /VIDEO_LECTURE_STATUS\.PUBLISHED/);
  assert.match(service, /status:\s*VIDEO_LECTURE_STATUS\.PUBLISHED/);
  assert.match(service, /VIDEO_LECTURE_STATUS\.ARCHIVED/);
  assert.match(service, /skip archived lecture/);
});

test('signed playback exists with TTL clamp 5m–6h, not PDF 90s', () => {
  assert.match(stream, /createSignedPlaybackToken/);
  assert.match(stream, /algorithm:\s*'RS256'/);
  assert.match(stream, /\/stream\/\$\{encodeURIComponent\(uid\)\}\/token/);
  assert.match(stream, /requireSignedURLs/);
  assert.equal(VIDEO_LECTURE_PLAYBACK_TTL_MIN_SECONDS, 5 * 60);
  assert.equal(VIDEO_LECTURE_PLAYBACK_TTL_MAX_SECONDS, 6 * 3600);
  assert.equal(resolvePlaybackTtlSeconds(8), 8 + 15 * 60);
  assert.equal(resolvePlaybackTtlSeconds(8 * 3600), 6 * 3600);
  assert.ok(resolvePlaybackTtlSeconds(8) > 120);
  assert.ok(resolvePlaybackTtlSeconds(8) < 3600);
});

test('Cloudflare credentials remain backend-only', () => {
  assert.doesNotMatch(mobileBundle, /CLOUDFLARE_STREAM_API_TOKEN/);
  assert.doesNotMatch(mobileBundle, /CLOUDFLARE_STREAM_WEBHOOK_SECRET/);
  assert.doesNotMatch(mobileBundle, /CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(mobileBundle, /CLOUDFLARE_STREAM_SIGNING_KEY/);
  assert.doesNotMatch(mobileBundle, /JWT_SECRET/);
  assert.doesNotMatch(adminApi, /CLOUDFLARE_STREAM_API_TOKEN/);
  assert.doesNotMatch(adminUpload, /CLOUDFLARE_STREAM_API_TOKEN/);
  assert.doesNotMatch(envJs, /EXPO_PUBLIC_CLOUDFLARE/);
  assert.doesNotMatch(envJs, /VITE_CLOUDFLARE_STREAM_API_TOKEN/);
  assert.match(envJs, /cloudflareStreamApiToken:/);
  assert.match(envJs, /cloudflareStreamSigningKeyPem:/);
  assert.match(envExample, /CLOUDFLARE_STREAM_SIGNING_KEY_ID=/);
});

test('list/detail do not expose playback URL or Cloudflare UID', () => {
  const dtoStart = service.indexOf('function toStudentDto');
  const dtoEnd = service.indexOf('function isLectureLocked');
  const dto = service.slice(dtoStart, dtoEnd);
  assert.doesNotMatch(dto, /playbackUrl/);
  assert.doesNotMatch(dto, /cloudflareVideoId/);
  assert.match(dto, /thumbnailUrl:\s*null/);
  assert.doesNotMatch(controller, /listPublished[\s\S]{0,220}playbackUrl/);
  assert.doesNotMatch(controller, /getPublished[\s\S]{0,220}playbackUrl/);
});

test('student routes require authenticate; lectureId is a Mongo param', () => {
  assert.match(auth, /export function authenticate/);
  assert.match(routes, /authenticate/);
  assert.match(routes, /lectureReadLimiter/);
  assert.match(routes, /lecturePlaybackLimiter/);
  assert.match(validators, /param\('id'\)\.isMongoId/);
  const start = controller.indexOf('authorizePlayback: asyncHandler');
  const end = controller.indexOf('update: asyncHandler');
  const playbackHandler = controller.slice(start, end);
  assert.match(playbackHandler, /req\.params\.id, req\.user/);
  assert.doesNotMatch(playbackHandler, /req\.body/);
});

test('admin routes are protected by adminChain', () => {
  assert.match(adminGuard, /authenticate/);
  assert.match(adminGuard, /requireRole\(ROLES\.ADMIN\)/);
  assert.match(routes, /adminChain/);
  assert.match(routes, /\/admin\/upload-url/);
  const uploadChunk = routes.slice(
    routes.indexOf("'/admin/upload-url'"),
    routes.indexOf("router.get(")
  );
  assert.match(uploadChunk, /adminChain/);
  assert.match(validators, /cloudflareVideoId must not be sent by the client/);
  assert.match(validators, /status cannot be changed through this endpoint/);
  assert.match(validators, /cloudflareVideoId cannot be updated/);
});

test('webhook signature verification, raw body, timestamp, and idempotency exist', () => {
  assert.match(app, /\/api\/webhooks\/cloudflare\/stream/);
  assert.match(app, /req\.rawBody/);
  assert.match(webhookRoutes, /webhookLimiter/);
  assert.match(webhookController, /verifyCloudflareStreamWebhookSignature/);
  assert.match(webhookController, /Webhook-Signature/);
  assert.match(webhookUtil, /timingSafeEqual/);
  assert.match(webhookUtil, /timestamp_expired/);
  assert.match(webhookUtil, /createHmac\('sha256'/);
  assert.match(webhookEventModel, /eventId/);
  assert.match(webhookEventModel, /unique:\s*true/);
  assert.match(webhookEventRepo, /tryInsertEvent/);
  assert.match(webhookEventRepo, /code === 11000/);
  assert.match(service, /applyCloudflareStreamNotification/);
  assert.doesNotMatch(
    service,
    /applyCloudflareStreamNotification[\s\S]{0,400}videoLectureRepository\.create/
  );
});

test('upload URL protection: admin-only, signed required, duration capped, expiry set', () => {
  assert.match(service, /provisionDirectUpload/);
  assert.match(service, /requireSignedURLs:\s*true/);
  assert.match(service, /uploadExpiryIso/);
  assert.match(service, /resolveMaxDurationSeconds/);
  assert.match(validators, /maxDurationSeconds/);
  assert.match(stream, /direct_upload/);
  assert.match(limiter, /adminMutationLimiter/);
});

test('signed playback URL is not persisted on the VideoLecture schema', () => {
  assert.doesNotMatch(model, /playbackUrl/);
  assert.doesNotMatch(repo, /playbackUrl/);
  assert.doesNotMatch(service, /updateById\([^\)]*playbackUrl/);
});

test('playback URL is not logged; secrets are not printed', () => {
  const authLogAt = service.indexOf('[VIDEO LECTURE PLAYBACK] authorized');
  assert.ok(authLogAt >= 0);
  const authLog = service.slice(authLogAt, authLogAt + 160);
  assert.doesNotMatch(authLog, /playbackUrl/);
  assert.doesNotMatch(stream, /console\.log\(.*token/i);
  assert.doesNotMatch(player, /console\.(log|debug|info|warn|error)\([^\)]*playbackUrl/);
  assert.doesNotMatch(progress, /playbackUrl/);
  assert.doesNotMatch(webhookController, /logger\.\w+\([\s\S]{0,120}cloudflareStreamWebhookSecret/);
});

test('rate limits exist on student read, playback, admin mutation, and webhook', () => {
  assert.match(limiter, /routeName: 'video_lecture_read'/);
  assert.match(limiter, /routeName: 'video_lecture_playback'/);
  assert.match(limiter, /routeName: 'admin_mutation'/);
  assert.match(limiter, /routeName: 'webhook'/);
  assert.match(routes, /lecturePlaybackLimiter/);
  assert.match(routes, /adminMutationLimiter/);
});

test('no syncIndexes, playlists, or exam linkage in lecture files', () => {
  assert.doesNotMatch(service, /syncIndexes\s*\(/);
  assert.doesNotMatch(repo, /syncIndexes\s*\(/);
  assert.doesNotMatch(model, /syncIndexes\s*\(/);
  assert.doesNotMatch(modelsIndex, /Playlist|VideoLectureProgress|WatchProgress/);
  assert.doesNotMatch(routes, /playlist|examId|testId/);
  assert.doesNotMatch(readBackend('src/services/questionService.js'), /videoLecture/);
  assert.doesNotMatch(readBackend('src/services/testService.js'), /videoLecture/);
  assert.doesNotMatch(readBackend('src/services/battleService.js'), /videoLecture/);
});

test('mobile playback uses expo-video and existing axios client; progress is local only', () => {
  assert.match(mobileApi, /api\.post\(`\/video-lectures\/\$\{lectureId\}\/playback`/);
  assert.match(player, /from 'expo-video'/);
  assert.doesNotMatch(player, /expo-web-browser/);
  assert.doesNotMatch(player, /WebView/);
  assert.match(progress, /AsyncStorage/);
  assert.match(progress, /userId/);
  assert.match(progress, /lectureId/);
  assert.match(listScreen, /item\.locked === true/);
  assert.doesNotMatch(mobileHttp, /api\.cloudflare\.com/);
});

test('package.json has verify:phase8a-video-lecture-security', () => {
  const pkg = JSON.parse(readBackend('package.json'));
  assert.equal(
    pkg.scripts['verify:phase8a-video-lecture-security'],
    'node scripts/verify-video-lecture-phase8a-security.mjs'
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
console.log('PHASE 8A VIDEO LECTURE SECURITY VERIFIER: PASS');
