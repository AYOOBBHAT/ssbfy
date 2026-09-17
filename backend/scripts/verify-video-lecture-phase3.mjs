/**
 * Phase 3 VideoLecture backend foundation verifier.
 *
 * Read-only: no Mongo connect/write, no Stream direct_upload, no getVideo/deleteVideo calls.
 *
 * Run: node scripts/verify-video-lecture-phase3.mjs
 *      npm run verify:phase3-video-lecture
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VIDEO_LECTURE_ACCESS_VALUES,
  VIDEO_LECTURE_STATUS_VALUES,
} from '../src/constants/videoLecture.js';
import { VideoLecture } from '../src/models/VideoLecture.js';
import { cloudflareStreamService } from '../src/services/cloudflareStreamService.js';

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

test('VideoLecture model loads', () => {
  assert.equal(VideoLecture.modelName, 'VideoLecture');
});

test('required schema fields exist', () => {
  const paths = VideoLecture.schema.paths;
  for (const key of [
    'title',
    'description',
    'subjectId',
    'topicId',
    'cloudflareVideoId',
    'thumbnailUrl',
    'durationSeconds',
    'access',
    'status',
    'order',
    'createdAt',
    'updatedAt',
  ]) {
    assert.ok(paths[key], `missing path ${key}`);
  }
  assert.equal(paths.title.options.required, true);
  assert.equal(paths.subjectId.options.required, true);
  assert.equal(paths.topicId.options.required, true);
  assert.notEqual(paths.cloudflareVideoId.options.required, true);
  assert.equal(paths.access.options.default, 'free');
  assert.equal(paths.status.options.default, 'draft');
  assert.equal(paths.order.options.default, 0);
});

test('status and access enums exist', () => {
  assert.deepEqual(
    [...VIDEO_LECTURE_STATUS_VALUES].sort(),
    ['archived', 'draft', 'failed', 'processing', 'published', 'uploading'].sort()
  );
  assert.deepEqual([...VIDEO_LECTURE_ACCESS_VALUES].sort(), ['free', 'premium'].sort());
  assert.deepEqual(VideoLecture.schema.path('status').enumValues, VIDEO_LECTURE_STATUS_VALUES);
  assert.deepEqual(VideoLecture.schema.path('access').enumValues, VIDEO_LECTURE_ACCESS_VALUES);
});

test('cloudflareVideoId unique partial index when non-empty string', () => {
  const indexes = VideoLecture.schema.indexes();
  const uid = indexes.find((ix) => ix[1]?.name === 'uniq_videolecture_cf_uid');
  assert.ok(uid, 'uniq_videolecture_cf_uid');
  assert.equal(uid[0].cloudflareVideoId, 1);
  assert.equal(uid[1].unique, true);
  assert.equal(uid[1].partialFilterExpression?.cloudflareVideoId?.$type, 'string');
  assert.equal(uid[1].partialFilterExpression?.cloudflareVideoId?.$gt, '');
});

test('discovery and status indexes exist', () => {
  const indexes = VideoLecture.schema.indexes();
  const discovery = indexes.find((ix) => ix[1]?.name === 'idx_vl_subject_topic_status_order');
  assert.ok(discovery);
  assert.deepEqual(discovery[0], { subjectId: 1, topicId: 1, status: 1, order: 1 });
  const statusCreated = indexes.find((ix) => ix[1]?.name === 'idx_vl_status_created');
  assert.ok(statusCreated);
  assert.deepEqual(statusCreated[0], { status: 1, createdAt: -1 });
});

test('subjectId and topicId reference Subject and Topic', () => {
  assert.equal(VideoLecture.schema.path('subjectId').options.ref, 'Subject');
  assert.equal(VideoLecture.schema.path('topicId').options.ref, 'Topic');
});

test('Cloudflare service exposes createDirectUploadUrl, getVideo, and deleteVideo', () => {
  assert.equal(typeof cloudflareStreamService.createDirectUploadUrl, 'function');
  assert.equal(typeof cloudflareStreamService.getVideo, 'function');
  assert.equal(typeof cloudflareStreamService.deleteVideo, 'function');
  const streamSrc = read('src/services/cloudflareStreamService.js');
  assert.match(streamSrc, /\/stream\/direct_upload/);
  assert.match(streamSrc, /\/stream\/\$\{encodeURIComponent\(uid\)\}/);
  assert.match(streamSrc, /method:\s*'GET'/);
  assert.match(streamSrc, /method:\s*'DELETE'/);
  assert.match(streamSrc, /requireSignedURLs/);
});

test('admin routes are registered', () => {
  const routesIndex = read('src/routes/index.js');
  const lectureRoutes = read('src/routes/videoLectureRoutes.js');
  assert.match(routesIndex, /videoLectureRoutes/);
  assert.match(routesIndex, /\/video-lectures/);
  assert.match(lectureRoutes, /\/admin\/upload-url/);
  assert.match(lectureRoutes, /videoLectureController\.provisionUpload/);
  assert.match(lectureRoutes, /videoLectureController\.listAdmin/);
  assert.match(lectureRoutes, /videoLectureController\.getAdmin/);
  assert.match(lectureRoutes, /videoLectureController\.update/);
  assert.match(lectureRoutes, /videoLectureController\.archive/);
  assert.match(lectureRoutes, /adminChain/);
});

test('provisioning uses hierarchy validation and does not accept client cloudflareVideoId', () => {
  const validators = read('src/validators/videoLectureValidators.js');
  const service = read('src/services/videoLectureService.js');
  assert.match(validators, /cloudflareVideoId must not be sent by the client/);
  assert.match(service, /resolveHierarchy/);
  assert.match(service, /createDirectUploadUrl/);
  assert.match(service, /UPLOADING/);
  const start = service.indexOf('async provisionDirectUpload');
  const end = service.indexOf('async getById');
  const provision = service.slice(start, end);
  assert.doesNotMatch(provision, /status:\s*VIDEO_LECTURE_STATUS\.PUBLISHED/);
  assert.doesNotMatch(service, /req\.body\.cloudflareVideoId/);
});

test('generic update cannot set status or cloudflareVideoId', () => {
  const validators = read('src/validators/videoLectureValidators.js');
  assert.match(validators, /status cannot be changed through this endpoint/);
  assert.match(validators, /cloudflareVideoId cannot be updated/);
});

test('archive does not delete Cloudflare or Mongo documents', () => {
  const service = read('src/services/videoLectureService.js');
  const controller = read('src/controllers/videoLectureController.js');
  assert.match(service, /ARCHIVED/);
  assert.doesNotMatch(service, /cloudflareStreamService\.deleteVideo\s*\(/);
  assert.doesNotMatch(service, /findByIdAndDelete|deleteOne|deleteMany/);
  assert.doesNotMatch(controller, /cloudflareStreamService\.deleteVideo\s*\(/);
});

test('video lecture admin routes do not mount the Cloudflare webhook', () => {
  const lectureRoutes = read('src/routes/videoLectureRoutes.js');
  assert.doesNotMatch(lectureRoutes, /router\.(post|use)\(\s*['"]\/webhook/);
});

test('this verifier does not mint uploads, fetch videos, or write Mongo', () => {
  const self = fs.readFileSync(
    path.join(backendRoot, 'scripts/verify-video-lecture-phase3.mjs'),
    'utf8'
  );
  assert.doesNotMatch(self, /createDirectUploadUrl\s*\(/);
  assert.doesNotMatch(self, /provisionDirectUpload\s*\(/);
  assert.doesNotMatch(self, /\.getVideo\s*\(/);
  assert.doesNotMatch(self, /\.deleteVideo\s*\(/);
  assert.doesNotMatch(self, /mongoose\.connect\s*\(/);
  assert.doesNotMatch(self, /openDb\s*\(/);
  assert.doesNotMatch(self, /syncIndexes\s*\(/);
  const connectivity = read('scripts/verify-cloudflare-stream.mjs');
  assert.doesNotMatch(connectivity, /createDirectUploadUrl\s*\(/);
});

test('package.json has verify:phase3-video-lecture', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(
    pkg.scripts['verify:phase3-video-lecture'],
    'node scripts/verify-video-lecture-phase3.mjs'
  );
});

test('models/index exports VideoLecture', () => {
  const index = read('src/models/index.js');
  assert.match(index, /export \{ VideoLecture \}/);
});

test('new lecture files do not call syncIndexes', () => {
  const files = [
    'src/models/VideoLecture.js',
    'src/services/videoLectureService.js',
    'src/controllers/videoLectureController.js',
    'src/routes/videoLectureRoutes.js',
  ];
  for (const rel of files) {
    assert.doesNotMatch(read(rel), /syncIndexes\s*\(/);
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
    deleteVideoInvoked: false,
  })
);
console.log('PHASE 3 VIDEO LECTURE VERIFIER: PASS');
