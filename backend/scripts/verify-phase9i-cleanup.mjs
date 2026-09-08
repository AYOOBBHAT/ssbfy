/**
 * Phase 9I post-cleanup verifier. READ-ONLY.
 * Confirms Phase 9 smoke IDs are gone and SET A is intact.
 *
 * Run: node scripts/verify-phase9i-cleanup.mjs
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { BACKEND_ROOT, loadBackendEnv } from './lib/db.mjs';

const __filename = fileURLToPath(import.meta.url);
const EXPECTED_DB = 'ssbfy';
const MARKER = 'PHASE9_SMOKE_TEST_2026';
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
const SET_A_COUNT = 250;
const SET_A_KINDS = { plain: 49, two_statements: 8, numbered_list: 179, table: 14 };
const ALL_IDS = [POST_ID, TEST_ID, ...Q_IDS, ...ATTEMPT_IDS];

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
  if (hits.length) throw new Error(`Phase 9I verifier is not read-only: ${hits.join(', ')}`);
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

async function main() {
  assertReadOnlySource();
  const uri = loadMongoUri();
  if (!uri) throw new Error('MONGODB_URI unavailable');
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15_000,
    readPreference: 'primary',
  });
  await client.connect();
  const failures = [];
  try {
    const db = client.db();
    if (db.databaseName !== EXPECTED_DB) failures.push(`database ${db.databaseName}`);

    const questions = await db.collection('questions').find({}).toArray();
    const tests = await db.collection('tests').find({}).toArray();
    const posts = await db.collection('posts').find({}).toArray();
    const attempts = await db.collection('testattempts').find({}).toArray();
    const results = await db.collection('results').find({}).toArray();
    const users = await db.collection('users').countDocuments();

    for (const id of Q_IDS) {
      if (questions.some((q) => String(q._id) === id)) failures.push(`question still present ${id}`);
    }
    if (tests.some((t) => String(t._id) === TEST_ID)) failures.push('Phase 9 Test still present');
    if (posts.some((p) => String(p._id) === POST_ID)) failures.push('Phase 9 Post still present');
    for (const id of ATTEMPT_IDS) {
      if (attempts.some((a) => String(a._id) === id)) failures.push(`attempt still present ${id}`);
    }
    const leftoverResults = results.filter((r) => String(r.testId) === TEST_ID);
    if (leftoverResults.length) {
      failures.push(`Phase 9 Test still has ${leftoverResults.length} Result(s)`);
    }

    const setA = questions.filter((q) => !hasMarker(q));
    const markerQ = questions.filter(hasMarker);
    if (markerQ.length) failures.push(`Phase 9 marker questions remain ${markerQ.length}`);
    if (setA.length !== SET_A_COUNT) failures.push(`SET A ${setA.length}, expected ${SET_A_COUNT}`);
    const kinds = countKinds(setA);
    for (const [k, n] of Object.entries(SET_A_KINDS)) {
      if (kinds[k] !== n) failures.push(`SET A ${k}=${kinds[k]}, expected ${n}`);
    }

    const blob = JSON.stringify({ questions, tests, posts, attempts, results });
    const leftover = ALL_IDS.filter((id) => blob.includes(id));
    if (leftover.length) failures.push(`IDs still in core collections: ${leftover.join(',')}`);

    const listed = await db.listCollections({}, { nameOnly: true }).toArray();
    for (const name of listed.map((c) => c.name).filter((n) => !String(n).startsWith('system.'))) {
      if (['questions', 'tests', 'posts', 'testattempts', 'results'].includes(name)) continue;
      const n = await db.collection(name).countDocuments();
      if (!n || n > 8000) continue;
      const docs = await db.collection(name).find({}).toArray();
      const text = JSON.stringify(docs);
      const hits = ALL_IDS.filter((id) => text.includes(id));
      if (hits.length) failures.push(`${name} still references ${hits.join(',')}`);
    }

    if (questions.length !== SET_A_COUNT) {
      failures.push(`questions=${questions.length}, expected ${SET_A_COUNT}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: failures.length === 0,
          database: db.databaseName,
          counts: {
            users,
            questions: questions.length,
            tests: tests.length,
            posts: posts.length,
            testAttempts: attempts.length,
            results: results.length,
            setA: setA.length,
            phase9Questions: markerQ.length,
            phase9Tests: tests.filter((t) => String(t._id) === TEST_ID || hasMarker(t)).length,
            phase9Posts: posts.filter((p) => String(p._id) === POST_ID || hasMarker(p)).length,
            phase9Attempts: attempts.filter((a) => ATTEMPT_IDS.includes(String(a._id))).length,
          },
          setAPresentation: kinds,
          mongoWrites: 0,
          failures,
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
