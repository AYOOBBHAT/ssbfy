/**
 * Phase 5E-3: verify SET_A_metadata_import_ready.jsonl against live catalog.
 * File compares plus READ-ONLY Mongo counts/lookups. No question import.
 *
 * Run: node scripts/verify-set-a-metadata-import-ready.mjs
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { loadBackendEnv } from './lib/db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const IMPORT_PATH = path.join(FIXTURE_DIR, 'SET_A_import_ready.jsonl');
const METADATA_PATH = path.join(FIXTURE_DIR, 'SET_A_metadata_import_ready.jsonl');
const JSONL_PATH = path.join(FIXTURE_DIR, 'SET_A_structured.jsonl');
const ORIGINAL_KEY_PATH = path.join(FIXTURE_DIR, 'SET_A_answer_key.json');
const PROPOSED_KEY_PATH = path.join(FIXTURE_DIR, 'SET_A_final_answer_key_proposed.json');
const RESULT_JSON_PATH = path.join(FIXTURE_DIR, 'SET_A_catalog_creation_result.json');

const EXPECTED_IMPORT_SHA256 =
  '7aad2b3b0a772c1807dce9c326d599e204a99293fae2cd10e1248e4b4db03f40';
const EXPECTED_JSONL_SHA256 =
  '8025d729630c783c6c3b0d3ae33e3fc3322faa34356c8a9b263e94b8926e0fb4';
const EXPECTED_ORIGINAL_KEY_SHA256 =
  '07f77efbc334ca63e8c13b44c36adcf45c12fa86f7f839cf87351d4ee206b259';
const EXPECTED_PROPOSED_KEY_SHA256 =
  '1ba869a795b0bd6bd2c3b14c0d313f7166a1a645d1a4fb7f3c31336e44bfb4d8';
const EXPECTED_DB = 'ssbfy';
const CONTENT_KEYS = [
  'questionText',
  'questionType',
  'presentationKind',
  'content',
  'options',
  'correctAnswers',
  'explanation',
  'questionImage',
  'postIds',
  'sourceQuestionNumber',
];

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function loadJsonl(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        throw new Error(`${path.basename(filePath)} line ${i + 1}: ${err.message}`);
      }
    });
}

function withoutTaxonomy(rec) {
  const copy = { ...rec };
  delete copy.subject;
  delete copy.topic;
  return copy;
}

async function loadLiveCatalog(uri) {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10_000,
    readPreference: 'primary',
  });
  try {
    await client.connect();
    const db = client.db();
    assert.equal(db.databaseName, EXPECTED_DB, `database ${db.databaseName}`);
    const subjects = await db.collection('subjects').find({}).toArray();
    const topics = await db.collection('topics').find({}).toArray();
    return { subjects, topics, dbName: db.databaseName };
  } finally {
    await client.close();
  }
}

async function run() {
  test('metadata import file exists', () => {
    assert.equal(fs.existsSync(METADATA_PATH), true, `missing ${METADATA_PATH}`);
  });

  const source = loadJsonl(IMPORT_PATH);
  const enriched = loadJsonl(METADATA_PATH);

  test('1. exactly 250 records', () => {
    assert.equal(source.length, 250);
    assert.equal(enriched.length, 250);
  });

  test('2. question numbers 1–250', () => {
    assert.deepEqual(
      enriched.map((r) => r.sourceQuestionNumber),
      Array.from({ length: 250 }, (_, i) => i + 1),
    );
  });

  test('3. no duplicate records', () => {
    const seen = new Set();
    for (const rec of enriched) {
      assert.equal(seen.has(rec.sourceQuestionNumber), false, `dup Q${rec.sourceQuestionNumber}`);
      seen.add(rec.sourceQuestionNumber);
    }
  });

  test('7–8. every question has exactly one subject and one topic', () => {
    for (const rec of enriched) {
      assert.equal(typeof rec.subject, 'string');
      assert.equal(typeof rec.topic, 'string');
      assert.ok(rec.subject.trim().length > 0, `Q${rec.sourceQuestionNumber} empty subject`);
      assert.ok(rec.topic.trim().length > 0, `Q${rec.sourceQuestionNumber} empty topic`);
    }
  });

  test('9–13. original question fields unchanged', () => {
    for (let i = 0; i < 250; i += 1) {
      const src = source[i];
      const row = enriched[i];
      assert.equal(row.sourceQuestionNumber, src.sourceQuestionNumber);
      assert.deepEqual(withoutTaxonomy(row), src, `Q${src.sourceQuestionNumber} unexpected field changes`);
      for (const key of CONTENT_KEYS) {
        if (!(key in src) && !(key in row)) continue;
        assert.deepEqual(row[key], src[key], `Q${src.sourceQuestionNumber} ${key} changed`);
      }
    }
  });

  test('only expected additions are subject and topic', () => {
    for (let i = 0; i < 250; i += 1) {
      const srcKeys = Object.keys(source[i]);
      const rowKeys = Object.keys(enriched[i]);
      const extra = rowKeys.filter((k) => !srcKeys.includes(k));
      assert.deepEqual(extra.sort(), ['subject', 'topic'].sort(), `Q${source[i].sourceQuestionNumber} extra keys`);
    }
  });

  test('source hashes unchanged', () => {
    assert.equal(sha256File(IMPORT_PATH), EXPECTED_IMPORT_SHA256);
    assert.equal(sha256File(JSONL_PATH), EXPECTED_JSONL_SHA256);
    assert.equal(sha256File(ORIGINAL_KEY_PATH), EXPECTED_ORIGINAL_KEY_SHA256);
    assert.equal(sha256File(PROPOSED_KEY_PATH), EXPECTED_PROPOSED_KEY_SHA256);
  });

  loadBackendEnv();
  const uri = String(process.env.MONGODB_URI || '').trim();
  assert.ok(uri, 'MONGODB_URI unavailable; cannot verify live catalog');

  const live = await loadLiveCatalog(uri);
  const subjectById = new Map(live.subjects.map((s) => [String(s._id), s]));
  const topicById = new Map(live.topics.map((t) => [String(t._id), t]));

  test('live catalog size', () => {
    assert.equal(live.subjects.length, 11, `subjects ${live.subjects.length}`);
    assert.equal(live.topics.length, 48, `topics ${live.topics.length}`);
  });

  test('4–6, 14–15. every subject/topic exists and topics belong to the assigned subject', () => {
    const pairSeen = new Set();
    for (const rec of enriched) {
      const subject = subjectById.get(rec.subject);
      const topic = topicById.get(rec.topic);
      assert.ok(subject, `Q${rec.sourceQuestionNumber} unknown subject ${rec.subject}`);
      assert.ok(topic, `Q${rec.sourceQuestionNumber} unknown topic ${rec.topic}`);
      assert.equal(
        String(topic.subjectId),
        String(subject._id),
        `Q${rec.sourceQuestionNumber} topic ${rec.topic} does not belong to subject ${rec.subject}`,
      );
      pairSeen.add(`${rec.subject}::${rec.topic}`);
    }
    assert.ok(pairSeen.size >= 1);
  });

  if (fs.existsSync(RESULT_JSON_PATH)) {
    const result = JSON.parse(fs.readFileSync(RESULT_JSON_PATH, 'utf8'));
    test('catalog result IDs match live MongoDB', () => {
      assert.equal(result.database, EXPECTED_DB);
      assert.equal(result.questionsImported, 0);
      for (const s of result.subjects) {
        assert.ok(subjectById.has(s.id), `result subject missing live ${s.name}`);
        for (const t of s.topics) {
          const liveTopic = topicById.get(t.id);
          assert.ok(liveTopic, `result topic missing live ${s.name}/${t.name}`);
          assert.equal(String(liveTopic.subjectId), s.id);
        }
      }
    });
  }

  console.log('');
  console.log(`Database: ${live.dbName}`);
  console.log(`Subjects: ${live.subjects.length}`);
  console.log(`Topics: ${live.topics.length}`);
  console.log(`Metadata records: ${enriched.length}`);
  console.log(`Import-ready SHA-256: ${sha256File(IMPORT_PATH)}`);
  console.log('');
  console.log(`${passed} checks passed (no question import).`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
