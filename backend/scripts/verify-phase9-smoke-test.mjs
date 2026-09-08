/**
 * Phase 9 smoke-test integrity. READ-ONLY.
 * Native MongoDB driver only (no connectDb / autoIndex / writes).
 *
 * Verifies PHASE9_SMOKE_TEST_2026 questions + mock Test.
 * Does not delete, update, or insert anything.
 *
 * Run: node scripts/verify-phase9-smoke-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { BACKEND_ROOT, loadBackendEnv } from './lib/db.mjs';
import {
  prepareQuestionPresentation,
  presentationFieldsFromQuestion,
} from '../src/utils/questionPresentation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPECTED_DB = 'ssbfy';
const MARKER = 'PHASE9_SMOKE_TEST_2026';
const SET_A_COUNT = 250;
const SET_A_KINDS = { plain: 49, two_statements: 8, numbered_list: 179, table: 14 };
const ORDERED_KINDS = ['plain', 'two_statements', 'numbered_list', 'table'];
const EXPECTED_POST_ID = '6a9fe271a6683cc1b21ccded';
const PRIVATE_KEYS = [
  'correctAnswers',
  'correctAnswerIndex',
  'correctAnswerValue',
  'explanation',
];
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
  'commitValidRows',
];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function assertReadOnlySource() {
  const src = stripComments(fs.readFileSync(__filename, 'utf8'));
  const hits = FORBIDDEN.filter((token) => new RegExp(`\\b${token}\\s*\\(`, 'g').test(src));
  if (hits.length) {
    throw new Error(`Phase 9 verify script is not read-only: ${hits.join(', ')}`);
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

function projectPublicQuestionMirror(q) {
  const postIds = Array.isArray(q.postIds)
    ? q.postIds.map((p) => (p && typeof p === 'object' && p._id != null ? p._id : p))
    : q.postIds;
  return {
    _id: q._id,
    questionText: q.questionText,
    options: Array.isArray(q.options) ? [...q.options] : [],
    subjectId: q.subjectId,
    topicId: q.topicId,
    postIds,
    difficulty: q.difficulty,
    questionType: q.questionType || 'single_correct',
    questionImage: q.questionImage || '',
    year: q.year ?? null,
    ...presentationFieldsFromQuestion(q),
  };
}

function publicSourceOmitsPrivateFields() {
  const src = fs.readFileSync(
    path.join(BACKEND_ROOT, 'src', 'services', 'questionService.js'),
    'utf8',
  );
  const fn = src.match(/export function projectPublicQuestion\([\s\S]*?\nexport function projectPublicQuestions/);
  if (!fn) throw new Error('Could not locate projectPublicQuestion source');
  const body = fn[0];
  return PRIVATE_KEYS.filter((k) => new RegExp(`\\b${k}\\b`).test(body));
}

function validateQuestion(q, failures) {
  const id = String(q._id);
  const type = q.questionType || 'single_correct';
  if (type !== 'single_correct') {
    failures.push(`${id}: questionType is ${type}, expected single_correct`);
  }
  const options = Array.isArray(q.options) ? q.options : [];
  if (options.length < 2) {
    failures.push(`${id}: options length ${options.length}, expected >= 2`);
  }
  const answers = Array.isArray(q.correctAnswers) ? q.correctAnswers.map(Number) : [];
  if (answers.length !== 1) {
    failures.push(`${id}: expected exactly one correct answer`);
  } else if (!Number.isInteger(answers[0]) || answers[0] < 0 || answers[0] >= options.length) {
    failures.push(`${id}: correct answer index is out of range`);
  }
  const kind = q.presentationKind || 'plain';
  if (!ORDERED_KINDS.includes(kind)) {
    failures.push(`${id}: unexpected presentationKind ${kind}`);
  }
  const text = typeof q.questionText === 'string' ? q.questionText.trim() : '';
  if (!text) failures.push(`${id}: missing generated/stored questionText`);
  try {
    const prepared = prepareQuestionPresentation({
      presentationKind: kind,
      content: q.content,
      questionText: q.questionText,
    });
    if (prepared.presentationKind !== kind) {
      failures.push(`${id}: prepared presentationKind ${prepared.presentationKind}`);
    }
    if (!String(prepared.questionText || '').trim()) {
      failures.push(`${id}: flatten produced empty questionText`);
    }
  } catch (err) {
    failures.push(`${id}: structured content invalid (${err.message})`);
  }
  const pub = projectPublicQuestionMirror(q);
  const leaked = PRIVATE_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(pub, k));
  if (leaked.length) {
    failures.push(`${id}: public projection leaked ${leaked.join(', ')}`);
  }
  if (!pub.questionText || !Array.isArray(pub.options) || !pub.presentationKind) {
    failures.push(`${id}: public projection missing questionText/options/presentationKind`);
  }
  if (kind !== 'plain' && (pub.content == null || typeof pub.content !== 'object')) {
    failures.push(`${id}: public projection missing structured content`);
  }
  const postIds = Array.isArray(q.postIds) ? q.postIds.map(String) : [];
  if (!postIds.includes(EXPECTED_POST_ID)) {
    failures.push(`${id}: missing Phase 9 Post ${EXPECTED_POST_ID}`);
  }
}

async function main() {
  assertReadOnlySource();
  const uri = loadMongoUri();
  if (!uri) throw new Error('MONGODB_URI unavailable');

  const sourceLeaks = publicSourceOmitsPrivateFields();
  const failures = [];
  const passes = [];

  if (sourceLeaks.length) {
    failures.push(`projectPublicQuestion source mentions private keys: ${sourceLeaks.join(', ')}`);
  } else {
    passes.push('projectPublicQuestion source does not emit private answer fields.');
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15_000,
    readPreference: 'primary',
  });
  await client.connect();
  try {
    const db = client.db();
    if (db.databaseName !== EXPECTED_DB) {
      failures.push(`database is ${db.databaseName}, expected ${EXPECTED_DB}`);
    } else {
      passes.push(`database is ${EXPECTED_DB}`);
    }

    const questions = await db.collection('questions').find({}).toArray();
    const tests = await db.collection('tests').find({}).toArray();
    const phase9Questions = questions.filter(hasMarker);
    const posts = await db.collection('posts').find({}).toArray();
    const phase9Posts = posts.filter(hasMarker);
    if (phase9Posts.length !== 1) {
      failures.push(`Phase 9 Posts=${phase9Posts.length}, expected 1`);
    } else if (String(phase9Posts[0]._id) !== EXPECTED_POST_ID) {
      failures.push(`Phase 9 Post id ${phase9Posts[0]._id}, expected ${EXPECTED_POST_ID}`);
    } else if (phase9Posts[0].isActive === false) {
      failures.push('Phase 9 Post is inactive');
    } else {
      passes.push(`Phase 9 Post ${EXPECTED_POST_ID} is present and active.`);
    }

    if (questions.length !== SET_A_COUNT + 4 && phase9Questions.length === 4) {
      failures.push(`total questions=${questions.length}, expected ${SET_A_COUNT + 4}`);
    }
    const setAQuestions = questions.filter((q) => !hasMarker(q));
    const phase9Tests = tests.filter(hasMarker);
    const setAKinds = countKinds(setAQuestions);
    const phase9Kinds = countKinds(phase9Questions);

    if (setAQuestions.length !== SET_A_COUNT) {
      failures.push(`SET A question count ${setAQuestions.length}, expected ${SET_A_COUNT}`);
    } else {
      passes.push(`SET A still has ${SET_A_COUNT} questions (no marker).`);
    }
    for (const [kind, expected] of Object.entries(SET_A_KINDS)) {
      if (setAKinds[kind] !== expected) {
        failures.push(`SET A ${kind}=${setAKinds[kind]}, expected ${expected}`);
      }
    }
    if (!failures.some((f) => f.startsWith('SET A '))) {
      passes.push(
        `SET A presentation unchanged: plain ${setAKinds.plain}, two_statements ${setAKinds.two_statements}, numbered_list ${setAKinds.numbered_list}, table ${setAKinds.table}.`,
      );
    }

    const ids = phase9Questions.map((q) => String(q._id));
    if (new Set(ids).size !== ids.length) {
      failures.push('Phase 9 question IDs are not unique');
    }
    if (phase9Questions.length !== 4) {
      failures.push(`Phase 9 questions=${phase9Questions.length}, expected 4`);
    } else {
      passes.push('Exactly four PHASE9_SMOKE_TEST_2026 questions.');
    }
    for (const kind of ORDERED_KINDS) {
      if (phase9Kinds[kind] !== 1) {
        failures.push(`Phase 9 ${kind}=${phase9Kinds[kind]}, expected 1`);
      }
    }
    if (ORDERED_KINDS.every((k) => phase9Kinds[k] === 1)) {
      passes.push('Phase 9 has one of each presentationKind.');
    }
    for (const q of phase9Questions) validateQuestion(q, failures);

    if (phase9Tests.length !== 1) {
      failures.push(`Phase 9 tests=${phase9Tests.length}, expected 1`);
    } else {
      const test = phase9Tests[0];
      const kind = test.kind || 'mock';
      const qids = Array.isArray(test.questionIds) ? test.questionIds.map(String) : [];
      if (kind !== 'mock') failures.push(`Phase 9 Test kind=${kind}, expected mock`);
      if (qids.length !== 4) {
        failures.push(`Phase 9 Test questionIds length=${qids.length}, expected 4`);
      }
      const setAIds = new Set(setAQuestions.map((q) => String(q._id)));
      const setAHits = qids.filter((id) => setAIds.has(id));
      if (setAHits.length) {
        failures.push(`Phase 9 Test includes ${setAHits.length} SET A questionId(s)`);
      }
      const byId = new Map(phase9Questions.map((q) => [String(q._id), q]));
      const orderedKinds = qids.map((id) => byId.get(id)?.presentationKind || 'missing');
      const orderOk = ORDERED_KINDS.every((k, i) => orderedKinds[i] === k);
      if (!orderOk) {
        failures.push(`Phase 9 Test question order is ${orderedKinds.join(', ')}`);
      } else if (qids.length === 4) {
        passes.push('Phase 9 Test questionIds are plain → two_statements → numbered_list → table.');
      }
      const missing = qids.filter((id) => !byId.has(id));
      if (missing.length) {
        failures.push(`Phase 9 Test references ${missing.length} unknown questionId(s)`);
      }
      const status = test.status || 'active';
      const discoverable =
        status !== 'disabled' && qids.length > 0 && (kind === 'mock' || test.kind == null);
      if (status === 'active' && kind === 'mock' && qids.length === 4 && !setAHits.length) {
        passes.push(`Exactly one Phase 9 mock Test (status=${status}).`);
      }
      if (!discoverable) {
        failures.push('Phase 9 Test would not be visible in the mock catalog');
      } else {
        passes.push('Phase 9 Test meets mock catalog discovery rules (active, non-empty, kind=mock).');
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: failures.length === 0,
          database: db.databaseName,
          questionCount: questions.length,
          testCount: tests.length,
          setA: { count: setAQuestions.length, presentation: setAKinds },
          phase9: {
            questions: phase9Questions.length,
            tests: phase9Tests.length,
            presentation: phase9Kinds,
            questionIds: ids,
            testId: phase9Tests[0] ? String(phase9Tests[0]._id) : null,
          },
          passes,
          failures,
        },
        null,
        2,
      ),
    );

    if (failures.length) {
      process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
