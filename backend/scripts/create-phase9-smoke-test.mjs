/**
 * Phase 9: create 4 NEW smoke-test questions + 1 mixed mock Test.
 * Uses questionService.create + testService.create (same validation as Admin).
 * mongoose autoIndex: false. Does not touch SET A questions.
 *
 * Marker: PHASE9_SMOKE_TEST_2026
 *
 * Requires at least one existing active Post (global subjects need postIds).
 * This script never creates a Post.
 *
 * Run once: node scripts/create-phase9-smoke-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import { BACKEND_ROOT, loadBackendEnv, moduleUrl } from './lib/db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKER = 'PHASE9_SMOKE_TEST_2026';
const EXPECTED_DB = 'ssbfy';
const SNAPSHOT_PATH = path.join(__dirname, 'fixtures', 'set-a', 'PHASE9_smoke_test_ids.json');

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function loadMongoUri() {
  applyEnvFile();
  return String(process.env.MONGODB_URI || '').trim();
}

function hasMarker(doc) {
  return JSON.stringify(doc).includes(MARKER);
}

async function withNative(uri, fn) {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15_000,
    readPreference: 'primary',
  });
  await client.connect();
  try {
    return await fn(client.db());
  } finally {
    await client.close();
  }
}

function questionBodies(subjectId, topicId, postIds) {
  return [
    {
      key: 'plain',
      body: {
        questionType: 'single_correct',
        presentationKind: 'plain',
        questionText: `${MARKER} Which option is the correct answer for this Phase 9 smoke test?`,
        options: ['Wrong', 'Correct', 'Wrong', 'Wrong'],
        correctAnswers: [1],
        subjectId,
        topicId,
        postIds,
        difficulty: 'easy',
      },
    },
    {
      key: 'two_statements',
      body: {
        questionType: 'single_correct',
        presentationKind: 'two_statements',
        content: {
          intro: `${MARKER} Consider the following statements.`,
          statements: [
            {
              label: 'Statement – I',
              text: 'The sky appears blue because shorter wavelengths are scattered more strongly.',
            },
            {
              label: 'Statement – II',
              text: 'The phenomenon is called Rayleigh scattering.',
            },
          ],
          prompt: 'Which of the statements given above is/are correct?',
        },
        options: [
          'Statement I only',
          'Statement II only',
          'Both Statement I and Statement II',
          'Neither Statement I nor Statement II',
        ],
        correctAnswers: [2],
        subjectId,
        topicId,
        postIds,
        difficulty: 'easy',
      },
    },
    {
      key: 'numbered_list',
      body: {
        questionType: 'single_correct',
        presentationKind: 'numbered_list',
        content: {
          intro: `${MARKER} Consider the following items.`,
          items: [
            { n: 1, text: 'First smoke-test item' },
            { n: 2, text: 'Second smoke-test item' },
            { n: 3, text: 'Third smoke-test item' },
          ],
          prompt: 'Which of the following is the correct observation?',
        },
        options: ['Option one', 'Option two', 'Option three', 'Option four'],
        correctAnswers: [1],
        subjectId,
        topicId,
        postIds,
        difficulty: 'easy',
      },
    },
    {
      key: 'table',
      body: {
        questionType: 'single_correct',
        presentationKind: 'table',
        content: {
          intro: `${MARKER} Consider the following table.`,
          columns: ['Item', 'Category'],
          rows: [
            ['Smoke Test A', 'Alpha'],
            ['Smoke Test B', 'Beta'],
          ],
          prompt: 'Which option correctly represents the table?',
        },
        options: ['Alpha only', 'Beta only', 'Both Alpha and Beta', 'Neither Alpha nor Beta'],
        correctAnswers: [2],
        subjectId,
        topicId,
        postIds,
        difficulty: 'easy',
      },
    },
  ];
}

async function main() {
  const uri = loadMongoUri();
  if (!uri) throw new Error('MONGODB_URI unavailable');
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'phase9-import-only-not-for-tokens';
  }
  process.env.SYNC_INDEXES = 'false';

  const pre = await withNative(uri, async (db) => {
    if (db.databaseName !== EXPECTED_DB) {
      throw new Error(`database is ${db.databaseName}, expected ${EXPECTED_DB}`);
    }
    const questions = await db.collection('questions').find({}).toArray();
    const tests = await db.collection('tests').find({}).toArray();
    if (questions.filter(hasMarker).length || tests.filter(hasMarker).length) {
      throw new Error('STOP: existing PHASE9_SMOKE_TEST_2026 records found');
    }
    const kinds = { plain: 0, two_statements: 0, numbered_list: 0, table: 0 };
    for (const q of questions) {
      const k = q.presentationKind || 'plain';
      if (k in kinds) kinds[k] += 1;
    }
    if (questions.length !== 250) {
      throw new Error(`pre-flight question count ${questions.length}, expected 250`);
    }
    if (kinds.plain !== 49 || kinds.two_statements !== 8 || kinds.numbered_list !== 179 || kinds.table !== 14) {
      throw new Error(`SET A presentation distribution mismatch: ${JSON.stringify(kinds)}`);
    }
    const subject = await db.collection('subjects').findOne({ isActive: { $ne: false } });
    if (!subject) throw new Error('No active Subject for smoke-test questions');
    const topic = await db.collection('topics').findOne({
      subjectId: subject._id,
      isActive: { $ne: false },
    });
    if (!topic) throw new Error('No active Topic under the chosen Subject');
    const posts = await db.collection('posts').find({ isActive: { $ne: false } }).toArray();
    if (!posts.length) {
      throw new Error(
        'STOP: questionService.create requires at least one existing Post tag for global subjects. ' +
          'The posts collection is empty. Creating a Post is outside Phase 9 allowed writes ' +
          '(4 questions + 1 mock Test only). No questions or tests were created.',
      );
    }
    return {
      database: db.databaseName,
      setAIds: questions.map((q) => ({
        id: String(q._id),
        updatedAt: q.updatedAt ? new Date(q.updatedAt).toISOString() : null,
        presentationKind: q.presentationKind || 'plain',
      })),
      subjectId: String(subject._id),
      topicId: String(topic._id),
      subjectName: subject.name,
      topicName: topic.name,
      postId: String(posts[0]._id),
      postName: posts[0].name,
    };
  });

  mongoose.set('autoIndex', false);
  await mongoose.connect(uri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 15_000,
  });

  const { questionService } = await import(moduleUrl('src/services/questionService.js'));
  const { testService } = await import(moduleUrl('src/services/testService.js'));

  const created = [];
  try {
    for (const spec of questionBodies(pre.subjectId, pre.topicId, [pre.postId])) {
      const doc = await questionService.create(spec.body);
      created.push({ key: spec.key, id: String(doc._id), presentationKind: doc.presentationKind });
    }

    const orderedIds = created.map((c) => c.id);
    const test = await testService.create({
      title: `${MARKER} Mixed mock (plain, two_statements, numbered_list, table)`,
      kind: 'mock',
      questionIds: orderedIds,
      duration: 10,
      negativeMarking: 0,
    });

    const snapshot = {
      marker: MARKER,
      database: pre.database,
      createdAt: new Date().toISOString(),
      subjectId: pre.subjectId,
      topicId: pre.topicId,
      postId: pre.postId,
      setAIds: pre.setAIds.map((r) => r.id),
      questions: created,
      testId: String(test._id),
      testKind: test.kind,
      testStatus: test.status,
      questionIds: (test.questionIds || []).map((id) => String(id)),
    };
    fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

    console.log(
      JSON.stringify(
        {
          ok: true,
          questionsCreated: created.length,
          testId: String(test._id),
          kind: test.kind,
          status: test.status,
          questionIds: snapshot.questionIds,
          mongodbAutoIndex: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
