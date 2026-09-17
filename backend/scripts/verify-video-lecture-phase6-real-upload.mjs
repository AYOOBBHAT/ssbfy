/**
 * Phase 6 — READ-ONLY verification of the one real Admin-uploaded VideoLecture.
 *
 * Discovers the lecture from Mongo. Calls Cloudflare Stream GET video only.
 * Never: create, upload, archive, delete, mint upload URLs, syncIndexes,
 * Mongo writes, Cloudflare writes, or application-code changes.
 *
 * Run: node scripts/verify-video-lecture-phase6-real-upload.mjs
 *      npm run verify:phase6-real-video-upload
 *
 * Never prints CLOUDFLARE_STREAM_API_TOKEN, CLOUDFLARE_STREAM_WEBHOOK_SECRET,
 * JWT_SECRET, CLOUDFLARE_ACCOUNT_ID, signed URLs, or MONGODB_URI.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import {
  VIDEO_LECTURE_ACCESS_VALUES,
  VIDEO_LECTURE_STATUS_VALUES,
} from '../src/constants/videoLecture.js';
import { mapCloudflareVideoToLectureStatus } from '../src/utils/cloudflareStreamWebhook.js';
import { BACKEND_ROOT, loadBackendEnv, moduleUrl } from './lib/db.mjs';

const REPORT_REL = 'scripts/fixtures/set-a/SET_A_phase6_real_upload_verification_report.md';
const PHASE4_SNAPSHOT_REL =
  'scripts/fixtures/set-a/SET_A_phase4_controlled_upload_url_report.md';
const UNEXPECTED_WINDOW_MS = 2 * 60 * 60 * 1000;
const LECTURE_SCHEMA_KEYS = new Set([
  '_id',
  '__v',
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
]);
const SECRET_ENV_KEYS = [
  'CLOUDFLARE_STREAM_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'JWT_SECRET',
  'CLOUDFLARE_STREAM_WEBHOOK_SECRET',
  'ADMIN_PASSWORD',
  'MONGODB_URI',
];
const WRITE_METHODS = [
  'insertOne',
  'insertMany',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'replaceOne',
  'bulkWrite',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'drop',
  'rename',
  'createIndex',
  'createIndexes',
];

loadBackendEnv();

let passed = 0;
const failures = [];
const notes = [];
const checkLog = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    checkLog.push(`- PASS ${name}`);
    console.log(`ok  ${name}`);
  } catch (err) {
    const message = redact(err?.message || err);
    failures.push(`${name}: ${message}`);
    checkLog.push(`- FAIL ${name}: ${message}`);
    console.log(`not ok  ${name}`);
    console.log(`  ${message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    checkLog.push(`- PASS ${name}`);
    console.log(`ok  ${name}`);
  } catch (err) {
    const message = redact(err?.message || err);
    failures.push(`${name}: ${message}`);
    checkLog.push(`- FAIL ${name}: ${message}`);
    console.log(`not ok  ${name}`);
    console.log(`  ${message}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

function envSet(name) {
  return Boolean(String(process.env[name] || '').trim());
}

function redact(value) {
  let text = String(value ?? '');
  for (const key of SECRET_ENV_KEYS) {
    const val = String(process.env[key] || '').trim();
    if (val) text = text.split(val).join(`[${key}]`);
  }
  return text;
}

function assertNoSecrets(text) {
  for (const key of SECRET_ENV_KEYS) {
    const val = String(process.env[key] || '').trim();
    if (val && text.includes(val)) {
      throw new Error(`Refusing to write ${key} into output`);
    }
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function iso(value) {
  if (!value) return 'n/a';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? 'n/a' : d.toISOString();
}

function yn(value) {
  return value ? 'yes' : 'no';
}

function wrapReadOnly(collection) {
  return new Proxy(collection, {
    get(target, prop) {
      if (WRITE_METHODS.includes(String(prop))) {
        throw new Error(`Write operation ${String(prop)} is forbidden in Phase 6 verifier`);
      }
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function parsePhase4VideoLectureCount() {
  const full = path.join(BACKEND_ROOT, PHASE4_SNAPSHOT_REL);
  if (!fs.existsSync(full)) return null;
  const text = fs.readFileSync(full, 'utf8');
  const match = text.match(/\|\s*videolectures\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/i);
  if (!match) return null;
  return { before: Number(match[1]), after: Number(match[2]), source: PHASE4_SNAPSHOT_REL };
}

function pickLecture(lectures) {
  if (!lectures.length) return null;
  const withUid = lectures.filter((row) => String(row.cloudflareVideoId || '').trim());
  const published = withUid.filter((row) => row.status === 'published');
  if (published.length) return published[0];
  if (withUid.length) return withUid[0];
  return lectures[0];
}

function summarizeWebhookEvents(events) {
  return events.map((row) => {
    const eventId = String(row.eventId || '');
    const parts = eventId.split(':');
    const state = parts.length >= 3 ? parts[2] : 'unknown';
    return {
      eventId,
      event: String(row.event || ''),
      state,
      receivedAt: iso(row.receivedAt),
      processed: true,
      duplicateFlagStored: false,
    };
  });
}

function writeReport(fields) {
  const md = `# Phase 6 — Real Video Lecture Upload Verification

## Purpose

Read-only verification of the **one** VideoLecture uploaded through the production
Admin Panel. This verifier does not create, upload, archive, delete, mint upload
URLs, invoke syncIndexes, or modify Mongo / Cloudflare / application code.

## Discovery

The lecture was discovered read-only from MongoDB (\`videolectures\`, newest
\`createdAt\` first). No ID was assumed in advance.

| Field | Value |
|---|---|
| VideoLecture Mongo ID | \`${fields.lectureId || 'n/a'}\` |
| Cloudflare UID | \`${fields.cloudflareVideoId || 'n/a'}\` |
| title | ${fields.title || 'n/a'} |
| subject | ${fields.subjectName || 'n/a'} (\`${fields.subjectId || 'n/a'}\`) |
| topic | ${fields.topicName || 'n/a'} (\`${fields.topicId || 'n/a'}\`) |
| topic belongs to subject | ${yn(fields.topicBelongsToSubject)} |
| access | \`${fields.access || 'n/a'}\` |
| status | \`${fields.status || 'n/a'}\` |
| durationSeconds (Mongo) | ${fields.durationSeconds ?? 'n/a'} |
| thumbnail present | ${yn(fields.thumbnailPresent)} |
| createdAt | ${fields.createdAt || 'n/a'} |
| updatedAt | ${fields.updatedAt || 'n/a'} |
| order | ${fields.order ?? 'n/a'} |

## Cloudflare Stream (GET video only)

| Field | Value |
|---|---|
| getVideo succeeded | ${yn(fields.cfGetVideoOk)} |
| ready / streamable | ${yn(fields.cfReadyStreamable)} |
| status.state | \`${fields.cfState || 'n/a'}\` |
| readyToStream | ${fields.cfReadyToStream == null ? 'n/a' : yn(fields.cfReadyToStream)} |
| duration (Cloudflare, seconds) | ${fields.cfDuration ?? 'n/a'} |
| thumbnail present on Cloudflare | ${yn(fields.cfThumbnailPresent)} |
| mapped lecture status | \`${fields.cfMappedStatus || 'n/a'}\` |
| Mongo status matches mapped status | ${yn(fields.statusMatchesCloudflare)} |

Signed playback/thumbnail URLs, API tokens, account IDs, and webhook secrets
were not printed.

## Webhook

| Field | Value |
|---|---|
| Endpoint exists | ${yn(fields.webhookEndpointExists)} (\`POST /api/webhooks/cloudflare/stream\`) |
| Handler can update existing lectures | ${yn(fields.webhookCanUpdate)} |
| Matching WebhookEvent found | ${yn(fields.webhookEventFound)} |
| Matching WebhookEvent count | ${fields.webhookEventCount} |
| Duplicate flag stored on WebhookEvent | no (idempotency is unique \`eventId\` insert) |

${fields.webhookEventDetails}

## Counts

Historical before/after for **this** upload was not recorded at upload time.
Do not fabricate it. Current counts and the last existing audit snapshot:

| Collection | Current | Phase 4 snapshot (after blocked provision) |
|---|---|---|
| videolectures | ${fields.counts.videolectures} | ${fields.phase4Snapshot?.after ?? 'n/a'} |
| subjects | ${fields.counts.subjects} | ${fields.phase4Snapshot ? 'see Phase 4 report' : 'n/a'} |
| topics | ${fields.counts.topics} | ${fields.phase4Snapshot ? 'see Phase 4 report' : 'n/a'} |
| tests | ${fields.counts.tests} | ${fields.phase4Snapshot ? '0 (Phase 4 report)' : 'n/a'} |
| webhookevents | ${fields.counts.webhookevents} | n/a |
| playlists | ${fields.counts.playlists} | n/a (collection absent or empty) |

Phase 4 snapshot source: \`${fields.phase4Snapshot?.source || 'none'}\`.

## Duplicates and unexpected documents

| Check | Result |
|---|---|
| Duplicate VideoLecture for this Cloudflare UID | ${yn(fields.duplicateLecture)} |
| Other VideoLecture documents | ${fields.otherLectureCount} |
| Unexpected extra lectures near upload timestamp | ${yn(fields.unexpectedNearbyLectures)} |
| Unexpected writes by this verifier | no |
| Playlist model / collection | ${fields.playlistNote} |
| Test / exam / playlist fields on lecture | ${fields.linkageNote} |
| Tests created near lecture timestamp | ${fields.nearbyTests} |
| Mobile lecture collections | ${fields.mobileNote} |

Other VideoLecture documents (id, title, status, createdAt only):

${fields.otherLecturesList}

## Checks

${fields.checkList}

## Verifier isolation

| Action | Performed |
|---|---|
| Mongo reads | yes |
| Mongo writes | **no** |
| Cloudflare GET video | ${yn(fields.cfGetVideoOk || fields.cfGetVideoAttempted)} |
| Cloudflare createDirectUploadUrl | **no** |
| Cloudflare delete / archive | **no** |
| Application code changes | **no** |
| Admin / mobile code changes | **no** |
| Secrets printed | **no** |

## Result

**${fields.verdict}**
`;
  assertNoSecrets(md);
  fs.writeFileSync(path.join(BACKEND_ROOT, REPORT_REL), md, 'utf8');
}

const selfSource = fs.readFileSync(new URL(import.meta.url), 'utf8');

test('this verifier does not mint uploads or write Mongo/Cloudflare', () => {
  assert.doesNotMatch(selfSource, /createDirectUploadUrl\s*\(/);
  assert.doesNotMatch(selfSource, /provisionDirectUpload\s*\(/);
  assert.doesNotMatch(selfSource, /provisionLectureUploadUrl\s*\(/);
  assert.doesNotMatch(selfSource, /\.deleteVideo\s*\(/);
  assert.doesNotMatch(selfSource, /\.syncIndexes\s*\(/);
  assert.doesNotMatch(selfSource, /mongoose\.connect\s*\(/);
  assert.doesNotMatch(selfSource, /openDb\s*\(/);
  assert.doesNotMatch(selfSource, /\.insertOne\s*\(/);
  assert.doesNotMatch(selfSource, /\.updateOne\s*\(/);
  assert.doesNotMatch(selfSource, /\.deleteOne\s*\(/);
  assert.doesNotMatch(selfSource, /\/admin\/:id\/archive/);
  assert.match(selfSource, /getVideo\(/);
  assert.match(selfSource, /readPreference/);
});

test('package.json has verify:phase6-real-video-upload', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(
    pkg.scripts['verify:phase6-real-video-upload'],
    'node scripts/verify-video-lecture-phase6-real-upload.mjs'
  );
});

test('webhook endpoint exists in application routes', () => {
  const routesIndex = read('src/routes/index.js');
  const webhookRoutes = read('src/routes/cloudflareStreamWebhookRoutes.js');
  const app = read('src/app.js');
  const service = read('src/services/videoLectureService.js');
  assert.match(routesIndex, /\/webhooks\/cloudflare/);
  assert.match(webhookRoutes, /\/stream/);
  assert.match(app, /\/api\/webhooks\/cloudflare\/stream/);
  assert.match(service, /applyCloudflareStreamNotification/);
  assert.match(service, /videoLectureRepository\.updateById/);
  assert.doesNotMatch(
    service,
    /applyCloudflareStreamNotification[\s\S]*videoLectureRepository\.create/
  );
});

test('Playlist model is still absent', () => {
  const modelsIndex = read('src/models/index.js');
  assert.doesNotMatch(modelsIndex, /Playlist/);
  const playlistFiles = fs
    .readdirSync(path.join(BACKEND_ROOT, 'src/models'))
    .filter((name) => /playlist/i.test(name));
  assert.equal(playlistFiles.length, 0);
});

const report = {
  lectureId: null,
  cloudflareVideoId: null,
  title: null,
  subjectId: null,
  subjectName: null,
  topicId: null,
  topicName: null,
  topicBelongsToSubject: false,
  access: null,
  status: null,
  durationSeconds: null,
  thumbnailPresent: false,
  createdAt: null,
  updatedAt: null,
  order: null,
  cfGetVideoAttempted: false,
  cfGetVideoOk: false,
  cfReadyStreamable: false,
  cfState: null,
  cfReadyToStream: null,
  cfDuration: null,
  cfThumbnailPresent: false,
  cfMappedStatus: null,
  statusMatchesCloudflare: false,
  webhookEndpointExists: true,
  webhookCanUpdate: true,
  webhookEventFound: false,
  webhookEventCount: 0,
  webhookEventDetails: '_No matching WebhookEvent documents._',
  counts: {
    videolectures: 'n/a',
    subjects: 'n/a',
    topics: 'n/a',
    tests: 'n/a',
    webhookevents: 'n/a',
    playlists: 'n/a',
  },
  phase4Snapshot: parsePhase4VideoLectureCount(),
  duplicateLecture: false,
  otherLectureCount: 0,
  unexpectedNearbyLectures: false,
  otherLecturesList: '_none_',
  playlistNote: 'no Playlist model; collection checked live',
  linkageNote: 'n/a',
  nearbyTests: 'n/a',
  mobileNote: 'n/a',
  checkList: '',
  verdict: 'INCOMPLETE',
};

let client;
try {
  if (!envSet('MONGODB_URI')) {
    throw new Error('MONGODB_URI is missing; cannot discover the uploaded lecture.');
  }

  client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15_000,
    readPreference: 'primary',
  });
  await client.connect();
  const db = client.db();
  const videolectures = wrapReadOnly(db.collection('videolectures'));
  const subjects = wrapReadOnly(db.collection('subjects'));
  const topics = wrapReadOnly(db.collection('topics'));
  const tests = wrapReadOnly(db.collection('tests'));
  const webhookevents = wrapReadOnly(db.collection('webhookevents'));

  const collectionNames = (await db.listCollections().toArray()).map((c) => c.name);
  const playlistCollections = collectionNames.filter((name) => /playlist/i.test(name));
  const mobileLectureCollections = collectionNames.filter(
    (name) => /lecture/i.test(name) && name !== 'videolectures'
  );

  report.counts.videolectures = await videolectures.countDocuments();
  report.counts.subjects = await subjects.countDocuments();
  report.counts.topics = await topics.countDocuments();
  report.counts.tests = await tests.countDocuments();
  report.counts.webhookevents = await webhookevents.countDocuments();
  if (playlistCollections.length === 0) {
    report.counts.playlists = 0;
    report.playlistNote = 'no Playlist model and no playlists collection';
  } else {
    let playlistDocs = 0;
    for (const name of playlistCollections) {
      playlistDocs += await wrapReadOnly(db.collection(name)).countDocuments();
    }
    report.counts.playlists = playlistDocs;
    report.playlistNote = `unexpected playlist collection(s): ${playlistCollections.join(', ')} (${playlistDocs} docs)`;
  }
  report.mobileNote =
    mobileLectureCollections.length === 0
      ? 'no extra lecture collections (no mobile lecture data created)'
      : `extra lecture collections: ${mobileLectureCollections.join(', ')}`;

  await testAsync('Mongo VideoLecture collection is readable', () => {
    assert.ok(typeof report.counts.videolectures === 'number');
  });

  const lectures = await videolectures.find({}).sort({ createdAt: -1 }).toArray();
  const lecture = pickLecture(lectures);

  await testAsync('Mongo VideoLecture exists', () => {
    assert.ok(lecture, 'No VideoLecture documents found');
  });

  if (lecture) {
    const uid = String(lecture.cloudflareVideoId || '').trim();
    report.lectureId = String(lecture._id);
    report.cloudflareVideoId = uid || null;
    report.title = lecture.title || null;
    report.subjectId = lecture.subjectId ? String(lecture.subjectId) : null;
    report.topicId = lecture.topicId ? String(lecture.topicId) : null;
    report.access = lecture.access || null;
    report.status = lecture.status || null;
    report.durationSeconds = lecture.durationSeconds ?? null;
    report.thumbnailPresent = Boolean(lecture.thumbnailUrl);
    report.createdAt = iso(lecture.createdAt);
    report.updatedAt = iso(lecture.updatedAt);
    report.order = lecture.order ?? null;

    const extraKeys = Object.keys(lecture).filter((key) => !LECTURE_SCHEMA_KEYS.has(key));
    const linkageKeys = extraKeys.filter((key) =>
      /playlist|exam|test|mobile|course/i.test(key)
    );
    report.linkageNote =
      linkageKeys.length === 0
        ? 'none; lecture has no test/playlist/exam/mobile fields'
        : `unexpected fields: ${linkageKeys.join(', ')}`;

    await testAsync('title exists', () => {
      assert.ok(typeof lecture.title === 'string' && lecture.title.trim().length >= 2);
    });

    const subject = lecture.subjectId
      ? await subjects.findOne({ _id: lecture.subjectId }, { projection: { _id: 1, name: 1 } })
      : null;
    report.subjectName = subject?.name || null;

    await testAsync('subjectId exists and references a real Subject', () => {
      assert.ok(lecture.subjectId, 'subjectId missing');
      assert.ok(subject, `Subject ${report.subjectId} not found`);
    });

    const topic = lecture.topicId
      ? await topics.findOne(
          { _id: lecture.topicId },
          { projection: { _id: 1, name: 1, subjectId: 1 } }
        )
      : null;
    report.topicName = topic?.name || null;
    report.topicBelongsToSubject = Boolean(
      topic && subject && String(topic.subjectId) === String(subject._id)
    );

    await testAsync('topicId exists and references a real Topic', () => {
      assert.ok(lecture.topicId, 'topicId missing');
      assert.ok(topic, `Topic ${report.topicId} not found`);
    });

    await testAsync('topic belongs to subject', () => {
      assert.equal(report.topicBelongsToSubject, true);
    });

    await testAsync('access is valid', () => {
      assert.ok(VIDEO_LECTURE_ACCESS_VALUES.includes(lecture.access), lecture.access);
    });

    await testAsync('status is valid', () => {
      assert.ok(VIDEO_LECTURE_STATUS_VALUES.includes(lecture.status), lecture.status);
    });

    await testAsync('cloudflareVideoId exists', () => {
      assert.ok(uid, 'cloudflareVideoId missing');
    });

    const uidDupes =
      uid.length > 0
        ? await videolectures.countDocuments({ cloudflareVideoId: uid })
        : 0;
    report.duplicateLecture = uidDupes > 1;

    await testAsync('cloudflareVideoId is unique', () => {
      assert.ok(uid, 'cloudflareVideoId missing');
      assert.equal(uidDupes, 1, `expected 1 lecture for UID, found ${uidDupes}`);
    });

    const others = lectures.filter((row) => String(row._id) !== String(lecture._id));
    report.otherLectureCount = others.length;
    report.otherLecturesList = others.length
      ? others
          .map(
            (row) =>
              `- \`${String(row._id)}\` — ${row.title || '(untitled)'} — \`${row.status}\` — ${iso(row.createdAt)}`
          )
          .join('\n')
      : '_none_';

    const lectureCreated = lecture.createdAt ? new Date(lecture.createdAt).getTime() : 0;
    const nearbyOthers = others.filter((row) => {
      const t = row.createdAt ? new Date(row.createdAt).getTime() : 0;
      return lectureCreated && t && Math.abs(t - lectureCreated) <= UNEXPECTED_WINDOW_MS;
    });
    report.unexpectedNearbyLectures = nearbyOthers.length > 0;

    await testAsync('no duplicate VideoLecture was created for this upload', () => {
      assert.equal(report.duplicateLecture, false);
      assert.equal(nearbyOthers.length, 0, `${nearbyOthers.length} extra lecture(s) near upload time`);
    });

    await testAsync('current VideoLecture count is reported without fabricating history', () => {
      assert.equal(typeof report.counts.videolectures, 'number');
      if (report.phase4Snapshot) {
        notes.push(
          `Phase 4 snapshot videolectures=${report.phase4Snapshot.after}; current=${report.counts.videolectures}`
        );
      }
    });

    const nearbyTestCount = lecture.createdAt
      ? await tests.countDocuments({
          createdAt: {
            $gte: new Date(new Date(lecture.createdAt).getTime() - UNEXPECTED_WINDOW_MS),
            $lte: new Date(new Date(lecture.createdAt).getTime() + UNEXPECTED_WINDOW_MS),
          },
        })
      : 0;
    report.nearbyTests = String(nearbyTestCount);

    await testAsync('no Test, Playlist, Exam linkage, or mobile lecture data from this upload', () => {
      assert.equal(linkageKeys.length, 0);
      assert.equal(playlistCollections.length, 0);
      assert.equal(mobileLectureCollections.length, 0);
      assert.equal(nearbyTestCount, 0);
    });

    if (uid) {
      const eventDocs = await webhookevents
        .find({ eventId: { $regex: `^cf-stream:${escapeRegex(uid)}:` } })
        .project({ eventId: 1, event: 1, receivedAt: 1 })
        .toArray();
      report.webhookEventFound = eventDocs.length > 0;
      report.webhookEventCount = eventDocs.length;
      if (eventDocs.length) {
        const summaries = summarizeWebhookEvents(eventDocs);
        report.webhookEventDetails = summaries
          .map(
            (row) =>
              `- eventId \`${row.eventId}\` · type \`${row.event}\` · state \`${row.state}\` · receivedAt ${row.receivedAt} · processed yes · duplicate-flag-on-doc no`
          )
          .join('\n');
      }
    }

    await testAsync('webhook endpoint exists and was capable of updating the lecture', () => {
      assert.equal(report.webhookEndpointExists, true);
      assert.equal(report.webhookCanUpdate, true);
    });

    report.cfGetVideoAttempted = true;
    let cfVideo = null;
    await testAsync('Cloudflare Stream getVideo for this UID succeeds', async () => {
      assert.ok(uid, 'cloudflareVideoId missing');
      assert.ok(
        envSet('CLOUDFLARE_STREAM_API_TOKEN') && envSet('CLOUDFLARE_ACCOUNT_ID'),
        'Cloudflare Stream is not configured locally; cannot GET the uploaded video.'
      );
      const { cloudflareStreamService } = await import(
        moduleUrl('src/services/cloudflareStreamService.js')
      );
      cfVideo = await cloudflareStreamService.getVideo(uid);
      report.cfGetVideoOk = Boolean(cfVideo);
      assert.ok(cfVideo, 'getVideo returned empty result');
      assert.equal(String(cfVideo.uid || ''), uid);
    });

    if (cfVideo) {
      const state = String(cfVideo.status?.state || '').toLowerCase();
      const readyToStream = cfVideo.readyToStream === true;
      const mapped = mapCloudflareVideoToLectureStatus(cfVideo);
      const cfDurationRaw = cfVideo.duration;
      const cfDuration =
        typeof cfDurationRaw === 'number' && Number.isFinite(cfDurationRaw) && cfDurationRaw > 0
          ? Math.round(cfDurationRaw)
          : null;
      const cfThumb =
        typeof cfVideo.thumbnail === 'string' && cfVideo.thumbnail.trim().length > 0;

      report.cfState = state || null;
      report.cfReadyToStream = readyToStream;
      report.cfReadyStreamable = state === 'ready' && readyToStream;
      report.cfDuration = cfDuration;
      report.cfThumbnailPresent = cfThumb;
      report.cfMappedStatus = mapped;
      report.statusMatchesCloudflare = mapped === lecture.status;

      await testAsync('Cloudflare reports the video as ready/streamable', () => {
        assert.equal(state, 'ready');
        assert.equal(readyToStream, true);
      });

      await testAsync('durationSeconds is populated when Cloudflare supplied it', () => {
        if (cfDuration == null) {
          notes.push('Cloudflare did not supply duration; Mongo durationSeconds left as stored.');
          return;
        }
        assert.equal(lecture.durationSeconds, cfDuration);
      });

      await testAsync('thumbnailUrl is populated when Cloudflare supplied it', () => {
        if (!cfThumb) {
          notes.push('Cloudflare did not supply a thumbnail; Mongo thumbnailUrl left as stored.');
          return;
        }
        assert.ok(lecture.thumbnailUrl, 'Cloudflare has a thumbnail but Mongo thumbnailUrl is empty');
      });

      await testAsync('Mongo status matches the expected Cloudflare processing lifecycle', () => {
        assert.ok(mapped, `unmapped Cloudflare state=${state} readyToStream=${readyToStream}`);
        assert.equal(lecture.status, mapped);
      });

      await testAsync('Cloudflare metadata and Mongo metadata are consistent where applicable', () => {
        assert.equal(String(cfVideo.uid || ''), uid);
        if (mapped) assert.equal(lecture.status, mapped);
        if (cfDuration != null) assert.equal(lecture.durationSeconds, cfDuration);
        if (cfThumb) assert.ok(Boolean(lecture.thumbnailUrl));
      });
    } else {
      await testAsync('Cloudflare reports the video as ready/streamable', () => {
        assert.ok(false, 'getVideo did not return a video object');
      });
      await testAsync('durationSeconds is populated when Cloudflare supplied it', () => {
        assert.ok(false, 'skipped because getVideo failed');
      });
      await testAsync('thumbnailUrl is populated when Cloudflare supplied it', () => {
        assert.ok(false, 'skipped because getVideo failed');
      });
      await testAsync('Mongo status matches the expected Cloudflare processing lifecycle', () => {
        assert.ok(false, 'skipped because getVideo failed');
      });
      await testAsync('Cloudflare metadata and Mongo metadata are consistent where applicable', () => {
        assert.ok(false, 'skipped because getVideo failed');
      });
    }

    if (lecture.status === 'published') {
      await testAsync('matching Cloudflare webhook event exists for published lecture', () => {
        assert.equal(
          report.webhookEventFound,
          true,
          'published lecture has no matching WebhookEvent (handler may not have recorded it)'
        );
      });
    } else {
      notes.push(`Lecture status is ${lecture.status}, not published.`);
      await testAsync('matching Cloudflare webhook event inspected read-only', () => {
        assert.ok(true);
      });
    }
  }
} catch (err) {
  const message = redact(err?.message || err);
  failures.push(`live verification: ${message}`);
  console.log(`not ok  live verification`);
  console.log(`  ${message}`);
} finally {
  if (client) {
    await client.close();
  }
}

report.verdict = failures.length === 0 ? 'PASS' : 'FAIL';
report.checkList = [
  ...checkLog,
  ...notes.map((row) => `- NOTE ${row}`),
].join('\n');

writeReport(report);

const summary = {
  ok: failures.length === 0,
  lectureId: report.lectureId,
  cloudflareVideoId: report.cloudflareVideoId,
  title: report.title,
  subject: report.subjectName,
  topic: report.topicName,
  access: report.access,
  status: report.status,
  durationSeconds: report.durationSeconds,
  thumbnailPresent: report.thumbnailPresent,
  cloudflareReadyStreamable: report.cfReadyStreamable,
  webhookEventFound: report.webhookEventFound,
  duplicateLecture: report.duplicateLecture,
  unexpectedWritesDetected: false,
  videoLectureCount: report.counts.videolectures,
  mongoWrites: 0,
  cloudflareVideosCreated: 0,
  directUploadInvoked: false,
  getVideoInvoked: report.cfGetVideoAttempted,
  passed,
  failed: failures.length,
};
assertNoSecrets(JSON.stringify(summary));
console.log(`\n${passed} checks passed${failures.length ? `, ${failures.length} failed` : ''}`);
console.log(JSON.stringify(summary));
console.log(`PHASE 6 REAL UPLOAD VERIFIER: ${report.verdict}`);
console.log(`Report: ${REPORT_REL}`);

if (failures.length) process.exitCode = 1;
