/**
 * Phase 9A: create exactly ONE smoke-test exam Post via postService.create
 * (same path as Admin POST /api/posts). mongoose autoIndex: false.
 *
 * Does not create questions or tests. Does not touch SET A.
 *
 * Marker: PHASE9_SMOKE_TEST_2026
 * Run once: node scripts/create-phase9a-smoke-post.mjs
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
const POST_NAME = 'PHASE9_SMOKE_TEST_2026 — JKSSB Structured Question Test';
const POST_DESCRIPTION =
  'Smoke-test exam tag for Phase 9 structured-question flow. Not a real JKSSB post.';
const SNAPSHOT_PATH = path.join(__dirname, 'fixtures', 'set-a', 'PHASE9_smoke_post.json');
const SET_A_KINDS = { plain: 49, two_statements: 8, numbered_list: 179, table: 14 };

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

async function audit(db) {
  const questions = await db.collection('questions').find({}).toArray();
  const tests = await db.collection('tests').find({}).toArray();
  const posts = await db.collection('posts').find({}).toArray();
  const subjects = await db.collection('subjects').countDocuments({});
  const topics = await db.collection('topics').countDocuments({});
  const kinds = countKinds(questions);
  return {
    database: db.databaseName,
    questionCount: questions.length,
    testCount: tests.length,
    postCount: posts.length,
    subjectCount: subjects,
    topicCount: topics,
    kinds,
    questionIds: questions.map((q) => String(q._id)).sort(),
    questionUpdated: questions.map((q) => ({
      id: String(q._id),
      updatedAt: q.updatedAt ? new Date(q.updatedAt).toISOString() : null,
    })),
    markerQuestions: questions.filter(hasMarker).length,
    markerTests: tests.filter(hasMarker).length,
    markerPosts: posts.filter(hasMarker),
    posts: posts.map((p) => ({
      id: String(p._id),
      name: p.name,
      slug: p.slug,
      isActive: p.isActive !== false,
    })),
  };
}

async function main() {
  const uri = loadMongoUri();
  if (!uri) throw new Error('MONGODB_URI unavailable');
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'phase9a-import-only-not-for-tokens';
  }
  process.env.SYNC_INDEXES = 'false';

  const pre = await withNative(uri, async (db) => {
    if (db.databaseName !== EXPECTED_DB) {
      throw new Error(`database is ${db.databaseName}, expected ${EXPECTED_DB}`);
    }
    return audit(db);
  });

  if (pre.markerPosts.length) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          stop: true,
          reason: 'Existing PHASE9_SMOKE_TEST_2026 Post found',
          posts: pre.markerPosts.map((p) => ({
            id: String(p._id),
            name: p.name,
            slug: p.slug,
          })),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }
  if (pre.postCount !== 0) {
    throw new Error(
      `STOP: expected 0 Posts before Phase 9A, found ${pre.postCount}. Not creating another.`,
    );
  }
  if (pre.questionCount !== 250) {
    throw new Error(`pre-flight question count ${pre.questionCount}, expected 250`);
  }
  if (
    pre.kinds.plain !== SET_A_KINDS.plain ||
    pre.kinds.two_statements !== SET_A_KINDS.two_statements ||
    pre.kinds.numbered_list !== SET_A_KINDS.numbered_list ||
    pre.kinds.table !== SET_A_KINDS.table
  ) {
    throw new Error(`SET A presentation mismatch: ${JSON.stringify(pre.kinds)}`);
  }
  if (pre.testCount !== 0) {
    throw new Error(`pre-flight tests ${pre.testCount}, expected 0`);
  }

  mongoose.set('autoIndex', false);
  await mongoose.connect(uri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 15_000,
  });

  let created;
  try {
    const { postService } = await import(moduleUrl('src/services/postService.js'));
    created = await postService.create({
      name: POST_NAME,
      description: POST_DESCRIPTION,
    });
  } finally {
    await mongoose.disconnect();
  }

  const post = await withNative(uri, async (db) => {
    const after = await audit(db);
    if (after.questionCount !== 250) {
      throw new Error(`POST-CREATE: question count ${after.questionCount}, expected 250`);
    }
    if (JSON.stringify(after.questionIds) !== JSON.stringify(pre.questionIds)) {
      throw new Error('POST-CREATE: SET A question IDs changed');
    }
    if (JSON.stringify(after.questionUpdated) !== JSON.stringify(pre.questionUpdated)) {
      throw new Error('POST-CREATE: a Question updatedAt changed');
    }
    if (
      after.kinds.plain !== SET_A_KINDS.plain ||
      after.kinds.two_statements !== SET_A_KINDS.two_statements ||
      after.kinds.numbered_list !== SET_A_KINDS.numbered_list ||
      after.kinds.table !== SET_A_KINDS.table
    ) {
      throw new Error(`POST-CREATE: SET A presentation mismatch: ${JSON.stringify(after.kinds)}`);
    }
    if (after.testCount !== 0) {
      throw new Error(`POST-CREATE: tests ${after.testCount}, expected 0`);
    }
    if (after.markerQuestions !== 0 || after.markerTests !== 0) {
      throw new Error('POST-CREATE: unexpected Phase 9 questions or tests');
    }
    if (after.postCount !== 1) {
      throw new Error(`POST-CREATE: posts ${after.postCount}, expected 1`);
    }
    const doc = await db.collection('posts').findOne({ _id: created._id });
    if (!doc) throw new Error('POST-CREATE: created Post not found on read-back');
    if (!hasMarker(doc)) throw new Error('POST-CREATE: marker missing on Post');
    if (doc.isActive === false) throw new Error('POST-CREATE: Post is inactive');
    if (!doc.name || !doc.slug) throw new Error('POST-CREATE: name/slug missing');
    return { after, doc };
  });

  const snapshot = {
    marker: MARKER,
    database: pre.database,
    createdAt: new Date().toISOString(),
    postId: String(post.doc._id),
    name: post.doc.name,
    slug: post.doc.slug,
    isActive: post.doc.isActive !== false,
    description: post.doc.description || '',
  };
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        postId: snapshot.postId,
        name: snapshot.name,
        slug: snapshot.slug,
        isActive: snapshot.isActive,
        posts: 1,
        questions: post.after.questionCount,
        tests: post.after.testCount,
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
