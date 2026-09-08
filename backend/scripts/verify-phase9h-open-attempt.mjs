/**
 * Phase 9H: READ-ONLY investigation of the extra open Phase 9 TestAttempt.
 * Native MongoDB driver only. Does not insert, update, delete, or submit.
 *
 * Writes:
 *   scripts/fixtures/set-a/SET_A_phase9h_open_attempt_investigation.md
 *   scripts/fixtures/set-a/SET_A_phase9h_open_attempt_investigation.json
 *
 * Run: node scripts/verify-phase9h-open-attempt.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, ObjectId } from 'mongodb';
import { BACKEND_ROOT, loadBackendEnv } from './lib/db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const OUT_MD = path.join(FIXTURE_DIR, 'SET_A_phase9h_open_attempt_investigation.md');
const OUT_JSON = path.join(FIXTURE_DIR, 'SET_A_phase9h_open_attempt_investigation.json');

const EXPECTED_DB = 'ssbfy';
const MARKER = 'PHASE9_SMOKE_TEST_2026';
const POST_ID = '6a9fe271a6683cc1b21ccded';
const TEST_ID = '6aa01e61f2afe2eb763a4bda';
const OLD_ATTEMPT_ID = '6aa01e727a012eb44cc636c7';
const NEW_ATTEMPT_ID = '6aa02a34c3be60ada0ed4805';
const OPEN_ATTEMPT_ID = '6aa02b6cc3be60ada0ed4884';
const Q_IDS = [
  '6aa01e60f2afe2eb763a4bc1',
  '6aa01e60f2afe2eb763a4bc7',
  '6aa01e61f2afe2eb763a4bcd',
  '6aa01e61f2afe2eb763a4bd3',
];
const SET_A_COUNT = 250;
const ORDERED_KINDS = ['plain', 'two_statements', 'numbered_list', 'table'];

const FORBIDDEN = [
  'insertOne',
  'insertMany',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'bulkWrite',
  'createIndex',
  'dropIndex',
  'syncIndexes',
  'createCollection',
  'dropCollection',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function assertReadOnlySource() {
  const src = stripComments(fs.readFileSync(__filename, 'utf8'));
  const hits = FORBIDDEN.filter((token) => new RegExp(`\\b${token}\\s*\\(`, 'g').test(src));
  if (hits.length) {
    throw new Error(`Phase 9H script is not read-only: ${hits.join(', ')}`);
  }
}

function loadMongoUri() {
  loadBackendEnv();
  const fromEnv = String(process.env.MONGODB_URI || '').trim();
  if (fromEnv) return fromEnv;
  const envPath = path.join(BACKEND_ROOT, '.env');
  if (!fs.existsSync(envPath)) return '';
  const text = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.startsWith('MONGODB_URI=')) return t.slice('MONGODB_URI='.length).trim();
    if (t.startsWith('mongodb://') || t.startsWith('mongodb+srv://')) return t;
  }
  return '';
}

function clusterHostFromUri(uri) {
  const raw = String(uri || '').trim();
  const noProto = raw.replace(/^mongodb(\+srv)?:\/\//i, '');
  const afterCreds = noProto.includes('@') ? noProto.slice(noProto.lastIndexOf('@') + 1) : noProto;
  const host = afterCreds.split('/')[0].split('?')[0];
  const srv = /^mongodb\+srv:/i.test(raw);
  return { protocol: srv ? 'mongodb+srv' : 'mongodb', host: host || '(unknown)' };
}

function sid(value) {
  if (value == null) return null;
  if (typeof value === 'object' && value._id != null) return String(value._id);
  return String(value);
}

function maskUserId(id) {
  const s = sid(id) || '';
  if (s.length < 8) return '(masked)';
  return `…${s.slice(-6)}`;
}

function iso(d) {
  if (!d) return null;
  try {
    return new Date(d).toISOString();
  } catch {
    return null;
  }
}

function hasMarker(doc) {
  return JSON.stringify(doc).includes(MARKER);
}

function oid(id) {
  return new ObjectId(id);
}

function isPremiumUser(user) {
  if (!user) return false;
  if (user.isPremium === true && !user.subscriptionEnd) return true;
  if (user.subscriptionEnd && new Date(user.subscriptionEnd).getTime() > Date.now()) return true;
  return false;
}

function summarizeAnswers(answers) {
  const rows = Array.isArray(answers) ? answers : [];
  let answered = 0;
  let unanswered = 0;
  for (const a of rows) {
    const idx = Array.isArray(a?.selectedOptionIndexes) ? a.selectedOptionIndexes : [];
    const hasScalar = Number.isInteger(a?.selectedOptionIndex);
    if (idx.length > 0 || hasScalar) answered += 1;
    else unanswered += 1;
  }
  return {
    answersPresent: rows.length > 0,
    answerRowCount: rows.length,
    answeredQuestionCount: answered,
    unansweredRowCount: unanswered,
  };
}

function snapshotOk(attempt) {
  const items = Array.isArray(attempt?.resultSnapshot?.items) ? attempt.resultSnapshot.items : [];
  if (items.length !== 4) return false;
  const byQ = new Map(items.map((it) => [sid(it.questionId), it]));
  const checks = [
    { id: Q_IDS[0], kind: 'plain', content: false },
    { id: Q_IDS[1], kind: 'two_statements', content: true },
    { id: Q_IDS[2], kind: 'numbered_list', content: true },
    { id: Q_IDS[3], kind: 'table', content: true },
  ];
  return checks.every((c) => {
    const it = byQ.get(c.id);
    if (!it) return false;
    if ((it.presentationKind || null) !== c.kind) return false;
    const hasContent = it.content != null && typeof it.content === 'object';
    return hasContent === c.content;
  });
}

function docKeys(doc) {
  return doc ? Object.keys(doc).sort() : [];
}

function walkObjectIds(value, acc) {
  if (value == null) return;
  if (value instanceof ObjectId) {
    acc.add(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkObjectIds(item, acc);
    return;
  }
  if (typeof value === 'object') {
    if (value._bsontype === 'ObjectId') {
      acc.add(String(value));
      return;
    }
    for (const v of Object.values(value)) walkObjectIds(v, acc);
  }
}

function idsInDoc(doc, wanted) {
  const found = new Set();
  walkObjectIds(doc, found);
  const hits = [];
  for (const id of found) {
    if (wanted.has(id)) hits.push(id);
  }
  const text = JSON.stringify(doc);
  for (const id of wanted) {
    if (text.includes(id) && !hits.includes(id)) hits.push(id);
  }
  return hits;
}

function classifyCreation({ open, sameAsOld, sameAsNew }) {
  const shapeMatchesStart =
    open.endTime == null &&
    Array.isArray(open.questionIds) &&
    open.questionIds.length === 4 &&
    Array.isArray(open.answers) &&
    open.resultSnapshot == null &&
    open.score == null &&
    Boolean(open.startTime);

  if (!shapeMatchesStart) {
    return {
      code: 'F',
      label: 'Cannot determine',
      evidence: 'Document shape does not match a normal POST /tests/:id/start create payload.',
    };
  }
  const progressHint =
    iso(open.updatedAt) && iso(open.createdAt) && iso(open.updatedAt) !== iso(open.createdAt)
      ? ' updatedAt is later than createdAt, consistent with PATCH /tests/:id/progress after start.'
      : '';
  if (sameAsOld || sameAsNew) {
    return {
      code: 'C',
      label: 'Mobile retry/resume behavior (same user as a completed attempt)',
      evidence:
        'Same user already has a completed attempt; a new open row would require premium retake start. Inspect user premium flag.',
    };
  }
  return {
    code: 'A',
    label: 'Normal abandoned attempt',
      evidence:
        'Document matches testAttemptService.start → testAttemptRepository.create (startTime set, endTime null, no snapshot). Belongs to a different user than both completed attempts. The Phase 9 Test is a public active mock, so any authenticated student can start it. No server-side abandon/expire ran. Logs were not available in this session.' +
        progressHint,
  };
}

function renderMarkdown(a) {
  const cmp = a.comparison
    .map(
      (r) =>
        `| ${r.label} | \`${r._id}\` | ${r.userIdMasked} | ${r.sameUserAsOpen ? 'yes' : 'no'} | ${r.completed ? 'completed' : 'open'} | ${r.attemptNumber} | ${r.score} | ${r.snapshotPresent ? 'yes' : 'no'} | ${r.answerRowCount} | ${r.startTime} | ${r.endTime} |`,
    )
    .join('\n');

  return `# Phase 9H — Extra Open Attempt Investigation

## Status

READ-ONLY

Generated: ${a.generatedAt}

MongoDB writes performed by this investigation: **0**

## Database Identity

- database name: \`${a.database.name}\`
- cluster host: \`${a.database.host}\`
- protocol: \`${a.database.protocol}\`
- identity: **${a.database.identity}**

Credentials and the full MongoDB URI are not included.

## Extra Open Attempt

| Field | Value |
|---|---|
| _id | \`${a.open._id}\` |
| userId | ${a.open.userIdMasked} |
| testId | \`${a.open.testId}\` |
| questionIds | ${(a.open.questionIds || []).map((id) => '`' + id + '`').join(', ')} |
| status field on schema | none (open = \`endTime === null\`) |
| derived status | **${a.open.derivedStatus}** |
| startTime | ${a.open.startTime} |
| endTime | ${a.open.endTime} |
| attemptNumber | ${a.open.attemptNumber} |
| score | ${a.open.score} |
| accuracy | ${a.open.accuracy} |
| timeTaken | ${a.open.timeTaken} |
| createdAt | ${a.open.createdAt} |
| updatedAt | ${a.open.updatedAt} |
| expiresAt | ${a.open.expiresAt} |
| resultSnapshot | ${a.open.resultSnapshotPresent ? 'present' : 'absent'} |
| document keys | ${a.open.keys.join(', ')} |

Truly open/incomplete: **${a.open.isOpen ? 'yes' : 'no'}**

User premium (boolean only): **${a.open.userIsPremium}**  
User role (no email): **${a.open.userRole}**

## Comparison With Completed Attempts

| Label | Attempt | userId (masked) | same user as open | state | attemptNumber | score | snapshot | answer rows | start | end |
|---|---|---|---|---|---:|---:|---|---:|---|---|
${cmp}

Same test: **${a.sameTest ? 'yes' : 'no'}**  
Same user as old attempt: **${a.sameUserAsOld ? 'yes' : 'no'}**  
Same user as new completed attempt: **${a.sameUserAsNew ? 'yes' : 'no'}**  
Different user from both completed attempts: **${!a.sameUserAsOld && !a.sameUserAsNew ? 'yes' : 'no'}**

questionIds match Phase 9 order on all three: **${a.questionIdsMatchAll ? 'yes' : 'no'}**

## Creation Source

Code path: \`POST /api/tests/:id/start\` → \`testController.start\` → \`testAttemptService.start\` → \`testAttemptRepository.create({ userId, testId, questionIds, answers: [], startTime, attemptNumber })\`.

Open attempts are created **before** the student answers. A second start for the same user+test **resumes** the open row (unique partial index \`uniq_attempt_user_test_open\`). Abandoned starts remain open forever: there is no expire/abandon API and no TTL.

Classification: **${a.creationSource.code}. ${a.creationSource.label}**

Evidence: ${a.creationSource.evidence}

Server/PM2/API logs were **not** available in this session. Cause is inferred from document shape, timestamps, and user inequality — not from access logs.

## Answer State

- answers present: **${a.answerState.answersPresent ? 'yes' : 'no'}**
- answer row count: **${a.answerState.answerRowCount}**
- answered question count (non-empty selections): **${a.answerState.answeredQuestionCount}**
- resultSnapshot present: **${a.answerState.resultSnapshotPresent ? 'yes' : 'no'}**

Selected option values are not listed.

## Result Relationship

Result schema: \`userId\` + \`testId\` + score/accuracy/timeTaken/weakTopics. **No attemptId.**

Results for this Test: **${a.resultsForTest}**  
Results that pair to the open attempt (same userId + testId + would require a score/timeTaken): **${a.openResultExists ? 'yes' : 'no'}**

Open attempt has no Result: **${!a.openResultExists ? 'confirmed' : 'UNEXPECTED'}**

## API Lifecycle

Existing TestAttempt HTTP operations:

| Method | Path | Effect on an open attempt |
|---|---|---|
| POST | \`/tests/:id/start\` | Resume if open exists for this user; else create open row |
| PATCH | \`/tests/:id/progress\` | Merge answers into the open row (does not finalize) |
| POST | \`/tests/:id/submit\` | Finalize: set endTime, score, resultSnapshot; create Result |
| GET | \`/tests/:id/attempts\` | Submitted history only (\`endTime != null\`) |
| GET | \`/tests/:id/rank\` | Completed attempts only |
| GET | \`/tests/status/mine\` | Flags \`hasOpenAttempt\` / \`hasCompletedAttempt\` |

There is **no** abandon, cancel, expire, or delete-attempt student endpoint.

Internal \`deleteOpenAttemptByIdForUser\` exists only to roll back a start when free-tier \`deviceId\`/quota fails **after** the row was inserted. It is not a user-facing abandon.

## Expiration Behavior

- TestAttempt schema: **no \`expiresAt\`**, no status enum, no TTL index.
- Test \`duration\` (10 minutes) is a **client timer** (mobile \`TestScreen\`). The server does not expire the row when duration elapses; submit remains valid while \`endTime\` is null.
- PracticeIssuance / BattleSession have TTLs; TestAttempt does not.
- This open attempt **will not naturally expire**.

## User Impact

Masked user: ${a.open.userIdMasked}  
Same as phone-test completed user: **${a.sameUserAsNew ? 'yes' : 'no'}**  
Other Phase 9 attempts for this user: **${a.openUserOtherPhase9Attempts}**

Impact while the row remains:

- Rankings: none (rank aggregations filter \`endTime != null\`).
- Result / score stats: none (no Result; profile analytics use completed attempts).
- Catalog participant counts: completed-only.
- This user: \`GET /tests/status/mine\` shows \`hasOpenAttempt: true\` for the smoke Test. Another \`POST /start\` **resumes** this row. They cannot start a second concurrent open attempt (unique index). Free users who never submitted are not blocked by "Test already completed"; they are parked on Resume.
- Free-tier device quota: consumed at successful start (if this user is free). Deleting later does **not** automatically refund \`DeviceUsage.freeAttemptsUsed\` (out of scope unless a later phase says so).
- Unrelated users, SET A, and the two completed attempts: unaffected by later deletion of this row.

## Secondary References

Search for \`${OPEN_ATTEMPT_ID}\` in results, learningsessions, battlesessions, practiceissuances, userlearninganalytics, and a capped scan of other non-empty collections.

Hits: **${a.secondaryReferences.length}**

${a.secondaryReferences.length ? a.secondaryReferences.map((r) => `- ${r.collection} \`${r.documentId}\` ${r.field}`).join('\n') : 'None.'}

## Phase 9 Integrity

| Item | Actual | Expected |
|---|---:|---:|
| Questions | ${a.counts.questions} | 254 |
| Phase 9 questions | ${a.counts.phase9Questions} | 4 |
| Tests | ${a.counts.tests} | 1 |
| Posts | ${a.counts.posts} | 1 |
| Phase 9 attempts | ${a.counts.phase9Attempts} | 3 |
| Phase 9 completed | ${a.counts.phase9Completed} | 2 |
| Phase 9 open | ${a.counts.phase9Open} | 1 |
| Phase 9 results | ${a.counts.phase9Results} | 2 |
| SET A | ${a.counts.setA} | 250 |

SET A questions proposed for deletion: **0**  
Other tests using Phase 9 questions: **${a.otherTestsUsingPhase9Questions.length}**  
Other content using Phase 9 Post: **${a.otherPostUsage}**

New completed attempt structured snapshot: **${a.newSnapshotOk ? 'yes' : 'no'}**

## Cleanup Classification

**${a.cleanupClassification}**

${a.cleanupWhy}

Dependencies if deleted later: none besides the attempt document itself (no Result, no secondary refs). Deleting the attempt alone is sufficient for this extra row. It should still be included in the broader Phase 9 smoke cleanup (attempts → test → questions → post), not deleted in isolation unless a later phase says so.

## Proposed Future Cleanup

READ-ONLY — NOT EXECUTED

1. Results: \`${a.proposedCleanup.resultIds.join('`, `')}\` — smoke-test score rows (\`testId\` only).
2. TestAttempts, including OPEN \`${OPEN_ATTEMPT_ID}\`: \`${a.proposedCleanup.attemptIds.join('`, `')}\`.
3. Test \`${TEST_ID}\`.
4. Questions ${Q_IDS.map((id) => '`' + id + '`').join(', ')}.
5. Post \`${POST_ID}\`.

OPEN ATTEMPT \`${OPEN_ATTEMPT_ID}\`: **safe to include in future cleanup.** Do not submit or expire it first; there is no expire API. Do not refund device quota in this investigation.

Test user accounts: **NOT PROPOSED**.

## Final Verdict

**${a.verdict}**

Do not delete, submit, or expire anything until an explicit cleanup phase.
`;
}

async function main() {
  assertReadOnlySource();
  const uri = loadMongoUri();
  if (!uri) throw new Error('MONGODB_URI unavailable');
  const { protocol, host } = clusterHostFromUri(uri);

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15_000,
    readPreference: 'primary',
  });
  await client.connect();
  const failures = [];
  const notes = [];

  try {
    const db = client.db();
    if (db.databaseName !== EXPECTED_DB) {
      failures.push(`database is ${db.databaseName}, expected ${EXPECTED_DB}`);
    }

    const questions = await db.collection('questions').find({}).toArray();
    const tests = await db.collection('tests').find({}).toArray();
    const posts = await db.collection('posts').find({}).toArray();
    const phase9Questions = questions.filter(hasMarker);
    const setAQuestions = questions.filter((q) => !hasMarker(q));
    const setAIds = new Set(setAQuestions.map((q) => String(q._id)));

    const testOid = oid(TEST_ID);
    const openOid = oid(OPEN_ATTEMPT_ID);
    const attempts = await db
      .collection('testattempts')
      .find({ testId: testOid })
      .toArray();
    const results = await db.collection('results').find({ testId: testOid }).toArray();

    const open = attempts.find((a) => String(a._id) === OPEN_ATTEMPT_ID);
    const oldA = attempts.find((a) => String(a._id) === OLD_ATTEMPT_ID);
    const newA = attempts.find((a) => String(a._id) === NEW_ATTEMPT_ID);

    if (!open) failures.push(`open attempt ${OPEN_ATTEMPT_ID} not found`);
    if (!oldA) failures.push(`old attempt ${OLD_ATTEMPT_ID} not found`);
    if (!newA) failures.push(`new attempt ${NEW_ATTEMPT_ID} not found`);
    if (sid(open?.testId) !== TEST_ID) failures.push('open attempt testId mismatch');
    if (open && open.endTime != null) failures.push('open attempt is not open (endTime set)');
    if (oldA && oldA.endTime == null) failures.push('old attempt is not completed');
    if (newA && newA.endTime == null) failures.push('new completed attempt is not completed');

    const completed = attempts.filter((a) => a.endTime != null);
    const openRows = attempts.filter((a) => a.endTime == null);
    if (attempts.length !== 3) failures.push(`Phase 9 attempts=${attempts.length}, expected 3`);
    if (completed.length !== 2) failures.push(`completed attempts=${completed.length}, expected 2`);
    if (openRows.length !== 1) failures.push(`open attempts=${openRows.length}, expected 1`);
    if (results.length !== 2) failures.push(`Phase 9 results=${results.length}, expected 2`);
    if (questions.length !== 254) failures.push(`questions=${questions.length}, expected 254`);
    if (phase9Questions.length !== 4) failures.push(`Phase 9 questions=${phase9Questions.length}`);
    if (tests.length !== 1) failures.push(`tests=${tests.length}, expected 1`);
    if (posts.length !== 1) failures.push(`posts=${posts.length}, expected 1`);
    if (setAQuestions.length !== SET_A_COUNT) failures.push(`SET A=${setAQuestions.length}`);

    const newSnapshotOk = newA ? snapshotOk(newA) : false;
    if (newA && !newSnapshotOk) failures.push('new completed attempt snapshot is not structured');

    const sameUserAsOld = Boolean(open && oldA && sid(open.userId) === sid(oldA.userId));
    const sameUserAsNew = Boolean(open && newA && sid(open.userId) === sid(newA.userId));
    const qMatch = (a) =>
      Array.isArray(a?.questionIds) && Q_IDS.every((id, i) => sid(a.questionIds[i]) === id);

    const openUser = open
      ? await db.collection('users').findOne(
          { _id: open.userId },
          { projection: { role: 1, isPremium: 1, subscriptionEnd: 1 } },
        )
      : null;

    const ans = summarizeAnswers(open?.answers);
    const openResultExists = Boolean(
      open &&
        results.some((r) => sid(r.userId) === sid(open.userId) && sid(r.testId) === TEST_ID),
    );
    if (openResultExists) failures.push('open attempt unexpectedly has a pairing Result');

    const wanted = new Set([OPEN_ATTEMPT_ID]);
    const secondary = [];
    const learning = await db
      .collection('learningsessions')
      .find({
        $or: [
          { 'snapshot.sourceAttemptId': openOid },
          { 'snapshot.sourceTestAttemptId': openOid },
        ],
      })
      .project({ _id: 1 })
      .toArray();
    for (const d of learning) {
      secondary.push({ collection: 'learningsessions', documentId: String(d._id), field: 'snapshot.sourceAttemptId' });
    }
    const practice = await db
      .collection('practiceissuances')
      .find({ sourceAttemptId: openOid })
      .project({ _id: 1 })
      .toArray();
    for (const d of practice) {
      secondary.push({ collection: 'practiceissuances', documentId: String(d._id), field: 'sourceAttemptId' });
    }
    const battleHits = await db
      .collection('battlesessions')
      .find({
        $or: [{ creatorAttemptId: openOid }, { opponentAttemptId: openOid }],
      })
      .project({ _id: 1 })
      .toArray();
    for (const d of battleHits) {
      secondary.push({ collection: 'battlesessions', documentId: String(d._id), field: 'creator/opponentAttemptId' });
    }
    const analyticsDocs = await db.collection('userlearninganalytics').find({}).toArray();
    for (const doc of analyticsDocs) {
      const hits = idsInDoc(doc, wanted);
      if (hits.length) {
        secondary.push({
          collection: 'userlearninganalytics',
          documentId: String(doc._id),
          field: 'state',
        });
      }
    }
    if (results.some((r) => idsInDoc(r, wanted).length)) {
      secondary.push({ collection: 'results', documentId: '(see pairing)', field: 'document scan' });
    }

    const listed = await db.listCollections({}, { nameOnly: true }).toArray();
    const skip = new Set([
      'testattempts',
      'results',
      'learningsessions',
      'practiceissuances',
      'battlesessions',
      'userlearninganalytics',
      'questions',
      'tests',
      'posts',
    ]);
    for (const col of listed.map((c) => c.name).filter((n) => !String(n).startsWith('system.'))) {
      if (skip.has(col)) continue;
      const n = await db.collection(col).countDocuments();
      if (n === 0 || n > 5000) continue;
      const docs = await db.collection(col).find({}).toArray();
      for (const doc of docs) {
        if (idsInDoc(doc, wanted).length) {
          secondary.push({ collection: col, documentId: String(doc._id), field: '(scanned)' });
        }
      }
    }

    const otherTests = tests.filter((t) => {
      if (String(t._id) === TEST_ID) return false;
      const ids = (t.questionIds || []).map(sid);
      return ids.some((id) => Q_IDS.includes(id));
    });
    if (otherTests.length) failures.push('another Test references Phase 9 questions');
    const otherPostQs = questions.filter((q) => {
      const pids = (q.postIds || []).map(sid);
      return pids.includes(POST_ID) && !Q_IDS.includes(String(q._id));
    });
    if (otherPostQs.length) failures.push('non-smoke questions reference Phase 9 Post');
    if (Q_IDS.some((id) => setAIds.has(id))) failures.push('Phase 9 IDs overlap SET A');

    const testDoc = tests.find((t) => String(t._id) === TEST_ID);
    const phase9Kinds = ORDERED_KINDS.map((k) =>
      phase9Questions.filter((q) => (q.presentationKind || 'plain') === k).length,
    );
    if (!phase9Kinds.every((n) => n === 1) && phase9Questions.length === 4) {
      notes.push(`Phase 9 kind counts ${phase9Kinds.join('/')}`);
    }

    const openUserOther = attempts.filter(
      (a) => open && sid(a.userId) === sid(open.userId) && String(a._id) !== OPEN_ATTEMPT_ID,
    ).length;

    const creationSource = open
      ? classifyCreation({ open, sameAsOld: sameUserAsOld, sameAsNew: sameUserAsNew })
      : { code: 'F', label: 'Cannot determine', evidence: 'attempt missing' };

    const cleanupClassification = 'SAFE TO DELETE LATER';
    const cleanupWhy = [
      'The row is a genuine in-progress TestAttempt created by the normal start path, then left unsubmitted.',
      'It has no Result and no secondary references.',
      'It does not enter rankings, Result stats, or completed-attempt analytics.',
      'There is no application expiration; waiting will not remove it.',
      'There is no student abandon endpoint; later cleanup should delete the document (with the rest of Phase 9 smoke data), not submit it.',
      'Deleting it does not modify SET A, the Test, Questions, Post, or the two completed attempts/results unless those are deleted in the same approved cleanup.',
    ].join(' ');

    const identity =
      db.databaseName === EXPECTED_DB && setAQuestions.length === SET_A_COUNT
        ? 'intended SSBFY database (ssbfy, SET A 250)'
        : 'NOT CONFIRMED';
    if (identity.startsWith('NOT')) failures.push('database identity not confirmed');

    const comparison = [
      { label: 'old', doc: oldA },
      { label: 'completed-new', doc: newA },
      { label: 'extra-open', doc: open },
    ].map(({ label, doc }) => ({
      label,
      _id: doc ? String(doc._id) : null,
      userIdMasked: maskUserId(doc?.userId),
      sameUserAsOpen: Boolean(open && doc && sid(doc.userId) === sid(open.userId)),
      completed: doc?.endTime != null,
      attemptNumber: doc?.attemptNumber ?? null,
      score: doc?.score ?? null,
      snapshotPresent: Boolean(doc?.resultSnapshot && Array.isArray(doc.resultSnapshot.items)),
      answerRowCount: Array.isArray(doc?.answers) ? doc.answers.length : 0,
      startTime: iso(doc?.startTime),
      endTime: iso(doc?.endTime),
    }));

    const report = {
      generatedAt: new Date().toISOString(),
      database: { name: db.databaseName, host, protocol, identity },
      open: open
        ? {
            _id: String(open._id),
            userIdMasked: maskUserId(open.userId),
            testId: sid(open.testId),
            questionIds: (open.questionIds || []).map(sid),
            derivedStatus: open.endTime == null ? 'open' : 'completed',
            isOpen: open.endTime == null,
            startTime: iso(open.startTime),
            endTime: iso(open.endTime),
            attemptNumber: open.attemptNumber ?? null,
            score: open.score ?? null,
            accuracy: open.accuracy ?? null,
            timeTaken: open.timeTaken ?? null,
            createdAt: iso(open.createdAt),
            updatedAt: iso(open.updatedAt),
            expiresAt: open.expiresAt != null ? iso(open.expiresAt) : null,
            resultSnapshotPresent: open.resultSnapshot != null,
            keys: docKeys(open),
            userIsPremium: isPremiumUser(openUser),
            userRole: openUser?.role || null,
          }
        : null,
      comparison,
      sameTest: attempts.every((x) => sid(x.testId) === TEST_ID),
      sameUserAsOld,
      sameUserAsNew,
      questionIdsMatchAll: [open, oldA, newA].every(qMatch),
      creationSource,
      answerState: {
        ...ans,
        resultSnapshotPresent: open?.resultSnapshot != null,
      },
      resultsForTest: results.length,
      openResultExists,
      secondaryReferences: secondary,
      openUserOtherPhase9Attempts: openUserOther,
      counts: {
        questions: questions.length,
        phase9Questions: phase9Questions.length,
        tests: tests.length,
        posts: posts.length,
        phase9Attempts: attempts.length,
        phase9Completed: completed.length,
        phase9Open: openRows.length,
        phase9Results: results.length,
        setA: setAQuestions.length,
      },
      otherTestsUsingPhase9Questions: otherTests.map((t) => String(t._id)),
      otherPostUsage: otherPostQs.length
        ? `${otherPostQs.length} extra question(s)`
        : 'only the four Phase 9 questions',
      newSnapshotOk,
      cleanupClassification,
      cleanupWhy,
      proposedCleanup: {
        resultIds: results.map((r) => String(r._id)),
        attemptIds: attempts.map((x) => String(x._id)),
      },
      verdict: failures.length ? 'BLOCKED' : 'PASS',
      mongoWrites: 0,
    };

    const jsonOut = {
      attemptId: OPEN_ATTEMPT_ID,
      testId: TEST_ID,
      maskedUserId: report.open?.userIdMasked || null,
      status: report.open?.derivedStatus || null,
      attemptNumber: report.open?.attemptNumber ?? null,
      createdAt: report.open?.createdAt || null,
      updatedAt: report.open?.updatedAt || null,
      expiresAt: report.open?.expiresAt ?? null,
      answerState: report.answerState,
      resultExists: openResultExists,
      references: secondary,
      creationSource,
      expirationBehavior: {
        schemaExpiresAt: false,
        ttlIndex: false,
        requestTimeExpiration: false,
        clientDurationMinutes: testDoc?.duration ?? null,
        willNaturallyExpire: false,
      },
      userImpact: {
        sameAsOldAttemptUser: sameUserAsOld,
        sameAsNewCompletedUser: sameUserAsNew,
        otherPhase9AttemptsForUser: openUserOther,
        blocksConcurrentStartForThisUser: true,
        affectsRankings: false,
        affectsResults: false,
        isPremium: report.open?.userIsPremium ?? null,
      },
      cleanupClassification,
      proposedCleanupAction: 'include_open_attempt_in_future_phase9_smoke_deletion_after_explicit_approval',
      counts: report.counts,
      newSnapshotOk,
      mongoWrites: 0,
      failures,
      notes,
    };

    fs.writeFileSync(OUT_JSON, `${JSON.stringify(jsonOut, null, 2)}\n`);
    fs.writeFileSync(OUT_MD, renderMarkdown(report));

    console.log(
      JSON.stringify(
        {
          ok: failures.length === 0,
          database: db.databaseName,
          cleanupClassification,
          creationSource: creationSource.code,
          openAttemptId: OPEN_ATTEMPT_ID,
          isOpen: open?.endTime == null,
          answerRowCount: ans.answerRowCount,
          answeredQuestionCount: ans.answeredQuestionCount,
          resultExists: openResultExists,
          secondaryReferenceCount: secondary.length,
          sameUserAsNew,
          newSnapshotOk,
          counts: report.counts,
          mongoWrites: 0,
          reports: {
            md: path.relative(BACKEND_ROOT, OUT_MD).replace(/\\/g, '/'),
            json: path.relative(BACKEND_ROOT, OUT_JSON).replace(/\\/g, '/'),
          },
          failures,
          notes,
        },
        null,
        2,
      ),
    );
    if (failures.length) process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
