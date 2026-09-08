/**
 * Phase 5E-0: READ-ONLY dump of live Subject + Topic taxonomy.
 * Uses the MongoDB driver only. Never calls connectDb() / mongoose.connect().
 *
 * Run: node scripts/dump-live-subject-topic-taxonomy.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { BACKEND_ROOT, loadBackendEnv } from './lib/db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const OUT_JSON = path.join(FIXTURE_DIR, 'SET_A_live_taxonomy_dump.json');
const OUT_MD = path.join(FIXTURE_DIR, 'SET_A_live_taxonomy_dump.md');

const JSONL_PATH = path.join(FIXTURE_DIR, 'SET_A_structured.jsonl');
const IMPORT_PATH = path.join(FIXTURE_DIR, 'SET_A_import_ready.jsonl');
const ORIGINAL_KEY_PATH = path.join(FIXTURE_DIR, 'SET_A_answer_key.json');

const EXPECTED_IMPORT_SHA256 =
  '7aad2b3b0a772c1807dce9c326d599e204a99293fae2cd10e1248e4b4db03f40';
const EXPECTED_JSONL_SHA256 =
  '8025d729630c783c6c3b0d3ae33e3fc3322faa34356c8a9b263e94b8926e0fb4';
const EXPECTED_ORIGINAL_KEY_SHA256 =
  '07f77efbc334ca63e8c13b44c36adcf45c12fa86f7f839cf87351d4ee206b259';

/**
 * Exact mongoose default collection names from:
 *   mongoose.model('Subject', …) → 'subjects'
 *   mongoose.model('Topic', …)   → 'topics'
 * Confirmed by reading Subject.js / Topic.js (no custom collection option).
 */
const SUBJECT_COLLECTION = 'subjects';
const TOPIC_COLLECTION = 'topics';

const FORBIDDEN = [
  'insertOne',
  'insertMany',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'bulkWrite',
  'createCollection',
  'createIndex',
  'dropCollection',
  'dropIndex',
];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertSourceHashes(when) {
  const checks = [
    [IMPORT_PATH, EXPECTED_IMPORT_SHA256, 'SET_A_import_ready.jsonl'],
    [JSONL_PATH, EXPECTED_JSONL_SHA256, 'SET_A_structured.jsonl'],
    [ORIGINAL_KEY_PATH, EXPECTED_ORIGINAL_KEY_SHA256, 'SET_A_answer_key.json'],
  ];
  for (const [filePath, expected, label] of checks) {
    const actual = sha256File(filePath);
    if (actual !== expected) {
      console.error(`STOP: ${label} hash changed ${when}.`);
      console.error(`  expected ${expected}`);
      console.error(`  actual   ${actual}`);
      process.exit(1);
    }
  }
}

function assertReadOnlySource() {
  const src = stripComments(fs.readFileSync(__filename, 'utf8'));
  const hits = FORBIDDEN.filter((token) => {
    const re = new RegExp(`\\b${token}\\s*\\(`, 'g');
    return re.test(src);
  });
  if (hits.length) {
    console.error(
      `STOP: dump script is not read-only; forbidden call(s): ${hits.join(', ')}`,
    );
    process.exit(1);
  }
}

function oidString(value) {
  if (value == null || value === '') return null;
  return String(value);
}

function pickSubject(doc) {
  const row = { id: String(doc._id) };
  if (typeof doc.name === 'string') row.name = doc.name;
  if (doc.postId != null && doc.postId !== '') row.postId = oidString(doc.postId);
  if (doc.order !== undefined && doc.order !== null) row.order = doc.order;
  if (Object.prototype.hasOwnProperty.call(doc, 'isActive')) row.isActive = doc.isActive;
  return row;
}

