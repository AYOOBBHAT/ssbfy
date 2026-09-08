/**
 * Phase 9B: create 4 NEW smoke-test questions + 1 mixed mock Test.
 * Uses questionService.create + testService.create (same validation as Admin).
 * mongoose autoIndex: false. Does not touch SET A. Does not create a Post.
 *
 * Marker: PHASE9_SMOKE_TEST_2026
 * Post: 6a9fe271a6683cc1b21ccded
 *
 * Run once: node scripts/create-phase9-smoke-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, ObjectId } from 'mongodb';
import mongoose from 'mongoose';
import { BACKEND_ROOT, loadBackendEnv, moduleUrl } from './lib/db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKER = 'PHASE9_SMOKE_TEST_2026';
const EXPECTED_DB = 'ssbfy';
const EXPECTED_POST_ID = '6a9fe271a6683cc1b21ccded';
const SNAPSHOT_PATH = path.join(__dirname, 'fixtures', 'set-a', 'PHASE9_smoke_test_ids.json');
const SET_A_KINDS = { plain: 49, two_statements: 8, numbered_list: 179, table: 14 };
const PRIVATE_KEYS = [
  'correctAnswers',
  'correctAnswerIndex',
  'correctAnswerValue',
  'explanation',
];

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

function loadMongoUri() {
  applyEnvFile();
  return String(process.env.MONGODB_URI || '').trim();
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
      expectedKind: 'plain',
      body: {
        questionType: 'single_correct',
        presentationKind: 'plain',
        questionText: `${MARKER}: Which option is the correct answer?`,
        options: [
          'Incorrect option',
          'Correct option',
          'Incorrect option',
          'Incorrect option',
        ],
        correctAnswers: [1],
        subjectId,
        topicId,
        postIds,
      },
    },
    {
      key: 'two_statements',
      expectedKind: 'two_statements',
      body: {
        questionType: 'single_correct',
        presentationKind: 'two_statements',
        content: {
          intro: `${MARKER}: Consider the following statements.`,
          statements: [
            {
              label: 'Statement – I',
              text: 'Shorter wavelengths of visible light are scattered more strongly by the atmosphere.',
            },
            {
              label: 'Statement – II',
              text: 'This phenomenon is known as Rayleigh scattering.',
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
      },
    },
    {
      key: 'numbered_list',
      expectedKind: 'numbered_list',
      body: {
        questionType: 'single_correct',
        presentationKind: 'numbered_list',
        content: {
          intro: `${MARKER}: Consider the following items.`,
          items: [
            { n: 1, text: 'First smoke-test item' },
            { n: 2, text: 'Second smoke-test item' },
            { n: 3, text: 'Third smoke-test item' },
          ],
          prompt: 'Which of the following is the correct option?',
        },
        options: ['Option one', 'Option two', 'Option three', 'Option four'],
        correctAnswers: [1],
        subjectId,
        topicId,
        postIds,
      },
    },
    {
      key: 'table',
      expectedKind: 'table',
      body: {
        questionType: 'single_correct',
        presentationKind: 'table',
        content: {
          intro: `${MARKER}: Consider the following table.`,
          columns: ['Item', 'Category'],
          rows: [
            ['Smoke Test A', 'Alpha'],
            ['Smoke Test B', 'Beta'],
          ],
          prompt: 'Which of the following observations is correct?',
        },
        options: [
          'Smoke Test A is Beta',
          'Smoke Test B is Alpha',
          'Both table entries are correctly represented',
          'Neither table entry is correctly represented',
        ],
        correctAnswers: [2],
        subjectId,
        topicId,
        postIds,
      },
    },
  ];
}

function assertCreatedQuestion(doc, spec) {
  if (!doc?._id) throw new Error(`${spec.key}: missing _id`);
  if ((doc.questionType || 'single_correct') !== 'single_correct') {
    throw new Error(`${spec.key}: questionType ${doc.questionType}`);
  }
  if (doc.presentationKind !== spec.expectedKind) {
    throw new Error(`${spec.key}: presentationKind ${doc.presentationKind}`);
  }
  const options = Array.isArray(doc.options) ? doc.options : [];
  if (options.length < 2) throw new Error(`${spec.key}: invalid options`);
  const answers = Array.isArray(doc.correctAnswers) ? doc.correctAnswers.map(Number) : [];
  if (answers.length !== 1) throw new Error(`${spec.key}: expected exactly one correct answer`);
  if (!Number.isInteger(answers[0]) || answers[0] < 0 || answers[0] >= options.length) {
    throw new Error(`${spec.key}: correct answer index out of range`);
  }
  if (!String(doc.questionText || '').trim()) {
    throw new Error(`${spec.key}: missing generated/stored questionText`);
  }
  const postIds = (doc.postIds || []).map(String);
  if (!postIds.includes(EXPECTED_POST_ID)) {
    throw new Error(`${spec.key}: missing Phase 9 Post in postIds`);
  }
  if (String(doc.subjectId) !== spec.body.subjectId) {
    throw new Error(`${spec.key}: subjectId mismatch`);
  }
  if (String(doc.topicId) !== spec.body.topicId) {
    throw new Error(`${spec.key}: topicId mismatch`);
  }
  if (spec.expectedKind !== 'plain') {
    if (!doc.content || typeof doc.content !== 'object') {
      throw new Error(`${spec.key}: missing structured content`);
    }
  }
}

function assertPublicProjection(pub, spec) {
  if (!pub) throw new Error(`${spec.key}: public projection empty`);
  if (!String(pub.questionText || '').trim()) {
    throw new Error(`${spec.key}: public missing questionText`);
  }
  if (!Array.isArray(pub.options) || pub.options.length < 2) {
    throw new Error(`${spec.key}: public missing options`);
  }
  if (pub.presentationKind !== spec.expectedKind) {
    throw new Error(`${spec.key}: public presentationKind ${pub.presentationKind}`);
  }
  if (spec.expectedKind !== 'plain' && (pub.content == null || typeof pub.content !== 'object')) {
    throw new Error(`${spec.key}: public missing content`);
  }
  const leaked = PRIVATE_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(pub, k));
  if (leaked.length) {
    throw new Error(`${spec.key}: public leaked ${leaked.join(', ')}`);
  }
}

async function main() {
  const uri = loadMongoUri();
  if (!uri) throw new Error('MONGODB_URI unavailable');
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'phase9b-import-only-not-for-tokens';
  }
  process.env.SYNC_INDEXES = 'false';

  const pre = await withNative(uri, async (db) => {
    if (db.databaseName !== EXPECTED_DB) {
      throw new Error(`database is ${db.databaseName}, expected ${EXPECTED_DB}`);
    }
    const questions = await db.collection('questions').find({}).toArray();
    const tests = await db.collection('tests').find({}).toArray();
    const markerQ = questions.filter(hasMarker);
    const markerT = tests.filter(hasMarker);
    if (markerQ.length || markerT.length) {
      throw new Error(
        `STOP: existing PHASE9_SMOKE_TEST_2026 records found (questions=${markerQ.length}, tests=${markerT.length})`,
      );
    }
    const kinds = countKinds(questions);
    if (questions.length !== 250) {
      throw new Error(`pre-flight question count ${questions.length}, expected 250`);
    }
    if (
      kinds.plain !== SET_A_KINDS.plain ||
      kinds.two_statements !== SET_A_KINDS.two_statements ||
      kinds.numbered_list !== SET_A_KINDS.numbered_list ||
      kinds.table !== SET_A_KINDS.table
    ) {
      throw new Error(`SET A presentation distribution mismatch: ${JSON.stringify(kinds)}`);
    }
    const post = await db.collection('posts').findOne({
      _id: new ObjectId(EXPECTED_POST_ID),
    });
    if (!post) throw new Error(`STOP: Phase 9 Post ${EXPECTED_POST_ID} not found`);
    if (post.isActive === false) throw new Error('STOP: Phase 9 Post is inactive');
    if (!hasMarker(post)) throw new Error('STOP: Phase 9 Post is missing the marker');
    const subject = await db
      .collection('subjects')
      .find({ isActive: { $ne: false } })
      .sort({ name: 1 })
      .limit(1)
      .next();
    if (!subject) throw new Error('No active Subject for smoke-test questions');
    const topic = await db
      .collection('topics')
      .find({
        subjectId: subject._id,
        isActive: { $ne: false },
      })
      .sort({ name: 1 })
      .limit(1)
      .next();
    if (!topic) throw new Error('No active Topic under the chosen Subject');
    return {
      database: db.databaseName,
      postCount: await db.collection('posts').countDocuments({}),
      testCount: tests.length,
      setAIds: questions.map((q) => String(q._id)).sort(),
      setAUpdated: questions.map((q) => ({
        id: String(q._id),
        updatedAt: q.updatedAt ? new Date(q.updatedAt).toISOString() : null,
      })),
      subjectId: String(subject._id),
      topicId: String(topic._id),
      subjectName: subject.name,
      topicName: topic.name,
      postId: String(post._id),
      postName: post.name,
      postActive: post.isActive !== false,
    };
  });

  mongoose.set('autoIndex', false);
  await mongoose.connect(uri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 15_000,
  });

  const created = [];
  let test = null;
  try {
    const { questionService, projectPublicQuestion } = await import(
      moduleUrl('src/services/questionService.js')
    );
    const { testService } = await import(moduleUrl('src/services/testService.js'));
    const specs = questionBodies(pre.subjectId, pre.topicId, [EXPECTED_POST_ID]);

    for (const spec of specs) {
      const doc = await questionService.create(spec.body);
      assertCreatedQuestion(doc, spec);
      const publicQ = projectPublicQuestion(doc);
      assertPublicProjection(publicQ, spec);
      const reloaded = await questionService.getById(String(doc._id));
      assertPublicProjection(reloaded, spec);
      created.push({
        key: spec.key,
        id: String(doc._id),
        presentationKind: doc.presentationKind,
      });
    }

    test = await testService.create({
      title: `${MARKER} — Structured Questions Mock`,
      kind: 'mock',
      questionIds: created.map((c) => c.id),
      duration: 10,
    });

    const catalog = await testService.listForDiscovery(null, { kind: 'mock' });
    const visible = (catalog || []).some((row) => String(row._id) === String(test._id));
    if (!visible) {
      throw new Error('Phase 9 mock Test is not visible in listForDiscovery(kind=mock)');
    }
  } finally {
    await mongoose.disconnect();
  }

  const after = await withNative(uri, async (db) => {
    const questions = await db.collection('questions').find({}).toArray();
    const tests = await db.collection('tests').find({}).toArray();
    const posts = await db.collection('posts').find({}).toArray();
    const markerQ = questions.filter(hasMarker);
    const markerT = tests.filter(hasMarker);
    const setA = questions.filter((q) => !hasMarker(q));
    const setAIds = setA.map((q) => String(q._id)).sort();
    const setAUpdated = setA.map((q) => ({
      id: String(q._id),
      updatedAt: q.updatedAt ? new Date(q.updatedAt).toISOString() : null,
    }));
    if (JSON.stringify(setAIds) !== JSON.stringify(pre.setAIds)) {
      throw new Error('SET A question IDs changed');
    }
    if (JSON.stringify(setAUpdated) !== JSON.stringify(pre.setAUpdated)) {
      throw new Error('A SET A question updatedAt changed');
    }
    if (posts.length !== pre.postCount) {
      throw new Error(`Post count changed ${pre.postCount} → ${posts.length}`);
    }
    return {
      questionCount: questions.length,
      testCount: tests.length,
      postCount: posts.length,
      markerQuestions: markerQ.length,
      markerTests: markerT.length,
      setACount: setA.length,
      setAKinds: countKinds(setA),
      phase9Kinds: countKinds(markerQ),
    };
  });

  const snapshot = {
    marker: MARKER,
    database: pre.database,
    createdAt: new Date().toISOString(),
    subjectId: pre.subjectId,
    subjectName: pre.subjectName,
    topicId: pre.topicId,
    topicName: pre.topicName,
    postId: EXPECTED_POST_ID,
    setAIds: pre.setAIds,
    questions: created,
    testId: test ? String(test._id) : null,
    testKind: test?.kind || null,
    testStatus: test?.status || null,
    testType: test?.type || null,
    duration: test?.duration ?? null,
    negativeMarking: test?.negativeMarking ?? null,
    questionIds: (test?.questionIds || []).map((id) => String(id)),
  };
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        subject: { id: pre.subjectId, name: pre.subjectName },
        topic: { id: pre.topicId, name: pre.topicName },
        postId: EXPECTED_POST_ID,
        questionsCreated: created.length,
        questions: created,
        testId: snapshot.testId,
        kind: snapshot.testKind,
        status: snapshot.testStatus,
        type: snapshot.testType,
        questionIds: snapshot.questionIds,
        after,
        mongodbAutoIndex: false,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
