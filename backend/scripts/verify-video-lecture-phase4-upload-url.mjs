/**
 * PHASE 4 STEP 4 — ONE real Cloudflare Stream *provisioning* (UID + upload URL).
 *
 * WARNING:
 *   This script performs ONE real Cloudflare Stream direct-upload provisioning
 *   via POST /api/video-lectures/admin/upload-url.
 *   It does NOT upload video bytes.
 *   It does NOT call delete.
 *   If a lecture titled PHASE4_CF_UPLOAD_TEST_2026 already exists, it will not
 *   mint a second UID.
 *
 * Run: node scripts/verify-video-lecture-phase4-upload-url.mjs
 *      npm run verify:phase4-upload-url
 *
 * Never prints CLOUDFLARE_STREAM_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, JWT_SECRET,
 * or CLOUDFLARE_STREAM_WEBHOOK_SECRET.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { BACKEND_ROOT, loadBackendEnv, moduleUrl } from './lib/db.mjs';

const TITLE = 'PHASE4_CF_UPLOAD_TEST_2026';
const DESCRIPTION = 'Temporary technical verification only';
const ACCESS = 'free';
const REQUESTED_ORDER = 9999;
const MAX_DURATION_SECONDS = 60;
const PREFERRED_SUBJECT = 'Agriculture';
const PREFERRED_TOPIC = 'Agricultural Policy and Institutions';
const API_BASE_DEFAULT = 'https://api.jkssbfy.in';
const REPORT_REL = 'scripts/fixtures/set-a/SET_A_phase4_controlled_upload_url_report.md';

const SECRET_ENV_KEYS = [
  'CLOUDFLARE_STREAM_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'JWT_SECRET',
  'CLOUDFLARE_STREAM_WEBHOOK_SECRET',
  'ADMIN_PASSWORD',
];

console.log(`
============================================================
WARNING — ONE REAL CLOUDFLARE STREAM PROVISIONING OPERATION
============================================================
This script may create exactly one pending Stream upload object
(UID + one-time upload URL) through the existing admin API.
It does NOT upload MP4 bytes.
It does NOT delete anything.
============================================================
`);

function applyEnvFile() {
  loadBackendEnv();
  const envPath = path.join(BACKEND_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.startsWith('mongodb://') || t.startsWith('mongodb+srv://')) {
      if (!process.env.MONGODB_URI) process.env.MONGODB_URI = t;
      continue;
    }
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function envSet(name) {
  return Boolean(String(process.env[name] || '').trim());
}

function apiBase() {
  return String(
    process.env.PHASE4_API_BASE || process.env.API_BASE_URL || API_BASE_DEFAULT
  )
    .trim()
    .replace(/\/$/, '');
}

function redactErrorMessage(err) {
  let msg = String(err?.message || 'unexpected failure');
  const uri = String(process.env.MONGODB_URI || '').trim();
  if (uri) msg = msg.split(uri).join('[MONGODB_URI]');
  for (const key of SECRET_ENV_KEYS) {
    const val = String(process.env[key] || '').trim();
    if (val) msg = msg.split(val).join(`[${key}]`);
  }
  return msg;
}

function assertNoSecrets(text) {
  for (const key of SECRET_ENV_KEYS) {
    const val = String(process.env[key] || '').trim();
    if (val && text.includes(val)) {
      throw new Error(`Refusing to write ${key} into output`);
    }
  }
}

async function counts(db) {
  const names = ['videolectures', 'subjects', 'topics', 'questions', 'users', 'tests'];
  const out = {};
  for (const name of names) {
    out[name] = await db.collection(name).countDocuments();
  }
  return out;
}

async function resolveSubjectTopic(db) {
  const subjects = db.collection('subjects');
  const topics = db.collection('topics');
  const subject = await subjects.findOne(
    { name: new RegExp(`^${PREFERRED_SUBJECT}$`, 'i') },
    { projection: { _id: 1, name: 1, isActive: 1 } }
  );
  if (!subject) {
    throw new Error(`Live DB has no Subject named "${PREFERRED_SUBJECT}"`);
  }
  const topic = await topics.findOne(
    {
      subjectId: subject._id,
      name: new RegExp(`^${PREFERRED_TOPIC}$`, 'i'),
    },
    { projection: { _id: 1, name: 1, subjectId: 1, isActive: 1 } }
  );
  if (!topic) {
    throw new Error(
      `Live DB has no Topic "${PREFERRED_TOPIC}" under Subject "${subject.name}"`
    );
  }
  return { subject, topic };
}

function writeReport(fields) {
  const md = `# Phase 4 — Controlled Cloudflare Stream upload-URL (step 4)

## Purpose

Obtain **exactly one** pending Cloudflare Stream direct-upload URL through the
existing admin endpoint \`POST /api/video-lectures/admin/upload-url\`.
No MP4 bytes are uploaded in this step. No automatic deletion.

## Prerequisites

- \`MONGODB_URI\` (read-only Subject/Topic + counts)
- Admin JWT via existing login (\`ADMIN_EMAIL\` + \`ADMIN_PASSWORD\`) **or**
  existing admin user + \`JWT_SECRET\` (\`signAuthToken\`, same as login)
- Reachable API: \`${fields.apiBase}/api/video-lectures/admin/upload-url\`
- Valid Cloudflare Stream token **on the API host** (this script does not mint locally)

| Prerequisite | Present |
|---|---|
| MONGODB_URI | ${fields.prereqs.mongoUri} |
| Admin login env (ADMIN_EMAIL + ADMIN_PASSWORD) | ${fields.prereqs.adminLoginEnv} |
| JWT_SECRET (for signAuthToken) | ${fields.prereqs.jwtSecret} |
| Existing admin user in Mongo | ${fields.prereqs.adminUser} |
| Cloudflare list readable from this machine | ${fields.prereqs.cloudflareList} |

${fields.blockedReason ? `## Result\n\n**BLOCKED.** ${fields.blockedReason}\n` : '## Result\n\nProvisioning attempted through the existing admin API.\n'}

## Exact metadata used

| Field | Value |
|---|---|
| title | \`${TITLE}\` |
| description | \`${DESCRIPTION}\` |
| access | \`${ACCESS}\` |
| requested order | \`${REQUESTED_ORDER}\` (not accepted by upload-url; schema default applies) |
| maxDurationSeconds | \`${MAX_DURATION_SECONDS}\` (required by existing validators) |
| subject | ${fields.subjectName || 'n/a'} (\`${fields.subjectId || 'n/a'}\`) |
| topic | ${fields.topicName || 'n/a'} (\`${fields.topicId || 'n/a'}\`) |

## Mongo count before/after

| Collection | Before | After |
|---|---|---|
| videolectures | ${fields.mongoBefore?.videolectures ?? 'n/a'} | ${fields.mongoAfter?.videolectures ?? 'n/a'} |
| subjects | ${fields.mongoBefore?.subjects ?? 'n/a'} | ${fields.mongoAfter?.subjects ?? 'n/a'} |
| topics | ${fields.mongoBefore?.topics ?? 'n/a'} | ${fields.mongoAfter?.topics ?? 'n/a'} |
| questions | ${fields.mongoBefore?.questions ?? 'n/a'} | ${fields.mongoAfter?.questions ?? 'n/a'} |
| users | ${fields.mongoBefore?.users ?? 'n/a'} | ${fields.mongoAfter?.users ?? 'n/a'} |
| tests | ${fields.mongoBefore?.tests ?? 'n/a'} | ${fields.mongoAfter?.tests ?? 'n/a'} |

## Cloudflare video count before/after

| | Count |
|---|---|
| Before | ${fields.cfBefore ?? 'n/a'} |
| After | ${fields.cfAfter ?? 'n/a'} |

## Created objects

| | Value |
|---|---|
| VideoLecture ID | ${fields.lectureId || 'n/a'} |
| Cloudflare UID | ${fields.cloudflareVideoId || 'n/a'} |
| status | ${fields.status || 'n/a'} |
| reusedExisting | ${fields.reusedExisting ? 'yes' : 'no'} |

## Bytes uploaded

**NO**

## Webhook triggered

**NO** at this stage (no bytes uploaded; Cloudflare does not encode until a file is sent).

## Unexpected writes

${fields.unexpectedWrites || 'None observed from this script (Mongo is read-only here; only the admin upload-url endpoint may write one VideoLecture).'}

Direct upload URL (if issued) is printed to stdout only and is **not** stored in this report.
`;
  assertNoSecrets(md);
  const dest = path.join(BACKEND_ROOT, REPORT_REL);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, md, 'utf8');
  return dest;
}

function printSafeResult(result) {
  console.log(
    JSON.stringify(
      {
        success: result.success,
        blocked: result.blocked || false,
        lectureId: result.lectureId || null,
        cloudflareVideoId: result.cloudflareVideoId || null,
        uploadURL: result.uploadURL || null,
        status: result.status || null,
        reusedExisting: result.reusedExisting || false,
        message: result.message || null,
      },
      null,
      2
    )
  );
}

async function obtainAdminJwt({ adminUserId }) {
  const email = String(process.env.ADMIN_EMAIL || '').trim();
  const password = String(process.env.ADMIN_PASSWORD || '').trim();
  if (email && password) {
    const res = await fetch(`${apiBase()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    const token = body?.data?.token;
    if (!res.ok || !token) {
      throw new Error(
        `Existing /api/auth/login failed (HTTP ${res.status}). Not inventing credentials.`
      );
    }
    return { token, via: 'POST /api/auth/login' };
  }

  if (envSet('JWT_SECRET') && adminUserId) {
    const { signAuthToken } = await import(moduleUrl('src/utils/jwt.js'));
    const { ROLES } = await import(moduleUrl('src/constants/roles.js'));
    const token = signAuthToken({ sub: String(adminUserId), role: ROLES.ADMIN });
    return { token, via: 'signAuthToken (same issuer as login)' };
  }

  return null;
}

applyEnvFile();

const reportFields = {
  apiBase: apiBase(),
  prereqs: {
    mongoUri: envSet('MONGODB_URI') ? 'yes' : 'NO',
    adminLoginEnv: envSet('ADMIN_EMAIL') && envSet('ADMIN_PASSWORD') ? 'yes' : 'NO',
    jwtSecret: envSet('JWT_SECRET') ? 'yes' : 'NO',
    adminUser: 'unknown',
    cloudflareList: 'unknown',
  },
};

let client;
try {
  if (!envSet('MONGODB_URI')) {
    reportFields.blockedReason =
      'MONGODB_URI is missing. Cannot validate a live Subject/Topic pair.';
    writeReport(reportFields);
    printSafeResult({
      success: false,
      blocked: true,
      message: reportFields.blockedReason,
    });
    process.exitCode = 1;
  } else {
    client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15_000,
    });
    await client.connect();
    const db = client.db();

    const mongoBefore = await counts(db);
    reportFields.mongoBefore = mongoBefore;
    reportFields.mongoAfter = mongoBefore;

    const { subject, topic } = await resolveSubjectTopic(db);
    reportFields.subjectId = String(subject._id);
    reportFields.subjectName = subject.name;
    reportFields.topicId = String(topic._id);
    reportFields.topicName = topic.name;

    const existing = await db.collection('videolectures').findOne(
      { title: TITLE },
      { projection: { _id: 1, cloudflareVideoId: 1, status: 1, title: 1 } }
    );

    const adminUser = await db
      .collection('users')
      .findOne({ role: 'admin' }, { projection: { _id: 1, role: 1 } });
    reportFields.prereqs.adminUser = adminUser ? 'yes' : 'NO';

    let cfBefore = null;
    try {
      const { cloudflareStreamService } = await import(
        moduleUrl('src/services/cloudflareStreamService.js')
      );
      const summary = await cloudflareStreamService.listVideosSummary();
      cfBefore = summary.total;
      reportFields.prereqs.cloudflareList = summary.ok ? 'yes' : 'NO';
    } catch {
      reportFields.prereqs.cloudflareList = 'NO';
    }
    reportFields.cfBefore = cfBefore;
    reportFields.cfAfter = cfBefore;

    if (existing) {
      reportFields.lectureId = String(existing._id);
      reportFields.cloudflareVideoId = existing.cloudflareVideoId || null;
      reportFields.status = existing.status || null;
      reportFields.reusedExisting = true;
      reportFields.unexpectedWrites = 'None. Existing test lecture reused; no second UID minted.';
      writeReport(reportFields);
      printSafeResult({
        success: true,
        lectureId: reportFields.lectureId,
        cloudflareVideoId: reportFields.cloudflareVideoId,
        status: reportFields.status,
        reusedExisting: true,
        message: 'Existing PHASE4_CF_UPLOAD_TEST_2026 reused. No second upload URL minted.',
      });
    } else {
      const missing = [];
      if (!(envSet('ADMIN_EMAIL') && envSet('ADMIN_PASSWORD')) && !envSet('JWT_SECRET')) {
        missing.push(
          'admin JWT: set ADMIN_EMAIL + ADMIN_PASSWORD (existing /api/auth/login) or JWT_SECRET to issue signAuthToken for an existing admin user'
        );
      }
      if (!adminUser && !(envSet('ADMIN_EMAIL') && envSet('ADMIN_PASSWORD'))) {
        missing.push('no existing admin user found in Mongo');
      }

      if (missing.length) {
        reportFields.blockedReason = missing.join('; ');
        writeReport(reportFields);
        printSafeResult({
          success: false,
          blocked: true,
          message: reportFields.blockedReason,
        });
        process.exitCode = 1;
      } else {
        const auth = await obtainAdminJwt({ adminUserId: adminUser?._id });
        if (!auth?.token) {
          reportFields.blockedReason =
            'Could not obtain an admin JWT without inventing credentials.';
          writeReport(reportFields);
          printSafeResult({
            success: false,
            blocked: true,
            message: reportFields.blockedReason,
          });
          process.exitCode = 1;
        } else {
          const res = await fetch(`${apiBase()}/api/video-lectures/admin/upload-url`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${auth.token}`,
            },
            body: JSON.stringify({
              title: TITLE,
              description: DESCRIPTION,
              subjectId: String(subject._id),
              topicId: String(topic._id),
              access: ACCESS,
              maxDurationSeconds: MAX_DURATION_SECONDS,
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || body?.success !== true) {
            reportFields.blockedReason = `upload-url HTTP ${res.status}: ${
              body?.message || 'request failed'
            }`;
            writeReport(reportFields);
            printSafeResult({
              success: false,
              blocked: true,
              message: reportFields.blockedReason,
            });
            process.exitCode = 1;
          } else {
            const data = body.data || {};
            reportFields.lectureId = data.lectureId || null;
            reportFields.cloudflareVideoId = data.cloudflareVideoId || null;
            reportFields.status = data.status || null;
            reportFields.reusedExisting = false;

            const mongoAfter = await counts(db);
            reportFields.mongoAfter = mongoAfter;
            let cfAfter = cfBefore;
            try {
              const { cloudflareStreamService } = await import(
                moduleUrl('src/services/cloudflareStreamService.js')
              );
              cfAfter = (await cloudflareStreamService.listVideosSummary()).total;
            } catch {
              /* keep previous */
            }
            reportFields.cfAfter = cfAfter;

            const vlDelta =
              mongoAfter.videolectures - mongoBefore.videolectures;
            const otherChanged = ['subjects', 'topics', 'questions', 'users', 'tests'].some(
              (k) => mongoAfter[k] !== mongoBefore[k]
            );
            reportFields.unexpectedWrites =
              vlDelta === 1 && !otherChanged
                ? 'None. Exactly one new VideoLecture. Other counted collections unchanged.'
                : `Unexpected count change. videolectures delta=${vlDelta}; other collections changed=${otherChanged}`;

            writeReport(reportFields);
            printSafeResult({
              success: true,
              lectureId: data.lectureId || null,
              cloudflareVideoId: data.cloudflareVideoId || null,
              uploadURL: data.uploadURL || null,
              status: data.status || null,
              message: `Admin JWT via ${auth.via}. Bytes not uploaded.`,
            });
          }
        }
      }
    }
  }
} catch (err) {
  reportFields.blockedReason = redactErrorMessage(err);
  try {
    writeReport(reportFields);
  } catch {
    /* ignore report IO */
  }
  printSafeResult({
    success: false,
    blocked: true,
    message: reportFields.blockedReason,
  });
  process.exitCode = 1;
} finally {
  if (client) await client.close();
}
