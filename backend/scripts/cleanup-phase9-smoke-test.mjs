/**
 * Phase 9I — controlled smoke-test cleanup.
 *
 * Default: dry-run (zero writes).
 * Destructive only with exact flag: --gate-9-approved
 *
 *   node scripts/cleanup-phase9-smoke-test.mjs
 *   node scripts/cleanup-phase9-smoke-test.mjs --gate-9-approved
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, ObjectId } from 'mongodb';
import { BACKEND_ROOT, loadBackendEnv } from './lib/db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const OUT_MD = path.join(FIXTURE_DIR, 'SET_A_phase9i_cleanup_report.md');
const OUT_JSON = path.join(FIXTURE_DIR, 'SET_A_phase9i_cleanup_report.json');

const EXPECTED_DB = 'ssbfy';
const MARKER = 'PHASE9_SMOKE_TEST_2026';
const APPROVAL_FLAG = '--gate-9-approved';
const POST_ID = '6a9fe271a6683cc1b21ccded';
const TEST_ID = '6aa01e61f2afe2eb763a4bda';
const Q_IDS = [
  '6aa01e60f2afe2eb763a4bc1',
  '6aa01e60f2afe2eb763a4bc7',
  '6aa01e61f2afe2eb763a4bcd',
  '6aa01e61f2afe2eb763a4bd3',
];
const ATTEMPT_IDS = [
  '6aa01e727a012eb44cc636c7',
  '6aa02a34c3be60ada0ed4805',
  '6aa02b6cc3be60ada0ed4884',
];
const OLD_ATTEMPT_ID = ATTEMPT_IDS[0];
const NEW_ATTEMPT_ID = ATTEMPT_IDS[1];
const OPEN_ATTEMPT_ID = ATTEMPT_IDS[2];
const SET_A_COUNT = 250;
const SET_A_KINDS = { plain: 49, two_statements: 8, numbered_list: 179, table: 14 };

function oid(id) {
  return new ObjectId(id);
}
function sid(v) {
  if (v == null) return null;
  return String(v._id ?? v);
}
function hasMarker(doc) {
  return JSON.stringify(doc).includes(MARKER);
}
function countKinds(docs) {
  const kinds = { plain: 0, two_statements: 0, numbered_list: 0, table: 0 };
  for (const q of docs) {
    const k = q.presentationKind || 'plain';
    if (k in kinds) kinds[k] += 1;
  }
  return kinds;
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
  return afterCreds.split('/')[0].split('?')[0] || '(unknown)';
}

function idsInDoc(doc, wanted) {
  const text = JSON.stringify(doc);
  return [...wanted].filter((id) => text.includes(id));
}

async function scanUnexpectedRefs(db, wanted, extraSkip = []) {
  const skip = new Set([
    'questions',
    'tests',
    'posts',
    'testattempts',
    'results',
    ...extraSkip,
  ]);
  const hits = [];
  const listed = await db.listCollections({}, { nameOnly: true }).toArray();
  for (const name of listed.map((c) => c.name).filter((n) => !String(n).startsWith('system.'))) {
    if (skip.has(name)) continue;
    const n = await db.collection(name).countDocuments();
    if (n === 0 || n > 8000) continue;
    const docs = await db.collection(name).find({}).toArray();
    for (const doc of docs) {
      const found = idsInDoc(doc, wanted);
      if (found.length) {
        hits.push({ collection: name, documentId: String(doc._id), ids: found });
      }
    }
  }
  return hits;
}

async function preflight(db) {
  const gates = [];
  const fail = (name, detail) => {
    gates.push({ name, ok: false, detail });
  };
  const pass = (name, detail) => {
    gates.push({ name, ok: true, detail });
  };

  if (db.databaseName !== EXPECTED_DB) {
    fail('database-identity', `database is ${db.databaseName}, expected ${EXPECTED_DB}`);
    return { ok: false, gates, stop: true };
  }
  pass('database-identity', EXPECTED_DB);

  const preCounts = {
    users: await db.collection('users').countDocuments(),
    questions: await db.collection('questions').countDocuments(),
    tests: await db.collection('tests').countDocuments(),
    posts: await db.collection('posts').countDocuments(),
    testAttempts: await db.collection('testattempts').countDocuments(),
    results: await db.collection('results').countDocuments(),
  };

  const allQuestions = await db.collection('questions').find({}).toArray();
  const allTests = await db.collection('tests').find({}).toArray();
  const allPosts = await db.collection('posts').find({}).toArray();
  const setAQuestions = allQuestions.filter((q) => !hasMarker(q));
  const phase9Questions = allQuestions.filter(hasMarker);
  const setAKinds = countKinds(setAQuestions);
  const setAFingerprint = setAQuestions
    .map((q) => `${q._id}:${q.updatedAt ? new Date(q.updatedAt).toISOString() : ''}`)
    .sort();
  const userIds = (await db.collection('users').find({}, { projection: { _id: 1 } }).toArray())
    .map((u) => String(u._id))
    .sort();

  if (setAQuestions.length !== SET_A_COUNT) {
    fail('set-a-count', `${setAQuestions.length}, expected ${SET_A_COUNT}`);
  } else {
    pass('set-a-count', String(SET_A_COUNT));
  }
  for (const [k, n] of Object.entries(SET_A_KINDS)) {
    if (setAKinds[k] !== n) fail('set-a-kinds', `${k}=${setAKinds[k]}, expected ${n}`);
  }
  if (!gates.some((g) => g.name === 'set-a-kinds' && !g.ok)) {
    pass('set-a-kinds', JSON.stringify(setAKinds));
  }

  const qDocs = [];
  for (const id of Q_IDS) {
    const q = allQuestions.find((d) => String(d._id) === id);
    if (!q) fail('phase9-questions', `missing ${id}`);
    else qDocs.push(q);
  }
  if (qDocs.length === 4) pass('phase9-questions', '4 allowlisted questions exist');
  if (phase9Questions.length !== 4) {
    fail('phase9-question-marker', `marker questions=${phase9Questions.length}, expected 4`);
  } else {
    pass('phase9-question-marker', '4');
  }

  const test = allTests.find((t) => String(t._id) === TEST_ID);
  if (!test) fail('phase9-test', 'missing');
  else {
    const qids = (test.questionIds || []).map(sid);
    const orderOk = Q_IDS.every((id, i) => qids[i] === id) && qids.length === 4;
    if (!orderOk) fail('phase9-test-questions', `questionIds=${qids.join(',')}`);
    else pass('phase9-test', 'exists with exact four question IDs');
  }

  const post = allPosts.find((p) => String(p._id) === POST_ID);
  if (!post) fail('phase9-post', 'missing');
  else pass('phase9-post', post.name || POST_ID);

  const attemptOids = ATTEMPT_IDS.map(oid);
  const attempts = await db
    .collection('testattempts')
    .find({ _id: { $in: attemptOids } })
    .toArray();
  if (attempts.length !== 3) fail('phase9-attempts', `found ${attempts.length}, expected 3`);
  else pass('phase9-attempts', 'exactly 3 allowlisted attempts');

  const byAttempt = new Map(attempts.map((a) => [String(a._id), a]));
  for (const id of ATTEMPT_IDS) {
    const a = byAttempt.get(id);
    if (!a) continue;
    if (sid(a.testId) !== TEST_ID) fail('attempt-test', `${id} testId mismatch`);
  }
  const oldA = byAttempt.get(OLD_ATTEMPT_ID);
  const newA = byAttempt.get(NEW_ATTEMPT_ID);
  const openA = byAttempt.get(OPEN_ATTEMPT_ID);
  if (oldA && oldA.endTime == null) fail('old-attempt', 'not completed');
  else if (oldA) pass('old-attempt', 'completed');
  if (newA && newA.endTime == null) fail('new-attempt', 'not completed');
  else if (newA) pass('new-attempt', 'completed');
  if (openA && openA.endTime != null) fail('open-attempt', 'not open');
  else if (openA) pass('open-attempt', 'open / incomplete');

  const extraAttempts = await db
    .collection('testattempts')
    .find({ testId: oid(TEST_ID), _id: { $nin: attemptOids } })
    .project({ _id: 1 })
    .toArray();
  if (extraAttempts.length) {
    fail('extra-attempts', extraAttempts.map((a) => String(a._id)).join(','));
  } else {
    pass('no-extra-attempts', 'no other attempts on Phase 9 Test');
  }

  const resultsForTest = await db.collection('results').find({ testId: oid(TEST_ID) }).toArray();
  const completed = [oldA, newA].filter(Boolean);
  const pairs = [];
  let resultAmbiguous = false;
  if (resultsForTest.length !== 2) {
    fail('phase9-results-count', `results for test=${resultsForTest.length}, expected 2`);
    resultAmbiguous = true;
  }
  for (const att of completed) {
    const matches = resultsForTest.filter((r) => sid(r.userId) === sid(att.userId));
    if (matches.length !== 1) {
      fail('result-pair', `attempt ${att._id} matched ${matches.length} results`);
      resultAmbiguous = true;
    } else {
      pairs.push({ attemptId: String(att._id), resultId: String(matches[0]._id), userMasked: `…${sid(att.userId).slice(-6)}` });
    }
  }
  if (openA) {
    const openHits = resultsForTest.filter((r) => sid(r.userId) === sid(openA.userId));
    if (openHits.length) {
      fail('open-has-result', openHits.map((r) => String(r._id)).join(','));
      resultAmbiguous = true;
    } else {
      pass('open-has-result', 'none');
    }
  }
  const resultIds = pairs.map((p) => p.resultId);
  if (!resultAmbiguous && resultIds.length === 2 && new Set(resultIds).size === 2) {
    pass('phase9-results', resultIds.join(', '));
  }

  const otherTests = allTests.filter((t) => {
    if (String(t._id) === TEST_ID) return false;
    return (t.questionIds || []).map(sid).some((id) => Q_IDS.includes(id));
  });
  if (otherTests.length) fail('other-tests', otherTests.map((t) => String(t._id)).join(','));
  else pass('other-tests', 'none');

  const otherPostQs = allQuestions.filter((q) => {
    const pids = (q.postIds || []).map(sid);
    return pids.includes(POST_ID) && !Q_IDS.includes(String(q._id));
  });
  if (otherPostQs.length) fail('other-post-questions', otherPostQs.map((q) => String(q._id)).join(','));
  else pass('other-post-questions', 'only the four smoke questions');

  const testsWithPost = allTests.filter((t) => sid(t.postId) === POST_ID);
  if (testsWithPost.length) fail('test-postId', testsWithPost.map((t) => String(t._id)).join(','));
  else pass('test-postId', 'Phase 9 Test.postId is not the smoke Post');

  const notesPost = await db
    .collection('notes')
    .find({ $or: [{ postIds: oid(POST_ID) }, { postId: oid(POST_ID) }] })
    .project({ _id: 1 })
    .toArray();
  const pdfsPost = await db
    .collection('pdfnotes')
    .find({ $or: [{ postIds: oid(POST_ID) }, { postId: oid(POST_ID) }] })
    .project({ _id: 1 })
    .toArray();
  const subjectsPost = await db.collection('subjects').find({ postId: oid(POST_ID) }).project({ _id: 1 }).toArray();
  if (notesPost.length || pdfsPost.length || subjectsPost.length) {
    fail('other-post-content', `notes=${notesPost.length} pdfs=${pdfsPost.length} subjects=${subjectsPost.length}`);
  } else {
    pass('other-post-content', 'none');
  }

  const setAIds = new Set(setAQuestions.map((q) => String(q._id)));
  const phase9InSetA = Q_IDS.filter((id) => setAIds.has(id));
  if (phase9InSetA.length) fail('phase9-in-set-a', phase9InSetA.join(','));
  else pass('phase9-in-set-a', 'none');

  const testQSetA = ((test?.questionIds || []).map(sid)).filter((id) => setAIds.has(id));
  if (testQSetA.length) fail('test-includes-set-a', testQSetA.join(','));
  else pass('test-includes-set-a', 'none');

  const attemptSetA = [];
  for (const a of attempts) {
    for (const id of (a.questionIds || []).map(sid)) {
      if (setAIds.has(id) && !attemptSetA.includes(id)) attemptSetA.push(id);
    }
  }
  if (attemptSetA.length) fail('attempts-include-set-a', attemptSetA.join(','));
  else pass('attempts-include-set-a', 'none');

  const deletionQuestionIds = Q_IDS.slice();
  if (deletionQuestionIds.some((id) => setAIds.has(id))) {
    fail('deletion-set-a', 'SET A ID in question deletion set');
  } else {
    pass('deletion-set-a', 'question deletion set has 4 Phase 9 IDs and 0 SET A IDs');
  }

  const wantedAttempts = new Set(ATTEMPT_IDS);
  const learning = await db
    .collection('learningsessions')
    .find({
      $or: [
        { 'snapshot.sourceAttemptId': { $in: attemptOids } },
        { 'snapshot.sourceTestAttemptId': { $in: attemptOids } },
      ],
    })
    .project({ _id: 1 })
    .toArray();
  const practice = await db
    .collection('practiceissuances')
    .find({ sourceAttemptId: { $in: attemptOids } })
    .project({ _id: 1 })
    .toArray();
  const battles = await db
    .collection('battlesessions')
    .find({
      $or: [
        { creatorAttemptId: { $in: attemptOids } },
        { opponentAttemptId: { $in: attemptOids } },
        { questionIds: { $in: Q_IDS.map(oid) } },
      ],
    })
    .project({ _id: 1 })
    .toArray();
  if (learning.length || practice.length || battles.length) {
    fail(
      'secondary-attempt-refs',
      `learning=${learning.length} practice=${practice.length} battles=${battles.length}`,
    );
  } else {
    pass('secondary-attempt-refs', 'none');
  }

  const extraScan = await scanUnexpectedRefs(db, new Set([POST_ID, TEST_ID, ...Q_IDS, ...ATTEMPT_IDS]));
  const extraNonAnalytics = extraScan.filter((h) => h.collection !== 'userlearninganalytics');
  const analyticsHits = extraScan.filter((h) => h.collection === 'userlearninganalytics');
  if (analyticsHits.length) {
    fail('analytics-refs', `${analyticsHits.length} userlearninganalytics hit(s)`);
  } else {
    pass('analytics-refs', 'none');
  }
  if (extraNonAnalytics.length) fail('extra-collection-refs', JSON.stringify(extraNonAnalytics));
  else pass('extra-collection-refs', 'none');

  if (preCounts.questions !== 254) {
    fail('baseline-questions', `${preCounts.questions}, expected 254`);
  } else pass('baseline-questions', '254');
  if (preCounts.tests !== 1) fail('baseline-tests', `${preCounts.tests}, expected 1`);
  else pass('baseline-tests', '1 (Phase 9 only)');
  if (preCounts.posts !== 1) fail('baseline-posts', `${preCounts.posts}, expected 1`);
  else pass('baseline-posts', '1 (Phase 9 only)');

  const expectedPost = {
    questions: preCounts.questions - 4,
    tests: preCounts.tests - (test ? 1 : 0),
    posts: preCounts.posts - (post ? 1 : 0),
    testAttempts: preCounts.testAttempts - attempts.length,
    results: preCounts.results - resultIds.length,
    users: preCounts.users,
    setA: SET_A_COUNT,
    phase9Questions: 0,
    phase9Tests: 0,
    phase9Posts: 0,
    phase9Attempts: 0,
    phase9Results: 0,
  };

  const ok = gates.every((g) => g.ok);
  return {
    ok,
    stop: !ok,
    gates,
    preCounts,
    expectedPost,
    setAKinds,
    setAFingerprint,
    userIds,
    userCount: userIds.length,
    resultIds,
    resultPairs: pairs,
    deletionPlan: {
      results: resultIds,
      testattempts: ATTEMPT_IDS.slice(),
      tests: [TEST_ID],
      questions: Q_IDS.slice(),
      posts: [POST_ID],
    },
  };
}

async function deleteExact(col, ids, session) {
  const deleted = [];
  for (const id of ids) {
    const filter = { _id: oid(id) };
    const r = session
      ? await col.deleteOne(filter, { session })
      : await col.deleteOne(filter);
    if (r.deletedCount !== 1) {
      throw new Error(`deleteOne ${col.collectionName} ${id} deletedCount=${r.deletedCount}`);
    }
    deleted.push(id);
  }
  return deleted;
}

async function assertGone(db, colName, ids) {
  const n = await db.collection(colName).countDocuments({ _id: { $in: ids.map(oid) } });
  if (n !== 0) throw new Error(`${colName} still has ${n} allowlisted docs`);
}

async function remainingRefs(db) {
  const wanted = new Set([POST_ID, TEST_ID, ...Q_IDS, ...ATTEMPT_IDS]);
  const hits = [];
  const names = [
    'questions',
    'tests',
    'posts',
    'testattempts',
    'results',
    'learningsessions',
    'battlesessions',
    'practiceissuances',
    'notes',
    'pdfnotes',
    'subjects',
    'userlearninganalytics',
  ];
  for (const name of names) {
    const n = await db.collection(name).countDocuments();
    if (!n) continue;
    const docs = await db.collection(name).find({}).toArray();
    for (const doc of docs) {
      const found = idsInDoc(doc, wanted);
      if (found.length) hits.push({ collection: name, documentId: String(doc._id), ids: found });
    }
  }
  const extra = await scanUnexpectedRefs(db, wanted, names);
  return [...hits, ...extra];
}

function renderReport(data) {
  const gateRows = data.gates.map((g) => `| ${g.name} | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail} |`).join('\n');
  return `# Phase 9I — Controlled Smoke-Test Cleanup

## Database

- name: \`${data.database}\`
- host: \`${data.host}\`
- mode: **${data.mode}**
- transaction: ${data.transactionUsed ? 'yes' : data.transactionUsed === false ? 'staged (no transaction)' : 'n/a (dry-run)'}

## Pre-Cleanup Counts

| Collection | Count |
|---|---:|
| users | ${data.preCounts.users} |
| questions | ${data.preCounts.questions} |
| tests | ${data.preCounts.tests} |
| posts | ${data.preCounts.posts} |
| testAttempts | ${data.preCounts.testAttempts} |
| results | ${data.preCounts.results} |
| SET A | ${data.setACountBefore} |

## Preflight Gates

| Gate | Result | Detail |
|---|---|---|
${gateRows}

## Deletion Allowlist

- Results (discovered): ${data.deletedResultIds.map((id) => '`' + id + '`').join(', ') || '(none)'}
- TestAttempts: ${ATTEMPT_IDS.map((id) => '`' + id + '`').join(', ')}
- Test: \`${TEST_ID}\`
- Questions: ${Q_IDS.map((id) => '`' + id + '`').join(', ')}
- Post: \`${POST_ID}\`

## Deletion Order

1. Results
2. TestAttempts
3. Test
4. Questions
5. Post

## Deleted Results

${data.deletedResultIds.map((id) => `- \`${id}\``).join('\n') || '(not executed)'}

## Deleted Attempts

${data.deletedAttemptIds.map((id) => `- \`${id}\``).join('\n') || '(not executed)'}

## Deleted Test

${data.deletedTestIds.map((id) => `- \`${id}\``).join('\n') || '(not executed)'}

## Deleted Questions

${data.deletedQuestionIds.map((id) => `- \`${id}\``).join('\n') || '(not executed)'}

## Deleted Post

${data.deletedPostIds.map((id) => `- \`${id}\``).join('\n') || '(not executed)'}

## Post-Cleanup Counts

| Collection | Count |
|---|---:|
| users | ${data.postCounts?.users ?? 'n/a'} |
| questions | ${data.postCounts?.questions ?? 'n/a'} |
| tests | ${data.postCounts?.tests ?? 'n/a'} |
| posts | ${data.postCounts?.posts ?? 'n/a'} |
| testAttempts | ${data.postCounts?.testAttempts ?? 'n/a'} |
| results | ${data.postCounts?.results ?? 'n/a'} |
| SET A | ${data.setACountAfter ?? 'n/a'} |
| Phase 9 questions | ${data.phase9After?.questions ?? 'n/a'} |
| Phase 9 tests | ${data.phase9After?.tests ?? 'n/a'} |
| Phase 9 posts | ${data.phase9After?.posts ?? 'n/a'} |
| Phase 9 attempts | ${data.phase9After?.attempts ?? 'n/a'} |
| Phase 9 results | ${data.phase9After?.results ?? 'n/a'} |

## SET A Protection

SET A before: ${data.setACountBefore}  
SET A after: ${data.setACountAfter ?? 'n/a'}  
SET A deleted: ${data.setADeletedCount}  
SET A modified: ${data.setAModifiedCount}  
Presentation after: ${data.setAKindsAfter ? JSON.stringify(data.setAKindsAfter) : 'n/a'}

## User Protection

Users deleted: ${data.userDeletedCount}  
Users modified: ${data.userModifiedCount}

## Remaining References

${data.unexpectedReferences.length ? data.unexpectedReferences.map((r) => `- ${r.collection} \`${r.documentId}\` ${r.ids.join(',')}`).join('\n') : 'None.'}

## Verification

${data.verificationNotes.join('\n')}

## Final safety statement

Phase 9 Results deleted: ${data.deletedResultIds.length}  
Phase 9 TestAttempts deleted: ${data.deletedAttemptIds.length}  
Phase 9 Test deleted: ${data.deletedTestIds.length}  
Phase 9 Questions deleted: ${data.deletedQuestionIds.length}  
Phase 9 Post deleted: ${data.deletedPostIds.length}  

Users deleted: ${data.userDeletedCount}  
Users modified: ${data.userModifiedCount}  

SET A questions deleted: ${data.setADeletedCount}  
SET A questions modified: ${data.setAModifiedCount}  

Unexpected records deleted: ${data.unexpectedDeletedCount}

## Final Verdict

**${data.cleanupStatus}**
`;
}

async function main() {
  const approved = process.argv.includes(APPROVAL_FLAG);
  const uri = loadMongoUri();
  if (!uri) throw new Error('MONGODB_URI unavailable');
  const host = clusterHostFromUri(uri);

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 20_000,
    readPreference: 'primary',
  });
  await client.connect();

  try {
    const db = client.db();
    const pf = await preflight(db);

    const plan = {
      database: db.databaseName,
      host,
      preCounts: pf.preCounts,
      expectedPost: pf.expectedPost,
      deletionPlan: pf.deletionPlan,
      resultPairs: pf.resultPairs,
      gatesFailed: pf.gates.filter((g) => !g.ok).map((g) => `${g.name}: ${g.detail}`),
      gatesPassed: pf.gates.filter((g) => g.ok).map((g) => g.name),
    };

    console.log(JSON.stringify({ mode: approved ? 'APPROVED' : 'DRY-RUN', preflightOk: pf.ok, ...plan }, null, 2));

    if (!pf.ok) {
      console.error('PREFLIGHT FAILED — ZERO DELETES');
      process.exitCode = 1;
      return;
    }

    if (!approved) {
      console.log('CLEANUP NOT EXECUTED — APPROVAL FLAG REQUIRED');
      return;
    }

    const deleted = {
      results: [],
      testattempts: [],
      tests: [],
      questions: [],
      posts: [],
    };
    let transactionUsed = false;

    const runDeletes = async (session) => {
      deleted.results = await deleteExact(db.collection('results'), pf.resultIds, session);
      if (!session) await assertGone(db, 'results', pf.resultIds);
      deleted.testattempts = await deleteExact(db.collection('testattempts'), ATTEMPT_IDS, session);
      if (!session) await assertGone(db, 'testattempts', ATTEMPT_IDS);
      deleted.tests = await deleteExact(db.collection('tests'), [TEST_ID], session);
      if (!session) await assertGone(db, 'tests', [TEST_ID]);
      deleted.questions = await deleteExact(db.collection('questions'), Q_IDS, session);
      if (!session) await assertGone(db, 'questions', Q_IDS);
      deleted.posts = await deleteExact(db.collection('posts'), [POST_ID], session);
      if (!session) await assertGone(db, 'posts', [POST_ID]);
    };

    try {
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          await runDeletes(session);
        });
        transactionUsed = true;
      } finally {
        await session.endSession();
      }
    } catch (err) {
      const msg = String(err?.message || err);
      const txnUnsupported = /Transaction numbers are only allowed|replica set|not supported/i.test(msg);
      if (!txnUnsupported) {
        throw err;
      }
      console.warn('Transactions not available; using staged exact-ID deletes.');
      await runDeletes(null);
      transactionUsed = false;
    }

    await assertGone(db, 'results', pf.resultIds);
    await assertGone(db, 'testattempts', ATTEMPT_IDS);
    await assertGone(db, 'tests', [TEST_ID]);
    await assertGone(db, 'questions', Q_IDS);
    await assertGone(db, 'posts', [POST_ID]);

    const postCounts = {
      users: await db.collection('users').countDocuments(),
      questions: await db.collection('questions').countDocuments(),
      tests: await db.collection('tests').countDocuments(),
      posts: await db.collection('posts').countDocuments(),
      testAttempts: await db.collection('testattempts').countDocuments(),
      results: await db.collection('results').countDocuments(),
    };
    const remainingQuestions = await db.collection('questions').find({}).toArray();
    const setAAfter = remainingQuestions.filter((q) => !hasMarker(q));
    const setAKindsAfter = countKinds(setAAfter);
    const setAFpAfter = setAAfter
      .map((q) => `${q._id}:${q.updatedAt ? new Date(q.updatedAt).toISOString() : ''}`)
      .sort();
    const userIdsAfter = (await db.collection('users').find({}, { projection: { _id: 1 } }).toArray())
      .map((u) => String(u._id))
      .sort();

    const refs = await remainingRefs(db);
    const verificationNotes = [];
    const failNotes = [];

    if (postCounts.users !== pf.preCounts.users) failNotes.push(`users ${pf.preCounts.users} → ${postCounts.users}`);
    else verificationNotes.push('User count unchanged.');
    if (userIdsAfter.join(',') !== pf.userIds.join(',')) failNotes.push('user ID set changed');
    else verificationNotes.push('User ID set unchanged.');
    if (setAAfter.length !== SET_A_COUNT) failNotes.push(`SET A ${setAAfter.length}`);
    else verificationNotes.push('SET A still 250.');
    if (setAFpAfter.join('|') !== pf.setAFingerprint.join('|')) failNotes.push('SET A fingerprint (id+updatedAt) changed');
    else verificationNotes.push('No SET A question modified (id+updatedAt fingerprint).');
    for (const [k, n] of Object.entries(SET_A_KINDS)) {
      if (setAKindsAfter[k] !== n) failNotes.push(`SET A ${k}=${setAKindsAfter[k]}`);
    }
    if (remainingQuestions.some(hasMarker)) failNotes.push('Phase 9 marker still on questions');
    if (await db.collection('posts').findOne({ _id: oid(POST_ID) })) failNotes.push('Post still exists');
    if (await db.collection('tests').findOne({ _id: oid(TEST_ID) })) failNotes.push('Test still exists');
    if (refs.length) failNotes.push(`remaining references ${refs.length}`);
    else verificationNotes.push('No remaining references to Phase 9 IDs in scanned collections.');

    const countsMatch =
      postCounts.questions === pf.expectedPost.questions &&
      postCounts.tests === pf.expectedPost.tests &&
      postCounts.posts === pf.expectedPost.posts &&
      postCounts.testAttempts === pf.expectedPost.testAttempts &&
      postCounts.results === pf.expectedPost.results;
    if (!countsMatch) failNotes.push(`post counts ${JSON.stringify(postCounts)} expected ${JSON.stringify(pf.expectedPost)}`);
    else verificationNotes.push('Global counts match expected post-cleanup totals.');

    const cleanupStatus = failNotes.length ? 'FAIL' : 'PASS';
    const report = {
      database: db.databaseName,
      host,
      mode: 'EXECUTED',
      transactionUsed,
      gates: pf.gates,
      preCounts: pf.preCounts,
      postCounts,
      deletedResultIds: deleted.results,
      deletedAttemptIds: deleted.testattempts,
      deletedTestIds: deleted.tests,
      deletedQuestionIds: deleted.questions,
      deletedPostIds: deleted.posts,
      unexpectedReferences: refs,
      setACountBefore: SET_A_COUNT,
      setACountAfter: setAAfter.length,
      setADeletedCount: 0,
      setAModifiedCount: setAFpAfter.join('|') === pf.setAFingerprint.join('|') ? 0 : 1,
      setAKindsAfter,
      userDeletedCount: 0,
      userModifiedCount: userIdsAfter.join(',') === pf.userIds.join(',') ? 0 : 1,
      unexpectedDeletedCount: 0,
      phase9After: {
        questions: remainingQuestions.filter(hasMarker).length,
        tests: await db.collection('tests').countDocuments({ _id: oid(TEST_ID) }),
        posts: await db.collection('posts').countDocuments({ _id: oid(POST_ID) }),
        attempts: await db.collection('testattempts').countDocuments({ _id: { $in: ATTEMPT_IDS.map(oid) } }),
        results: await db.collection('results').countDocuments({ _id: { $in: pf.resultIds.map(oid) } }),
      },
      verificationNotes: [...verificationNotes, ...failNotes.map((f) => `FAIL: ${f}`)],
      cleanupStatus,
    };

    const jsonOut = {
      database: db.databaseName,
      preCounts: pf.preCounts,
      postCounts,
      deletedResultIds: deleted.results,
      deletedAttemptIds: deleted.testattempts,
      deletedTestIds: deleted.tests,
      deletedQuestionIds: deleted.questions,
      deletedPostIds: deleted.posts,
      unexpectedReferences: refs,
      setACountBefore: SET_A_COUNT,
      setACountAfter: setAAfter.length,
      setADeletedCount: 0,
      userDeletedCount: report.userDeletedCount,
      userModifiedCount: report.userModifiedCount,
      cleanupStatus,
      transactionUsed,
    };

    fs.writeFileSync(OUT_JSON, `${JSON.stringify(jsonOut, null, 2)}\n`);
    fs.writeFileSync(OUT_MD, renderReport(report));

    console.log(JSON.stringify({ executed: true, cleanupStatus, jsonOut }, null, 2));
    if (cleanupStatus !== 'PASS') process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
