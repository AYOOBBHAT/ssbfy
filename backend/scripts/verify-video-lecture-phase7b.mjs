/**
 * Phase 7B — static/read-only verification of student VideoLecture playback.
 *
 * Does not mint playback tokens, call Cloudflare, write Mongo, or create lectures.
 *
 * Run: node scripts/verify-video-lecture-phase7b.mjs
 *      npm run verify:phase7b-video-lecture
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePlaybackTtlSeconds } from '../src/constants/videoLecture.js';

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
const mobileApi = readRepo('mobile/src/services/videoLectureService.js');
const player = readRepo('mobile/src/screens/LecturePlayerScreen.js');
const listScreen = readRepo('mobile/src/screens/VideoLecturesScreen.js');
const progress = readRepo('mobile/src/utils/lectureProgress.js');
const navigator = readRepo('mobile/src/navigation/AppNavigator.js');
const mobilePkg = JSON.parse(readRepo('mobile/package.json'));
const appJson = JSON.parse(readRepo('mobile/app.json'));

test('this verifier does not mint tokens, call Cloudflare, or write Mongo', () => {
  assert.doesNotMatch(selfSource, /createSignedPlaybackToken\s*\(/);
  assert.doesNotMatch(selfSource, /createDirectUploadUrl\s*\(/);
  assert.doesNotMatch(selfSource, /\.getVideo\s*\(/);
  assert.doesNotMatch(selfSource, /mongoose\.connect\s*\(/);
  assert.doesNotMatch(selfSource, /MongoClient\s*\(/);
  assert.doesNotMatch(selfSource, /openDb\s*\(/);
  assert.doesNotMatch(selfSource, /\.syncIndexes\s*\(/);
});

test('student list, detail, and playback routes exist with authentication', () => {
  assert.match(routes, /videoLectureController\.listPublished/);
  assert.match(routes, /videoLectureController\.getPublished/);
  assert.match(routes, /videoLectureController\.authorizePlayback/);
  assert.match(routes, /router\.get\(\s*'\/'/);
  assert.match(routes, /router\.get\(\s*'\/:id'/);
  assert.match(routes, /router\.post\(\s*'\/:id\/playback'/);
  assert.match(routes, /authenticate/);
  assert.match(routes, /lecturePlaybackLimiter/);
  assert.ok(routes.includes("'/:id/playback'"));
  const playbackChunk = routes.slice(
    routes.lastIndexOf('router.post', routes.indexOf("'/:id/playback'"))
  );
  assert.match(playbackChunk, /authenticate/);
});

test('published-only filtering and archived lectures are rejected', () => {
  assert.match(service, /status:\s*VIDEO_LECTURE_STATUS\.PUBLISHED/);
  assert.match(repo, /findPublishedById/);
  assert.match(repo, /VIDEO_LECTURE_STATUS\.PUBLISHED/);
  assert.match(service, /findPublishedById/);
});

test('premium entitlement uses existing isPremiumUser and free path exists', () => {
  assert.match(service, /import \{ isPremiumUser \}/);
  assert.match(service, /isPremiumUser\(user\)/);
  assert.match(service, /VIDEO_LECTURE_ACCESS\.PREMIUM/);
  assert.match(service, /Premium required/);
  assert.match(service, /isLectureLocked/);
  assert.match(service, /ROLES\.ADMIN/);
});

test('Cloudflare signed playback implementation exists', () => {
  assert.match(stream, /createSignedPlaybackToken/);
  assert.match(stream, /\/stream\/\$\{encodeURIComponent\(uid\)\}\/token/);
  assert.match(stream, /algorithm:\s*'RS256'/);
  assert.match(service, /createSignedPlaybackToken/);
  assert.match(envExample, /CLOUDFLARE_STREAM_SIGNING_KEY_ID=/);
  assert.match(envExample, /CLOUDFLARE_STREAM_SIGNING_KEY_PEM=/);
  assert.match(envJs, /cloudflareStreamSigningKeyId/);
});

test('signed playback is not exposed by list/detail and not persisted or logged', () => {
  const dtoStart = service.indexOf('function toStudentDto');
  const dtoEnd = service.indexOf('function isLectureLocked');
  const dto = service.slice(dtoStart, dtoEnd);
  assert.doesNotMatch(dto, /playbackUrl/);
  assert.doesNotMatch(dto, /cloudflareVideoId/);
  assert.match(dto, /thumbnailUrl:\s*null/);
  const model = readBackend('src/models/VideoLecture.js');
  assert.doesNotMatch(model, /playbackUrl/);
  assert.doesNotMatch(repo, /playbackUrl/);
  assert.doesNotMatch(controller, /listPublished[\s\S]{0,200}playbackUrl/);
  const authLogAt = service.indexOf('[VIDEO LECTURE PLAYBACK] authorized');
  assert.ok(authLogAt >= 0);
  const authLog = service.slice(authLogAt, authLogAt + 160);
  assert.doesNotMatch(authLog, /playbackUrl/);
  assert.equal(resolvePlaybackTtlSeconds(8), 8 + 15 * 60);
  assert.equal(resolvePlaybackTtlSeconds(5 * 3600), 5 * 3600 + 15 * 60);
  assert.equal(resolvePlaybackTtlSeconds(8 * 3600), 6 * 3600);
  assert.ok(resolvePlaybackTtlSeconds(8) > 120);
  assert.ok(resolvePlaybackTtlSeconds(8) < 3600);
});

test('Cloudflare credentials remain backend-only', () => {
  const mobileSrc = [
    mobileApi,
    player,
    listScreen,
    readRepo('mobile/src/navigation/AppNavigator.js'),
  ].join('\n');
  assert.doesNotMatch(mobileSrc, /CLOUDFLARE_STREAM_API_TOKEN/);
  assert.doesNotMatch(mobileSrc, /CLOUDFLARE_STREAM_WEBHOOK_SECRET/);
  assert.doesNotMatch(mobileSrc, /CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(mobileSrc, /CLOUDFLARE_STREAM_SIGNING_KEY/);
  assert.doesNotMatch(envJs, /EXPO_PUBLIC_CLOUDFLARE/);
  assert.doesNotMatch(envJs, /VITE_CLOUDFLARE_STREAM_API_TOKEN/);
});

test('lectureId comes from route params; request body cannot change access', () => {
  assert.match(controller, /authorizePlayback\(req\.params\.id, req\.user\)/);
  const start = controller.indexOf('authorizePlayback: asyncHandler');
  const end = controller.indexOf('update: asyncHandler');
  const playbackHandler = controller.slice(start, end);
  assert.doesNotMatch(playbackHandler, /req\.body/);
  const svcStart = service.indexOf('async authorizePlayback');
  const svcFn = service.slice(svcStart, svcStart + 1800);
  assert.doesNotMatch(svcFn, /req\.body/);
  assert.doesNotMatch(svcFn, /query\.userId|body\.userId/);
});

test('mobile API client, expo-video, and no web-browser player', () => {
  assert.match(mobileApi, /api\.get\('\/video-lectures'/);
  assert.match(mobileApi, /api\.get\(`\/video-lectures\/\$\{lectureId\}`/);
  assert.match(mobileApi, /api\.post\(`\/video-lectures\/\$\{lectureId\}\/playback`/);
  assert.ok(mobilePkg.dependencies['expo-video']);
  assert.ok(appJson.expo.plugins.some((p) => p === 'expo-video' || p?.[0] === 'expo-video'));
  assert.match(player, /from 'expo-video'/);
  assert.doesNotMatch(player, /expo-web-browser/);
  assert.doesNotMatch(player, /WebView/);
  assert.doesNotMatch(listScreen, /expo-web-browser/);
  assert.match(navigator, /VideoLectures/);
  assert.match(navigator, /LecturePlayer/);
});

test('AsyncStorage progress is keyed per user + lecture and saved periodically', () => {
  assert.match(progress, /AsyncStorage/);
  assert.match(progress, /userId/);
  assert.match(progress, /lectureId/);
  assert.match(progress, /LECTURE_PROGRESS_SAVE_INTERVAL_MS/);
  assert.match(progress, /LECTURE_COMPLETED_RATIO/);
  assert.match(player, /saveLectureProgress/);
  assert.match(player, /LECTURE_PROGRESS_SAVE_INTERVAL_MS/);
  assert.match(listScreen, /getLectureProgress/);
  assert.doesNotMatch(player, /AsyncStorage\.setItem\([\s\S]*playbackUrl/);
});

test('no Mongo watch-progress, playlists, exam linkage, or syncIndexes', () => {
  const modelsIndex = readBackend('src/models/index.js');
  assert.doesNotMatch(modelsIndex, /Playlist|VideoLectureProgress|WatchProgress/);
  assert.doesNotMatch(routes, /playlist|examId|testId/);
  assert.doesNotMatch(service, /syncIndexes\s*\(/);
  assert.doesNotMatch(repo, /syncIndexes\s*\(/);
  assert.doesNotMatch(readBackend('src/services/questionService.js'), /videoLecture/);
  assert.doesNotMatch(readBackend('src/services/testService.js'), /videoLecture/);
  assert.doesNotMatch(readBackend('src/services/battleService.js'), /videoLecture/);
  assert.doesNotMatch(readBackend('src/controllers/dailyPracticeController.js'), /videoLecture/);
});

test('package.json has verify:phase7b-video-lecture', () => {
  const pkg = JSON.parse(readBackend('package.json'));
  assert.equal(
    pkg.scripts['verify:phase7b-video-lecture'],
    'node scripts/verify-video-lecture-phase7b.mjs'
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
console.log('PHASE 7B VIDEO LECTURE PLAYBACK VERIFIER: PASS');
