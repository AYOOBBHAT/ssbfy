/**
 * Phase 7A — READ-ONLY/static mobile playback architecture audit verifier.
 *
 * Does not connect to Mongo, does not call Cloudflare, does not write data,
 * does not install packages, does not modify application code.
 *
 * Run: node scripts/verify-video-lecture-phase7a.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(here, '..');
const repoRoot = path.join(backendRoot, '..');
const MD_REL = 'scripts/fixtures/set-a/SET_A_phase7a_mobile_playback_audit.md';

const REQUIRED_HEADINGS = [
  '# Phase 7A — Mobile Video Lecture Playback Architecture Audit',
  '## What already exists',
  '## What is missing (playback)',
  '## Answers (1–25)',
  '## What should be implemented in Phase 7B',
  '## Security summary',
  '## Phase 7A isolation',
];

const REQUIRED_ANSWER_MARKERS = [
  '### 1. Recommended mobile video player package based on packages already installed',
  '### 2. Whether expo-video or another existing package should be reused',
  '### 3. Exact backend endpoint(s) needed',
  '### 4. Whether Cloudflare signed playback should be used for premium content',
  '### 5. Recommended authorization lifetime for playback tokens/URLs',
  '### 6. How backend should determine access',
  '### 7. How the mobile app obtains playback authorization without Cloudflare secrets',
  '### 8. Whether free lectures can use public playback or should also use signed playback',
  '### 9. Recommended response shape for mobile',
  '### 10. Whether thumbnailUrl can be used directly',
  '### 11. How HLS playback should be handled on Android and iOS',
  '### 12. Recommended full-screen behavior',
  '### 13. Recommended orientation behavior',
  '### 14. Resume playback architecture',
  '### 15. Watched / completed architecture',
  '### 16. Whether watch progress should be stored immediately or batched',
  '### 17. Recommended indexes if watch progress is introduced',
  '### 18. Network / offline / error handling',
  '### 19. Premium gating UX',
  '### 20. Whether the current VideoLecture model needs any additions',
  '### 21. Whether current Cloudflare service needs additions',
  '### 22. Security risks of exposing public playback URLs',
  '### 23. How to prevent a premium lecture URL from being reused indefinitely',
  '### 24. Whether a dedicated playback authorization endpoint is preferable',
  '### 25. Backward compatibility impact',
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

function readRepo(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

const selfSource = fs.readFileSync(new URL(import.meta.url), 'utf8');
const md = readBackend(MD_REL);
const mobilePkg = JSON.parse(readRepo('mobile/package.json'));
const videoRoutes = readBackend('src/routes/videoLectureRoutes.js');
const streamService = readBackend('src/services/cloudflareStreamService.js');
const lectureService = readBackend('src/services/videoLectureService.js');
const navigator = readRepo('mobile/src/navigation/AppNavigator.js');
const appJson = JSON.parse(readRepo('mobile/app.json'));

test('this verifier does not call Cloudflare or write Mongo', () => {
  assert.doesNotMatch(selfSource, /createDirectUploadUrl\s*\(/);
  assert.doesNotMatch(selfSource, /\.getVideo\s*\(/);
  assert.doesNotMatch(selfSource, /\.deleteVideo\s*\(/);
  assert.doesNotMatch(selfSource, /mongoose\.connect\s*\(/);
  assert.doesNotMatch(selfSource, /openDb\s*\(/);
  assert.doesNotMatch(selfSource, /MongoClient\s*\(/);
  assert.doesNotMatch(selfSource, /loadBackendEnv\s*\(/);
  assert.doesNotMatch(selfSource, /\.syncIndexes\s*\(/);
  assert.doesNotMatch(selfSource, /insertOne\s*\(/);
});

test('audit markdown exists', () => {
  assert.equal(fs.existsSync(path.join(backendRoot, MD_REL)), true);
});

test('audit required sections exist', () => {
  for (const heading of REQUIRED_HEADINGS) {
    assert.equal(md.includes(heading), true, `missing heading: ${heading}`);
  }
});

test('audit answers questions 1–25', () => {
  for (const marker of REQUIRED_ANSWER_MARKERS) {
    assert.equal(md.includes(marker), true, `missing answer: ${marker}`);
  }
});

test('audit records the verified lecture as premium/published', () => {
  assert.match(md, /access \| \*\*premium\*\*/);
  assert.match(md, /status \| \*\*published\*\*/);
  assert.match(md, /must \*\*not\*\* be able to play this lecture merely because it is published/);
});

test('audit separates exists, missing, and Phase 7B', () => {
  assert.match(md, /## What already exists/);
  assert.match(md, /## What is missing \(playback\)/);
  assert.match(md, /## What should be implemented in Phase 7B/);
  assert.match(md, /Out of 7B/);
});

test('mobile has no video player package installed', () => {
  const deps = { ...(mobilePkg.dependencies || {}), ...(mobilePkg.devDependencies || {}) };
  assert.equal(deps['expo-video'], undefined);
  assert.equal(deps['expo-av'], undefined);
  assert.equal(deps['react-native-video'], undefined);
  assert.ok(deps['expo-web-browser']);
});

test('mobile has no lecture playback routes or screens yet', () => {
  assert.doesNotMatch(navigator, /add-lecture|manage-lectures|LecturePlayer|LectureList/);
  assert.equal(appJson?.expo?.orientation, 'portrait');
});

test('VideoLecture HTTP API is admin-only today', () => {
  assert.match(videoRoutes, /adminChain/);
  assert.match(videoRoutes, /\/admin\/upload-url/);
  assert.doesNotMatch(videoRoutes, /\/playback/);
  assert.doesNotMatch(videoRoutes, /router\.get\(\s*'\/'/);
});

test('provisioning requires signed Stream URLs', () => {
  assert.match(lectureService, /requireSignedURLs:\s*true/);
  assert.match(streamService, /async getVideo/);
  assert.doesNotMatch(streamService, /\/stream\/\$\{.*\}\/token/);
});

test('premium truth function exists and Playlist is still absent', () => {
  const freeTier = readBackend('src/utils/freeTierAccess.js');
  const modelsIndex = readBackend('src/models/index.js');
  assert.match(freeTier, /export function isPremiumUser/);
  assert.doesNotMatch(modelsIndex, /Playlist/);
});

test('audit does not instruct implementing 7B in this phase', () => {
  assert.match(md, /Do not start Phase 7B in this change/);
  assert.match(md, /Read-only/);
});

test('audit does not embed Cloudflare/JWT secret assignment values', () => {
  assert.doesNotMatch(md, /CLOUDFLARE_STREAM_API_TOKEN=\S+/);
  assert.doesNotMatch(md, /CLOUDFLARE_STREAM_WEBHOOK_SECRET=\S+/);
  assert.doesNotMatch(md, /JWT_SECRET=\S+/);
  assert.doesNotMatch(md, /mongodb(\+srv)?:\/\//i);
});

console.log(`\n${passed} checks passed`);
console.log(
  JSON.stringify({
    ok: true,
    mongoWrites: 0,
    cloudflareVideosCreated: 0,
    directUploadInvoked: false,
    getVideoInvoked: false,
  })
);
console.log('PHASE 7A MOBILE PLAYBACK AUDIT VERIFIER: PASS');