function pickTopic(doc) {
  const row = { id: String(doc._id) };
  if (doc.subjectId != null && doc.subjectId !== '') {
    row.subjectId = oidString(doc.subjectId);
  }
  if (typeof doc.name === 'string') row.name = doc.name;
  if (Object.prototype.hasOwnProperty.call(doc, 'isActive')) row.isActive = doc.isActive;
  if (doc.order !== undefined && doc.order !== null) row.order = doc.order;
  return row;
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function buildValidation(subjects, topics) {
  const subjectIds = new Set(subjects.map((s) => s.id));
  const missingSubjectId = [];
  const nonexistentSubject = [];
  for (const t of topics) {
    if (!t.subjectId) {
      missingSubjectId.push(t);
      continue;
    }
    if (!subjectIds.has(t.subjectId)) nonexistentSubject.push(t);
  }

  const subjectNameMap = new Map();
  for (const s of subjects) {
    const key = String(s.name || '').trim().toLowerCase();
    if (!subjectNameMap.has(key)) subjectNameMap.set(key, []);
    subjectNameMap.get(key).push(s);
  }
  const duplicateSubjectNames = [...subjectNameMap.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([name, list]) => ({ name, ids: list.map((s) => s.id) }));

  const topicNameMap = new Map();
  for (const t of topics) {
    const key = `${String(t.subjectId || '')}::${String(t.name || '').trim().toLowerCase()}`;
    if (!topicNameMap.has(key)) topicNameMap.set(key, []);
    topicNameMap.get(key).push(t);
  }
  const duplicateTopicNames = [...topicNameMap.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([, list]) => ({
      subjectId: list[0].subjectId || null,
      name: list[0].name || '',
      ids: list.map((t) => t.id),
    }));

  const inactiveSubjects = subjects.filter((s) => s.isActive === false);
  const inactiveTopics = topics.filter((t) => t.isActive === false);
  const activeSubjects = subjects.filter((s) => s.isActive !== false);
  const activeTopics = topics.filter((t) => t.isActive !== false);

  return {
    subjectCount: subjects.length,
    topicCount: topics.length,
    activeSubjectCount: activeSubjects.length,
    inactiveSubjectCount: inactiveSubjects.length,
    activeTopicCount: activeTopics.length,
    inactiveTopicCount: inactiveTopics.length,
    topicsWithMissingSubject: missingSubjectId.map((t) => t.id),
    topicsReferencingNonexistentSubject: nonexistentSubject.map((t) => ({
      id: t.id,
      subjectId: t.subjectId || null,
    })),
    duplicateSubjectNames,
    duplicateTopicNames,
    inactiveSubjects: inactiveSubjects.map((s) => ({ id: s.id, name: s.name || '' })),
    inactiveTopics: inactiveTopics.map((t) => ({
      id: t.id,
      name: t.name || '',
      subjectId: t.subjectId || null,
    })),
  };
}

function renderMarkdown({ generatedAt, subjects, topics, validation, subjectById }) {
  const subjectRows = subjects
    .map(
      (s, i) =>
        `| ${i + 1} | ${escapeCell(s.id)} | ${escapeCell(s.name ?? '')} | ${
          Object.prototype.hasOwnProperty.call(s, 'isActive') ? s.isActive : ''
        } | ${s.order ?? ''} |`,
    )
    .join('\n');

  const topicRows = topics
    .map((t) => {
      const subjectName = t.subjectId ? subjectById.get(t.subjectId)?.name || t.subjectId : '(missing subjectId)';
      return `| ${escapeCell(subjectName)} | ${escapeCell(t.id)} | ${escapeCell(t.name ?? '')} | ${
        Object.prototype.hasOwnProperty.call(t, 'isActive') ? t.isActive : ''
      } | ${t.order ?? ''} |`;
    })
    .join('\n');

  const dist = new Map();
  for (const s of subjects) dist.set(s.id, { name: s.name || s.id, count: 0 });
  for (const t of topics) {
    if (t.subjectId && dist.has(t.subjectId)) {
      dist.get(t.subjectId).count += 1;
    }
  }
  const distRows = [...dist.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => `| ${escapeCell(d.name)} | ${d.count} |`)
    .join('\n');

  const dupSubjects = validation.duplicateSubjectNames.length
    ? validation.duplicateSubjectNames
        .map((d) => `- \`${d.name}\` → ${d.ids.join(', ')}`)
        .join('\n')
    : 'None.';
  const dupTopics = validation.duplicateTopicNames.length
    ? validation.duplicateTopicNames
        .map((d) => `- subject ${d.subjectId} / \`${d.name}\` → ${d.ids.join(', ')}`)
        .join('\n')
    : 'None.';

  return `# SET A Live SSBFY Taxonomy Dump

Generated: ${generatedAt}
Read-only: YES

## Subjects

| # | Subject ID | Subject Name | Active | Order |
|---|---|---|---|---|
${subjectRows || '| — | — | — | — | — |'}

## Topics

| Subject | Topic ID | Topic Name | Active | Order |
|---|---|---|---|---|
${topicRows || '| — | — | — | — | — |'}

## Topic Distribution

| Subject | Number of Topics |
|---|---:|
${distRows || '| — | 0 |'}

## Validation

- Subject count: ${validation.subjectCount}
- Topic count: ${validation.topicCount}
- Topics with missing subject: ${validation.topicsWithMissingSubject.length}
- Topics referencing nonexistent subject: ${validation.topicsReferencingNonexistentSubject.length}
- Duplicate subject names: ${validation.duplicateSubjectNames.length}
- Duplicate topic names within same subject: ${validation.duplicateTopicNames.length}
- Inactive subjects: ${validation.inactiveSubjectCount}
- Inactive topics: ${validation.inactiveTopicCount}

### Duplicate subject names

${dupSubjects}

### Duplicate topic names within the same subject

${dupTopics}

### Topics with missing subjectId

${
  validation.topicsWithMissingSubject.length
    ? validation.topicsWithMissingSubject.map((id) => `- ${id}`).join('\n')
    : 'None.'
}

### Topics referencing a nonexistent subject

${
  validation.topicsReferencingNonexistentSubject.length
    ? validation.topicsReferencingNonexistentSubject
        .map((t) => `- topic ${t.id} → subjectId ${t.subjectId}`)
        .join('\n')
    : 'None.'
}

### Inactive subjects

${
  validation.inactiveSubjects.length
    ? validation.inactiveSubjects.map((s) => `- ${s.id} ${s.name}`).join('\n')
    : 'None.'
}

### Inactive topics

${
  validation.inactiveTopics.length
    ? validation.inactiveTopics.map((t) => `- ${t.id} ${t.name}`).join('\n')
    : 'None.'
}
`;
}

async function main() {
  console.log('SET A taxonomy dump: READ-ONLY mode');
  assertReadOnlySource();
  assertSourceHashes('before dump');

  loadBackendEnv();
  const uri = String(process.env.MONGODB_URI || '').trim();
  if (!uri) {
    console.error('Live taxonomy dump blocked: MONGODB_URI is unavailable.');
    assertSourceHashes('after blocked dump');
    process.exit(1);
  }

  let client;
  try {
    client = new MongoClient(uri, { readPreference: 'primary' });
    await client.connect();
    console.log('MongoDB connection established — READ-ONLY queries only');

    const db = client.db();

    console.log(`Reading collection: ${SUBJECT_COLLECTION}`);
    const subjectDocs = await db
      .collection(SUBJECT_COLLECTION)
      .find({})
      .sort({ order: 1, name: 1 })
      .toArray();

    console.log(`Reading collection: ${TOPIC_COLLECTION}`);
    const topicDocs = await db
      .collection(TOPIC_COLLECTION)
      .find({})
      .sort({ order: 1, name: 1 })
      .toArray();

    const subjects = subjectDocs.map(pickSubject);
    const topics = topicDocs.map(pickTopic);
    const validation = buildValidation(subjects, topics);
    const generatedAt = new Date().toISOString();
    const subjectById = new Map(subjects.map((s) => [s.id, s]));

    const payload = {
      generatedAt,
      readOnly: true,
      collections: {
        subjects: SUBJECT_COLLECTION,
        topics: TOPIC_COLLECTION,
      },
      validation,
      subjects,
      topics,
    };

    fs.writeFileSync(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.writeFileSync(
      OUT_MD,
      renderMarkdown({ generatedAt, subjects, topics, validation, subjectById }),
      'utf8',
    );

    console.log(`Wrote ${OUT_JSON}`);
    console.log(`Wrote ${OUT_MD}`);
    console.log(`Subject count: ${validation.subjectCount}`);
    console.log(`Topic count: ${validation.topicCount}`);
    console.log('Taxonomy dump completed — NO DATABASE WRITES');
  } finally {
    if (client) {
      await client.close();
    }
  }

  assertSourceHashes('after dump');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
