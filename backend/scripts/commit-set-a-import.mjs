/**
 * Gate 2 IMPORT: existing parseImportBuffer + analyzeRows + commitValidRows.
 * forceImportDuplicates is not used (false). Does not call connectDb().
 * Does not run apply:set-a-catalog.
 *
 * Run: node scripts/commit-set-a-import.mjs --gate-2-approved
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import { BACKEND_ROOT, loadBackendEnv, moduleUrl } from './lib/db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const METADATA_PATH = path.join(FIXTURE_DIR, 'SET_A_metadata_import_ready.jsonl');
const IMPORT_PATH = path.join(FIXTURE_DIR, 'SET_A_import_ready.jsonl');
const PROPOSAL_PATH = path.join(FIXTURE_DIR, 'SET_A_taxonomy_proposal.json');
const VERIFY_PATH = path.join(FIXTURE_DIR, 'SET_A_import_final_verification.md');

const EXPECTED_METADATA_SHA256 =
  '17901c2f7ceaba12908ed331af12bb914265a2cbe65946d832f4001cbe06dcfa';
const EXPECTED_DB = 'ssbfy';

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function loadJsonl(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => JSON.parse(line));
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

async function withNative(uri, fn) {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15_000,
    readPreference: 'primary',
  });
  try {
    await client.connect();
    const db = client.db();
    return await fn(db, client);
  } finally {
    await client.close();
  }
}

function reconstructMetadata(subjects, topics, proposal, importRecs) {
  const subjectIdByName = new Map(subjects.map((s) => [s.name, String(s._id)]));
  const topicIdByKey = new Map(
    topics.map((t) => [`${String(t.subjectId)}::${t.name}`, String(t._id)]),
  );
  const subjectNameById = new Map(subjects.map((s) => [String(s._id), s.name]));
  const lines = [];
  for (const mapping of proposal.questionMappings) {
    const source = importRecs[mapping.questionNumber - 1];
    const subjectId = subjectIdByName.get(mapping.subject);
    if (!subjectId) throw new Error(`live catalog missing subject ${mapping.subject}`);
    const topicId = topicIdByKey.get(`${subjectId}::${mapping.topic}`);
    if (!topicId) throw new Error(`live catalog missing topic ${mapping.subject}/${mapping.topic}`);
    void subjectNameById;
    lines.push(JSON.stringify({ ...source, subject: subjectId, topic: topicId }));
  }
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
}

function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  if (!process.argv.includes('--gate-2-approved')) {
    console.error('Refusing import: pass --gate-2-approved after APPROVE GATE 2 IMPORT.');
    process.exit(1);
  }

  const uri = loadMongoUri();
  if (!uri) {
    console.error('STOP: MONGODB_URI unavailable.');
    process.exit(1);
  }

  const proposal = JSON.parse(fs.readFileSync(PROPOSAL_PATH, 'utf8'));
  const importRecs = loadJsonl(IMPORT_PATH);

  const pre = await withNative(uri, async (db) => {
    if (db.databaseName !== EXPECTED_DB) {
      throw new Error(`database is "${db.databaseName}", expected "${EXPECTED_DB}"`);
    }
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
    const count = async (n) => (names.includes(n) ? db.collection(n).countDocuments({}) : 0);
    const subjects = names.includes('subjects')
      ? await db.collection('subjects').find({}).toArray()
      : [];
    const topics = names.includes('topics') ? await db.collection('topics').find({}).toArray() : [];
    return {
      dbName: db.databaseName,
      questions: await count('questions'),
      subjects: subjects.length,
      topics: topics.length,
      subjectDocs: subjects,
      topicDocs: topics,
    };
  });

  if (pre.questions !== 0) {
    console.error(`STOP: Question count is ${pre.questions}, expected 0.`);
    process.exit(1);
  }
  if (pre.subjects !== 11 || pre.topics !== 48) {
    console.error(`STOP: catalog is subjects=${pre.subjects} topics=${pre.topics}, expected 11/48.`);
    process.exit(1);
  }

  let metadataBuf;
  let metadataSource;
  if (fs.existsSync(METADATA_PATH)) {
    metadataBuf = fs.readFileSync(METADATA_PATH);
    metadataSource = 'existing-file';
  } else {
    metadataBuf = reconstructMetadata(pre.subjectDocs, pre.topicDocs, proposal, importRecs);
    metadataSource = 'reconstructed-from-live-catalog';
  }
  const metadataHash = sha256Buffer(metadataBuf);
  if (metadataHash !== EXPECTED_METADATA_SHA256) {
    console.error('STOP: metadata SHA-256 mismatch.');
    console.error(`  expected ${EXPECTED_METADATA_SHA256}`);
    console.error(`  actual   ${metadataHash}`);
    console.error(`  source   ${metadataSource}`);
    process.exit(1);
  }
  if (metadataSource === 'reconstructed-from-live-catalog') {
    fs.writeFileSync(METADATA_PATH, metadataBuf);
    if (sha256File(METADATA_PATH) !== EXPECTED_METADATA_SHA256) {
      console.error('STOP: wrote metadata file but hash drifted.');
      process.exit(1);
    }
  }

  const enriched = loadJsonl(METADATA_PATH);
  if (enriched.length !== 250) {
    console.error(`STOP: metadata records ${enriched.length}, expected 250.`);
    process.exit(1);
  }

  mongoose.set('strictQuery', true);
  mongoose.set('autoIndex', false);
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 15_000 });
  if (mongoose.connection.name !== EXPECTED_DB) {
    await mongoose.disconnect();
    console.error(`STOP: mongoose db ${mongoose.connection.name}`);
    process.exit(1);
  }

  const { parseImportBuffer, analyzeRows, commitValidRows } = await import(
    moduleUrl('src/services/questionImportService.js')
  );
  const { Question } = await import(moduleUrl('src/models/Question.js'));
  const { Subject } = await import(moduleUrl('src/models/Subject.js'));
  const { Topic } = await import(moduleUrl('src/models/Topic.js'));

  let inserted = 0;
  let insertErrors = [];
  let analysis;
  try {
    const parsed = parseImportBuffer(metadataBuf, 'SET_A_metadata_import_ready.jsonl');
    analysis = await analyzeRows(parsed, { tagPostIds: [] });
    if (analysis.summary.valid !== 250 || analysis.summary.invalid !== 0 || analysis.summary.duplicates !== 0) {
      console.error('STOP: analyzeRows is not 250 valid / 0 invalid / 0 duplicates.');
      console.error(JSON.stringify(analysis.summary));
      process.exit(1);
    }
    const result = await commitValidRows(analysis.rows);
    inserted = result.inserted;
    insertErrors = result.errors || [];
    if (insertErrors.length || inserted !== 250) {
      console.error('STOP: commit did not insert exactly 250.');
      console.error(JSON.stringify({ inserted, insertErrors }));
      process.exit(1);
    }
  } finally {
    await mongoose.disconnect().catch(() => {});
  }

  const post = await withNative(uri, async (db) => {
    const questions = await db.collection('questions').find({}).toArray();
    const subjects = await db.collection('subjects').find({}).toArray();
    const topics = await db.collection('topics').find({}).toArray();
    return {
      dbName: db.databaseName,
      questions,
      subjects,
      topics,
    };
  });

  const failures = [];
  if (post.questions.length !== 250) {
    failures.push(`question count after is ${post.questions.length}, expected 250`);
  }
  if (post.subjects.length !== 11) failures.push(`subjects ${post.subjects.length}`);
  if (post.topics.length !== 48) failures.push(`topics ${post.topics.length}`);

  const subjectById = new Map(post.subjects.map((s) => [String(s._id), s]));
  const topicById = new Map(post.topics.map((t) => [String(t._id), t]));
  const dbByTextSubject = new Map(
    post.questions.map((q) => [`${String(q.subjectId)}::${q.questionText}`, q]),
  );

  const subjectDist = new Map();
  const topicDist = new Map();
  let matched = 0;
  for (const rec of enriched) {
    const dbq = dbByTextSubject.get(`${rec.subject}::${rec.questionText}`);
    if (!dbq) {
      failures.push(`Q${rec.sourceQuestionNumber} not found in Mongo by text+subject`);
      continue;
    }
    matched += 1;
    if (String(dbq.subjectId) !== rec.subject) {
      failures.push(`Q${rec.sourceQuestionNumber} subjectId mismatch`);
    }
    if (String(dbq.topicId) !== rec.topic) {
      failures.push(`Q${rec.sourceQuestionNumber} topicId mismatch`);
    }
    const subject = subjectById.get(String(dbq.subjectId));
    const topic = topicById.get(String(dbq.topicId));
    if (!subject) failures.push(`Q${rec.sourceQuestionNumber} missing subject doc`);
    if (!topic) failures.push(`Q${rec.sourceQuestionNumber} missing topic doc`);
    if (topic && String(topic.subjectId) !== String(dbq.subjectId)) {
      failures.push(`Q${rec.sourceQuestionNumber} topic does not belong to subject`);
    }
    if (!jsonEqual(dbq.correctAnswers, rec.correctAnswers)) {
      failures.push(`Q${rec.sourceQuestionNumber} correctAnswers changed`);
    }
    if (dbq.questionType !== rec.questionType) {
      failures.push(`Q${rec.sourceQuestionNumber} questionType changed`);
    }
    if ((dbq.presentationKind || 'plain') !== rec.presentationKind) {
      failures.push(`Q${rec.sourceQuestionNumber} presentationKind changed`);
    }
    if (rec.content != null && !jsonEqual(dbq.content, rec.content)) {
      failures.push(`Q${rec.sourceQuestionNumber} content changed`);
    }
    if (!jsonEqual(dbq.options, rec.options)) {
      failures.push(`Q${rec.sourceQuestionNumber} options changed`);
    }
    if (dbq.questionText !== rec.questionText) {
      failures.push(`Q${rec.sourceQuestionNumber} questionText changed`);
    }
    if (subject) {
      subjectDist.set(subject.name, (subjectDist.get(subject.name) || 0) + 1);
      if (topic) {
        const k = `${subject.name}|||${topic.name}`;
        topicDist.set(k, (topicDist.get(k) || 0) + 1);
      }
    }
  }

  const status = failures.length === 0 && matched === 250 ? 'SUCCESS' : 'FAILED';
  const subjTable = [
    '| Subject | Questions |',
    '|---|---:|',
    ...[...subjectDist.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([n, c]) => `| ${n} | ${c} |`),
  ].join('\n');
  const topicTable = [
    '| Subject | Topic | Questions |',
    '|---|---|---:|',
    ...[...topicDist.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map((e) => {
        const [s, t] = e[0].split('|||');
        return `| ${s} | ${t} | ${e[1]} |`;
      }),
  ].join('\n');

  const md = `# SET A — Import Final Verification

Status: **${status}**

Database: \`${post.dbName}\`

Input: \`SET_A_metadata_import_ready.jsonl\`
Metadata SHA-256: \`${metadataHash}\`
Metadata source: ${metadataSource}

Importer: existing \`parseImportBuffer\` + \`analyzeRows\` + \`commitValidRows\`
forceImportDuplicates: false

## Counts

| Metric | Count |
|---|---:|
| Question count before | ${pre.questions} |
| Question count after | ${post.questions.length} |
| Imported | ${inserted} |
| Matched 1–250 | ${matched} |
| Insert errors | ${insertErrors.length} |
| Duplicates (analyzeRows) | ${analysis.summary.duplicates} |
| Invalid (analyzeRows) | ${analysis.summary.invalid} |
| Subjects | ${post.subjects.length} |
| Topics | ${post.topics.length} |

## Subject Distribution

${subjTable}

## Topic Distribution

${topicTable}

## Duplicate results

${analysis.summary.duplicates === 0 ? 'No duplicates.' : JSON.stringify(analysis.summary)}

## Integrity

${
    failures.length === 0
      ? 'All 250 records matched live Question documents. subjectId, topicId, topic-belongs-to-subject, correctAnswers, questionType, presentationKind, content, options, and questionText are preserved. No extra questions. Questions before were 0 so none were modified or deleted.'
      : failures.map((f) => `- ${f}`).join('\n')
  }

## MongoDB operations

- inserts: ${inserted}
- updates: 0
- deletes: 0
`;
  fs.writeFileSync(VERIFY_PATH, md);

  console.log(`IMPORT STATUS: ${status}`);
  console.log(`Questions imported: ${inserted}`);
  console.log('Questions modified: 0');
  console.log('Questions deleted: 0');
  console.log(`Duplicates: ${analysis.summary.duplicates}`);
  console.log(`Subjects: ${post.subjects.length}`);
  console.log(`Topics: ${post.topics.length}`);
  console.log(`Question count before: ${pre.questions}`);
  console.log(`Question count after: ${post.questions.length}`);
  console.log(`MongoDB operations: inserts=${inserted} updates=0 deletes=0`);
  console.log(`Wrote ${VERIFY_PATH}`);
  if (status !== 'SUCCESS') process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
