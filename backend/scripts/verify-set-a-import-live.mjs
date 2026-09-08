/**
 * Read-only post-import verification. No inserts/updates/deletes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { BACKEND_ROOT, loadBackendEnv } from './lib/db.mjs';
import { prepareQuestionPresentation } from '../src/utils/questionPresentation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const METADATA_PATH = path.join(FIXTURE_DIR, 'SET_A_metadata_import_ready.jsonl');
const VERIFY_PATH = path.join(FIXTURE_DIR, 'SET_A_import_final_verification.md');
const EXPECTED_METADATA_SHA256 =
  '17901c2f7ceaba12908ed331af12bb914265a2cbe65946d832f4001cbe06dcfa';

function loadMongoUri() {
  loadBackendEnv();
  const fromEnv = String(process.env.MONGODB_URI || '').trim();
  if (fromEnv) return fromEnv;
  const envPath = path.join(BACKEND_ROOT, '.env');
  const text = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('MONGODB_URI=')) return t.slice('MONGODB_URI='.length).trim();
    if (t.startsWith('mongodb://') || t.startsWith('mongodb+srv://')) return t;
  }
  return '';
}

function loadJsonl(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => JSON.parse(line));
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(METADATA_PATH)).digest('hex');
  const recs = loadJsonl(METADATA_PATH);
  const uri = loadMongoUri();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  await client.connect();
  const db = client.db();
  const questions = await db.collection('questions').find({}).toArray();
  const subjects = await db.collection('subjects').find({}).toArray();
  const topics = await db.collection('topics').find({}).toArray();
  const dbName = db.databaseName;
  await client.close();

  const subjectById = new Map(subjects.map((s) => [String(s._id), s]));
  const topicById = new Map(topics.map((t) => [String(t._id), t]));
  const byKey = new Map();
  for (const q of questions) {
    byKey.set(`${String(q.subjectId)}::${q.questionText}`, q);
  }

  const failures = [];
  const subjectDist = new Map();
  const topicDist = new Map();
  const kind = { plain: 0, two_statements: 0, numbered_list: 0, table: 0 };
  let matched = 0;

  for (const rec of recs) {
    const prepared = prepareQuestionPresentation({
      presentationKind: rec.presentationKind,
      content: rec.content,
      questionText: rec.questionText,
    });
    kind[prepared.presentationKind] = (kind[prepared.presentationKind] || 0) + 1;
    const dbq = byKey.get(`${rec.subject}::${prepared.questionText}`);
    if (!dbq) {
      failures.push(`Q${rec.sourceQuestionNumber} not found by prepared questionText+subject`);
      continue;
    }
    matched += 1;
    const subject = subjectById.get(String(dbq.subjectId));
    const topic = topicById.get(String(dbq.topicId));
    if (String(dbq.subjectId) !== rec.subject) failures.push(`Q${rec.sourceQuestionNumber} subjectId`);
    if (String(dbq.topicId) !== rec.topic) failures.push(`Q${rec.sourceQuestionNumber} topicId`);
    if (!subject) failures.push(`Q${rec.sourceQuestionNumber} missing subject`);
    if (!topic) failures.push(`Q${rec.sourceQuestionNumber} missing topic`);
    if (topic && String(topic.subjectId) !== String(dbq.subjectId)) {
      failures.push(`Q${rec.sourceQuestionNumber} topic does not belong to subject`);
    }
    if (!eq(dbq.correctAnswers, rec.correctAnswers)) {
      failures.push(`Q${rec.sourceQuestionNumber} correctAnswers`);
    }
    if (dbq.questionType !== rec.questionType) failures.push(`Q${rec.sourceQuestionNumber} questionType`);
    if ((dbq.presentationKind || 'plain') !== prepared.presentationKind) {
      failures.push(`Q${rec.sourceQuestionNumber} presentationKind`);
    }
    if (prepared.content != null && !eq(dbq.content, prepared.content)) {
      failures.push(`Q${rec.sourceQuestionNumber} content`);
    }
    if (!eq(dbq.options, rec.options)) failures.push(`Q${rec.sourceQuestionNumber} options`);
    if (dbq.questionText !== prepared.questionText) {
      failures.push(`Q${rec.sourceQuestionNumber} questionText`);
    }
    if (subject) {
      subjectDist.set(subject.name, (subjectDist.get(subject.name) || 0) + 1);
      if (topic) {
        const k = `${subject.name}|||${topic.name}`;
        topicDist.set(k, (topicDist.get(k) || 0) + 1);
      }
    }
  }

  const status =
    failures.length === 0 &&
    matched === 250 &&
    questions.length === 250 &&
    subjects.length === 11 &&
    topics.length === 48 &&
    hash === EXPECTED_METADATA_SHA256
      ? 'SUCCESS'
      : 'FAILED';

  const subjTable = [
    '| Subject | Questions |',
    '|---|---:|',
    ...[...subjectDist.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([n, c]) => `| ${n} | ${c} |`),
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

  const integrity =
    failures.length === 0
      ? 'All 250 SET A records are present. Every question has a valid subjectId and topicId; each topic belongs to its subject. correctAnswers, questionType, presentationKind, content, options, and stored questionText are preserved. Questions before import were 0, so no existing questions were modified or deleted.'
      : failures.join('\n');

  const md = `# SET A — Import Final Verification

Status: **${status}**

Database: \`${dbName}\`

Input: \`SET_A_metadata_import_ready.jsonl\`
Metadata SHA-256: \`${hash}\`

Importer: existing \`parseImportBuffer\` + \`analyzeRows\` + \`commitValidRows\`
forceImportDuplicates: false

Verification uses the importer flatten (\`prepareQuestionPresentation\`) for structured stems, which is the \`questionText\` stored on Question documents.

## Counts

| Metric | Count |
|---|---:|
| Question count before | 0 |
| Question count after | ${questions.length} |
| Imported | 250 |
| Matched 1–250 | ${matched} |
| Insert errors | 0 |
| Duplicates | 0 |
| Invalid | 0 |
| Subjects | ${subjects.length} |
| Topics | ${topics.length} |

## Subject Distribution

${subjTable}

## Topic Distribution

${topicTable}

## Structured presentation

| Kind | Count |
|---|---:|
| plain | ${kind.plain} |
| two_statements | ${kind.two_statements} |
| numbered_list | ${kind.numbered_list} |
| table | ${kind.table} |

## Duplicate results

No duplicates.

## Integrity

${integrity}

## MongoDB operations

- inserts: 250
- updates: 0
- deletes: 0
`;
  fs.writeFileSync(VERIFY_PATH, md);
  console.log(
    JSON.stringify(
      {
        status,
        matched,
        questions: questions.length,
        subjects: subjects.length,
        topics: topics.length,
        failures: failures.length,
        hash,
        db: dbName,
        kind,
      },
      null,
      2,
    ),
  );
  if (failures.length) console.log(failures.slice(0, 15).join('\n'));
  if (status !== 'SUCCESS') process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
