/**
 * Phase 5 Admin Video Lecture UI — static contract verifier.
 *
 * Does NOT upload a video, mint a Cloudflare URL, or write Mongo.
 *
 * Run from admin/: node scripts/verify-video-lecture-phase5.mjs
 *                 npm run verify:phase5-video-lecture
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.join(here, '..');
const repoRoot = path.join(adminRoot, '..');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function readAdmin(rel) {
  return fs.readFileSync(path.join(adminRoot, rel), 'utf8');
}

function readRepo(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function walkFiles(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === '.git') {
      continue;
    }
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

test('Add Lecture route exists', () => {
  const app = readAdmin('src/App.jsx');
  assert.match(app, /path=["']\/add-lecture["']/);
  assert.match(app, /AddLecture/);
  assert.equal(fs.existsSync(path.join(adminRoot, 'src/pages/AddLecture.jsx')), true);
});

test('Manage Lectures route exists', () => {
  const app = readAdmin('src/App.jsx');
  assert.match(app, /path=["']\/manage-lectures["']/);
  assert.match(app, /ManageLectures/);
  assert.doesNotMatch(app, /\/lectures\/new/);
});

test('Admin authorization is preserved', () => {
  const app = readAdmin('src/App.jsx');
  assert.match(app, /RequireAdmin/);
  const addIdx = app.indexOf('/add-lecture');
  const manageIdx = app.indexOf('/manage-lectures');
  const requireIdx = app.indexOf('RequireAdmin');
  assert.ok(requireIdx > 0 && addIdx > requireIdx && manageIdx > requireIdx);
});

test('Subject selector exists and Topic depends on Subject', () => {
  const add = readAdmin('src/pages/AddLecture.jsx');
  assert.match(add, /getSubjects/);
  assert.match(add, /getTopics/);
  assert.match(add, /topicId:\s*['"]['"]/);
  assert.match(add, /disabled=\{[^}]*!form\.subjectId/);
});

test('Upload URL API uses existing endpoint', () => {
  const api = readAdmin('src/services/api.js');
  const add = readAdmin('src/pages/AddLecture.jsx');
  assert.match(api, /\/video-lectures\/admin\/upload-url/);
  assert.match(add, /provisionLectureUploadUrl/);
  assert.match(add, /maxDurationSeconds/);
  assert.doesNotMatch(add, /cloudflareVideoId/);
});

test('Video bytes are not sent to SSBFY backend', () => {
  const add = readAdmin('src/pages/AddLecture.jsx');
  const api = readAdmin('src/services/api.js');
  const lectureApi = api.slice(api.indexOf('Video lectures'));
  assert.match(add, /uploadVideoToCloudflare/);
  assert.doesNotMatch(add, /FormData/);
  assert.doesNotMatch(lectureApi, /FormData/);
  assert.doesNotMatch(lectureApi, /append\(/);
});

test('Cloudflare token/secret are not referenced by admin frontend', () => {
  const files = walkFiles(path.join(adminRoot, 'src'));
  for (const file of files) {
    if (!/\.(js|jsx|css)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /CLOUDFLARE_STREAM_API_TOKEN/);
    assert.doesNotMatch(text, /CLOUDFLARE_STREAM_WEBHOOK_SECRET/);
    assert.doesNotMatch(text, /CLOUDFLARE_ACCOUNT_ID/);
    assert.doesNotMatch(text, /JWT_SECRET/);
  }
});

test('Cloudflare upload URL is used for browser upload', () => {
  const util = readAdmin('src/utils/cloudflareDirectUpload.js');
  const add = readAdmin('src/pages/AddLecture.jsx');
  assert.match(util, /uploadURL/);
  assert.match(util, /FormData/);
  assert.match(util, /isTusUploadUrl/);
  assert.doesNotMatch(util, /Authorization/);
  assert.match(add, /uploadURL/);
  assert.doesNotMatch(add, /localStorage/);
});

test('Published state comes from backend status, not frontend assumption', () => {
  const add = readAdmin('src/pages/AddLecture.jsx');
  assert.match(add, /getAdminLecture/);
  assert.match(add, /LECTURE_STATUS\.PUBLISHED/);
  assert.doesNotMatch(add, /setPhase\(\s*['"]published['"]\s*\)\s*;\s*\n\s*await sendFileToCloudflare/);
  assert.match(add, /pollUntilTerminal/);
});

test('Manage, edit, and archive endpoints are used', () => {
  const api = readAdmin('src/services/api.js');
  const manage = readAdmin('src/pages/ManageLectures.jsx');
  assert.match(api, /\/video-lectures\/admin['"`]/);
  assert.match(api, /\/video-lectures\/admin\/\$\{id\}/);
  assert.match(api, /\/video-lectures\/admin\/\$\{id\}\/archive/);
  assert.match(manage, /listAdminLectures/);
  assert.match(manage, /updateAdminLecture/);
  assert.match(manage, /archiveAdminLecture/);
  assert.doesNotMatch(manage, /cloudflareVideoId/);
  assert.doesNotMatch(manage, /status:\s*edit/);
});

test('Playlist files are not introduced', () => {
  const srcFiles = walkFiles(path.join(adminRoot, 'src')).map((f) =>
    path.relative(adminRoot, f).replace(/\\/g, '/')
  );
  assert.equal(srcFiles.some((f) => /playlist/i.test(f)), false);
  const add = readAdmin('src/pages/AddLecture.jsx');
  const manage = readAdmin('src/pages/ManageLectures.jsx');
  assert.doesNotMatch(add, /playlist/i);
  assert.doesNotMatch(manage, /playlist/i);
});

test('Existing VideoLecture backend contracts remain unchanged in this verifier', () => {
  const validators = readRepo('backend/src/validators/videoLectureValidators.js');
  assert.match(validators, /maxDurationSeconds/);
  assert.match(validators, /cloudflareVideoId must not be sent by the client/);
  assert.match(validators, /status cannot be changed through this endpoint/);
});

test('No syncIndexes() added in admin lecture files', () => {
  const files = [
    'src/pages/AddLecture.jsx',
    'src/pages/ManageLectures.jsx',
    'src/utils/cloudflareDirectUpload.js',
    'src/services/api.js',
  ];
  for (const rel of files) {
    assert.doesNotMatch(readAdmin(rel), /syncIndexes\s*\(/);
  }
});

test('this verifier does not mint uploads or write Mongo', () => {
  const self = fs.readFileSync(path.join(here, 'verify-video-lecture-phase5.mjs'), 'utf8');
  assert.doesNotMatch(self, /provisionLectureUploadUrl\s*\(/);
  assert.doesNotMatch(self, /createDirectUploadUrl\s*\(/);
  assert.doesNotMatch(self, /mongoose\.connect\s*\(/);
  assert.doesNotMatch(self, /openDb\s*\(/);
  assert.doesNotMatch(self, /uploadVideoToCloudflare\s*\(/);
});

test('Navbar and dashboard include lecture navigation', () => {
  const nav = readAdmin('src/components/Navbar.jsx');
  const dash = readAdmin('src/pages/Dashboard.jsx');
  assert.match(nav, /\/add-lecture/);
  assert.match(nav, /\/manage-lectures/);
  assert.match(dash, /Video Lectures/);
  assert.match(dash, /\/add-lecture/);
});

console.log(`\n${passed} checks passed`);
console.log(
  JSON.stringify({
    ok: true,
    mongoWrites: 0,
    cloudflareVideosCreated: 0,
    directUploadInvoked: false,
  })
);
console.log('PHASE 5 ADMIN VIDEO LECTURE VERIFIER: PASS');
