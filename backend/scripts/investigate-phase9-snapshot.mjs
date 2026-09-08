/**
 * Phase 9D: READ-ONLY comparison of live Phase 9 Questions vs TestAttempt snapshot.
 * Native MongoDB driver only. Does not create, update, or delete anything.
 *
 * Run: node scripts/investigate-phase9-snapshot.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, ObjectId } from 'mongodb';
import { BACKEND_ROOT, loadBackendEnv } from './lib/db.mjs';
import { presentationFieldsFromQuestion } from '../src/utils/questionPresentation.js';

const __filename = fileURLToPath(import.meta.url);
const EXPECTED_DB = 'ssbfy';
const MARKER = 'PHASE9_SMOKE_TEST_2026';
const TEST_ID = '6aa01e61f2afe2eb763a4bda';
const ORDERED = [
  { key: 'Q1', id: '6aa01e60f2afe2eb763a4bc1', expectedKind: 'plain' },
  { key: 'Q2', id: '6aa01e60f2afe2eb763a4bc7', expectedKind: 'two_statements' },
  { key: 'Q3', id: '6aa01e61f2afe2eb763a4bcd', expectedKind: 'numbered_list' },
  { key: 'Q4', id: '6aa01e61f2afe2eb763a4bd3', expectedKind: 'table' },
];
const SET_A_COUNT = 250;
const SET_A_KINDS = { plain: 49, two_statements: 8, numbered_list: 179, table: 14 };
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
    throw new Error(`Phase 9D script is not read-only: ${hits.join(', ')}`);
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

function contentShape(content) {
  if (content == null) return { present: false, keys: [] };
  if (typeof content !== 'object') return { present: true, keys: [typeof content] };
  return { present: true, keys: Object.keys(content).sort() };
}

function liveRow(q, expectedKind) {
  const prepared = presentationFieldsFromQuestion(q || {});
  return {
    exists: !!q,
    liveKind: q?.presentationKind || null,
    expectedKind,
    liveKindMatchesExpected: (q?.presentationKind || 'plain') === expectedKind,
    liveContent: contentShape(q?.content),
    currentBuilderWouldEmit: {
      presentationKind: prepared.presentationKind,
      contentPresent: prepared.content != null,
    },
    questionTextLength: typeof q?.questionText === 'string' ? q.questionText.length : 0,
    optionCount: Array.isArray(q?.options) ? q.options.length : 0,
    hasCorrectAnswersArray: Array.isArray(q?.correctAnswers) && q.correctAnswers.length === 1,
  };
}

function snapRow(item) {
  if (!item) {
    return { present: false };
  }
  const prepared = presentationFieldsFromQuestion(item);
  return {
    present: true,
    snapshotKind: item.presentationKind ?? null,
    snapshotContent: contentShape(item.content),
    reviewApiWouldEmit: {
      presentationKind: prepared.presentationKind,
      contentPresent: prepared.content != null,
    },
    questionTextLength: typeof item.questionText === 'string' ? item.questionText.length : 0,
    optionCount: Array.isArray(item.options) ? item.options.length : 0,
    hasIsCorrect: typeof item.isCorrect === 'boolean',
  };
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
  try {
    const db = client.db();
    const failures = [];
    const notes = [];
    if (db.databaseName !== EXPECTED_DB) {
      failures.push(`database is ${db.databaseName}, expected ${EXPECTED_DB}`);
    }

    const questions = await db.collection('questions').find({}).toArray();
    const tests = await db.collection('tests').find({}).toArray();
    const posts = await db.collection('posts').find({}).toArray();
    const attempts = await db
      .collection('testattempts')
      .find({ testId: new ObjectId(TEST_ID) })
      .toArray();
    const results = await db
      .collection('results')
      .find({ testId: new ObjectId(TEST_ID) })
      .toArray();

    const setA = questions.filter((q) => !hasMarker(q));
    const phase9Q = questions.filter(hasMarker);
    const setAKinds = countKinds(setA);
    if (setA.length !== SET_A_COUNT) {
      failures.push(`SET A count ${setA.length}, expected ${SET_A_COUNT}`);
    }
    for (const [k, n] of Object.entries(SET_A_KINDS)) {
      if (setAKinds[k] !== n) failures.push(`SET A ${k}=${setAKinds[k]}, expected ${n}`);
    }

    const byId = new Map(questions.map((q) => [String(q._id), q]));
    const comparisons = ORDERED.map((spec) => {
      const live = byId.get(spec.id);
      const attempt = attempts[0];
      const items = Array.isArray(attempt?.resultSnapshot?.items)
        ? attempt.resultSnapshot.items
        : [];
      const item = items.find((it) => String(it.questionId) === spec.id);
      const liveInfo = liveRow(live, spec.expectedKind);
      const snapInfo = snapRow(item);
      return {
        key: spec.key,
        questionId: spec.id,
        live: liveInfo,
        snapshot: snapInfo,
        mismatch:
          liveInfo.liveKind !== (snapInfo.snapshotKind ?? null) ||
          liveInfo.liveContent.present !== Boolean(snapInfo.snapshotContent?.present),
      };
    });

    const a = attempts[0] || null;
    const r = results[0] || null;
    const resultKeys = r ? Object.keys(r).sort() : [];
    const resultHasQuestionSnapshot = resultKeys.some((k) =>
      /question|snapshot|presentation|content/i.test(k),
    );

    const out = {
      ok: failures.length === 0,
      database: db.databaseName,
      counts: {
        questions: questions.length,
        tests: tests.length,
        posts: posts.length,
        phase9Questions: phase9Q.length,
        phase9Tests: tests.filter(hasMarker).length,
        attemptsForTest: attempts.length,
        resultsForTest: results.length,
      },
      setA: { count: setA.length, presentation: setAKinds },
      attempt: a
        ? {
            id: String(a._id),
            testId: String(a.testId),
            userIdPresent: a.userId != null,
            attemptNumber: a.attemptNumber ?? null,
            completed: a.endTime != null,
            startTime: a.startTime || null,
            endTime: a.endTime || null,
            timeTaken: a.timeTaken ?? null,
            score: a.score ?? null,
            accuracy: a.accuracy ?? null,
            questionIds: (a.questionIds || []).map(String),
            snapshotVersion: a.resultSnapshot?.version ?? null,
            snapshotItemCount: Array.isArray(a.resultSnapshot?.items)
              ? a.resultSnapshot.items.length
              : 0,
          }
        : null,
      result: r
        ? {
            id: String(r._id),
            score: r.score,
            accuracy: r.accuracy,
            timeTaken: r.timeTaken,
            fields: resultKeys,
            storesQuestionSnapshots: resultHasQuestionSnapshot,
          }
        : null,
      comparisons,
      notes,
      failures,
    };

    if (attempts.length !== 1) {
      notes.push(`attempt count for Phase 9 Test is ${attempts.length}, expected 1`);
    }

    console.log(JSON.stringify(out, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
