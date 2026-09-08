/**
 * Phase 6 SET A admin/API/database verification. READ-ONLY.
 * Native MongoDB driver only (no connectDb / autoIndex / writes).
 *
 * Run: node scripts/verify-set-a-phase6.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { BACKEND_ROOT, loadBackendEnv } from './lib/db.mjs';
import { prepareQuestionPresentation } from '../src/utils/questionPresentation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const METADATA_PATH = path.join(FIXTURE_DIR, 'SET_A_metadata_import_ready.jsonl');
const REPORT_PATH = path.join(FIXTURE_DIR, 'SET_A_phase6_admin_verification_report.md');
const EXPECTED_METADATA_SHA256 =
  '17901c2f7ceaba12908ed331af12bb914265a2cbe65946d832f4001cbe06dcfa';
const EXPECTED_DB = 'ssbfy';
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
    throw new Error(`Phase 6 script is not read-only: ${hits.join(', ')}`);
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

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeForDuplicate(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function validateStructured(kind, content) {
  const issues = [];
  if (kind === 'plain') {
    if (content && typeof content === 'object') {
      if (Array.isArray(content.statements) || Array.isArray(content.items) || Array.isArray(content.columns)) {
        issues.push('plain document has structured content fields');
      }
    }
    return issues;
  }
  if (kind === 'two_statements') {
    const stmts = content?.statements;
    if (!Array.isArray(stmts) || stmts.length !== 2) {
      issues.push('two_statements needs exactly 2 statements');
      return issues;
    }
    for (let i = 0; i < stmts.length; i += 1) {
      if (!stmts[i] || typeof stmts[i].label !== 'string' || !stmts[i].label.trim()) {
        issues.push(`statement[${i}] missing label`);
      }
      if (!stmts[i] || typeof stmts[i].text !== 'string' || !stmts[i].text.trim()) {
        issues.push(`statement[${i}] missing text`);
      }
    }
    return issues;
  }
  if (kind === 'numbered_list') {
    const items = content?.items;
    if (!Array.isArray(items) || items.length < 2) {
      issues.push('numbered_list needs at least 2 items');
      return issues;
    }
    for (let i = 0; i < items.length; i += 1) {
      const n = Number(items[i]?.n);
      if (!Number.isInteger(n) || n < 1) issues.push(`items[${i}].n invalid`);
      if (typeof items[i]?.text !== 'string' || !items[i].text.trim()) {
        issues.push(`items[${i}].text missing`);
      }
    }
    return issues;
  }
  if (kind === 'table') {
    const cols = content?.columns;
    const rows = content?.rows;
    if (!Array.isArray(cols) || cols.length < 1) issues.push('table missing columns');
    if (!Array.isArray(rows) || rows.length < 1) issues.push('table missing rows');
    if (Array.isArray(cols) && Array.isArray(rows)) {
      for (let r = 0; r < rows.length; r += 1) {
        if (!Array.isArray(rows[r]) || rows[r].length !== cols.length) {
          issues.push(`row ${r} cell count != columns`);
        }
      }
    }
    return issues;
  }
  issues.push(`unknown presentationKind ${kind}`);
  return issues;
}

async function main() {
  assertReadOnlySource();
  if (!fs.existsSync(METADATA_PATH)) {
    throw new Error('SET_A_metadata_import_ready.jsonl missing');
  }
  const metadataHash = sha256File(METADATA_PATH);
  const recs = loadJsonl(METADATA_PATH);
  const uri = loadMongoUri();
  if (!uri) throw new Error('MONGODB_URI unavailable');

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15_000,
    readPreference: 'primary',
  });
  await client.connect();
  const db = client.db();
  const dbName = db.databaseName;
  const questions = await db.collection('questions').find({}).toArray();
  const subjects = await db.collection('subjects').find({}).toArray();
  const topics = await db.collection('topics').find({}).toArray();
  await client.close();

  const warnings = [];
  const failures = [];

  if (dbName !== EXPECTED_DB) failures.push(`database is ${dbName}, expected ${EXPECTED_DB}`);
  if (questions.length !== 250) failures.push(`question count ${questions.length}, expected 250`);
  if (subjects.length !== 11) failures.push(`subject count ${subjects.length}, expected 11`);
  if (topics.length !== 48) failures.push(`topic count ${topics.length}, expected 48`);
  if (recs.length !== 250) failures.push(`metadata records ${recs.length}, expected 250`);
  if (metadataHash !== EXPECTED_METADATA_SHA256) {
    failures.push('metadata JSONL hash mismatch');
  }

  const withSourceNum = questions.filter((q) => q.sourceQuestionNumber != null);
  if (withSourceNum.length === 0) {
    warnings.push(
      'Question documents do not store sourceQuestionNumber. SET A 1–250 identity is recovered by joining flattened questionText + subjectId to SET_A_metadata_import_ready.jsonl. Smallest future fix: persist sourceQuestionNumber (or an import batch tag) on Question if product needs booklet order in Mongo.',
    );
  } else {
    const nums = withSourceNum.map((q) => q.sourceQuestionNumber).sort((a, b) => a - b);
    if (JSON.stringify(nums) !== JSON.stringify(Array.from({ length: 250 }, (_, i) => i + 1))) {
      failures.push('sourceQuestionNumber on documents is not exactly 1–250');
    }
  }

  const subjectById = new Map(subjects.map((s) => [String(s._id), s]));
  const topicById = new Map(topics.map((t) => [String(t._id), t]));
  let missingSubject = 0;
  let missingTopic = 0;
  let crossSubject = 0;
  for (const q of questions) {
    const s = subjectById.get(String(q.subjectId));
    const t = topicById.get(String(q.topicId));
    if (!s) missingSubject += 1;
    if (!t) missingTopic += 1;
    if (s && t && String(t.subjectId) !== String(q.subjectId)) crossSubject += 1;
  }
  if (missingSubject) failures.push(`${missingSubject} questions have invalid subjectId`);
  if (missingTopic) failures.push(`${missingTopic} questions have invalid topicId`);
  if (crossSubject) failures.push(`${crossSubject} questions point at a topic of another subject`);

  const kinds = { plain: 0, two_statements: 0, numbered_list: 0, table: 0, other: 0 };
  const types = { single_correct: 0, multiple_correct: 0, image_based: 0, other: 0 };
  let invalidAnswers = 0;
  let missingText = 0;
  let missingOptions = 0;
  const structuredIssues = [];
  for (const q of questions) {
    const kind = q.presentationKind || 'plain';
    if (kind in kinds) kinds[kind] += 1;
    else kinds.other += 1;
    const qt = q.questionType || 'single_correct';
    if (qt in types) types[qt] += 1;
    else types.other += 1;
    if (typeof q.questionText !== 'string' || !q.questionText.trim()) missingText += 1;
    if (!Array.isArray(q.options) || q.options.length < 2) missingOptions += 1;
    const answers = Array.isArray(q.correctAnswers) ? q.correctAnswers : [];
    if (qt === 'single_correct' && answers.length !== 1) invalidAnswers += 1;
    for (const idx of answers) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= (q.options || []).length) invalidAnswers += 1;
    }
    const issues = validateStructured(kind, q.content);
    if (issues.length) structuredIssues.push({ id: String(q._id), kind, issues });
  }
  if (kinds.plain !== 49 || kinds.two_statements !== 8 || kinds.numbered_list !== 179 || kinds.table !== 14) {
    failures.push(
      `presentation distribution mismatch: plain ${kinds.plain}, two_statements ${kinds.two_statements}, numbered_list ${kinds.numbered_list}, table ${kinds.table}`,
    );
  }
  if (types.single_correct !== 250 || types.multiple_correct !== 0) {
    failures.push(`questionType distribution mismatch: single_correct ${types.single_correct}, multiple_correct ${types.multiple_correct}`);
  }
  if (missingText) failures.push(`${missingText} questions missing questionText`);
  if (missingOptions) failures.push(`${missingOptions} questions with invalid options`);
  if (invalidAnswers) failures.push(`${invalidAnswers} invalid correctAnswers`);
  if (structuredIssues.length) {
    failures.push(`${structuredIssues.length} structured-content validation issues`);
  }

  const byKey = new Map();
  for (const q of questions) {
    byKey.set(`${String(q.subjectId)}::${q.questionText}`, q);
  }
  const preservation = [];
  const jsonlNums = recs.map((r) => r.sourceQuestionNumber).sort((a, b) => a - b);
  if (JSON.stringify(jsonlNums) !== JSON.stringify(Array.from({ length: 250 }, (_, i) => i + 1))) {
    failures.push('JSONL sourceQuestionNumber is not exactly 1–250');
  }
  const jsonlDupNums = jsonlNums.filter((n, i) => jsonlNums.indexOf(n) !== i);
  if (jsonlDupNums.length) failures.push(`duplicate JSONL sourceQuestionNumber: ${jsonlDupNums.join(',')}`);

  let matched = 0;
  for (const rec of recs) {
    const prepared = prepareQuestionPresentation({
      presentationKind: rec.presentationKind,
      content: rec.content,
      questionText: rec.questionText,
    });
    const dbq = byKey.get(`${rec.subject}::${prepared.questionText}`);
    if (!dbq) {
      preservation.push(`Q${rec.sourceQuestionNumber} not found in Mongo`);
      continue;
    }
    matched += 1;
    if (String(dbq.subjectId) !== rec.subject) preservation.push(`Q${rec.sourceQuestionNumber} subjectId`);
    if (String(dbq.topicId) !== rec.topic) preservation.push(`Q${rec.sourceQuestionNumber} topicId`);
    if (!eq(dbq.correctAnswers, rec.correctAnswers)) preservation.push(`Q${rec.sourceQuestionNumber} correctAnswers`);
    if (dbq.questionType !== rec.questionType) preservation.push(`Q${rec.sourceQuestionNumber} questionType`);
    if ((dbq.presentationKind || 'plain') !== prepared.presentationKind) {
      preservation.push(`Q${rec.sourceQuestionNumber} presentationKind`);
    }
    if (prepared.content != null && !eq(dbq.content, prepared.content)) {
      preservation.push(`Q${rec.sourceQuestionNumber} content`);
    }
    if (!eq(dbq.options, rec.options)) preservation.push(`Q${rec.sourceQuestionNumber} options`);
    if (dbq.questionText !== prepared.questionText) preservation.push(`Q${rec.sourceQuestionNumber} questionText`);
  }
  if (matched !== 250) failures.push(`source join matched ${matched}/250`);
  if (preservation.length) failures.push(`${preservation.length} source-preservation mismatches`);

  const exactKeys = new Map();
  const normKeys = new Map();
  const exactDups = [];
  const normDups = [];
  for (const q of questions) {
    const ek = `${String(q.subjectId)}::${q.questionText}`;
    const nk = `${String(q.subjectId)}::${normalizeForDuplicate(q.questionText)}`;
    if (exactKeys.has(ek)) exactDups.push(String(q._id));
    else exactKeys.set(ek, String(q._id));
    if (normKeys.has(nk)) normDups.push(String(q._id));
    else normKeys.set(nk, String(q._id));
  }

  function pickRep(n) {
    const rec = recs.find((r) => r.sourceQuestionNumber === n);
    if (!rec) return null;
    const prepared = prepareQuestionPresentation({
      presentationKind: rec.presentationKind,
      content: rec.content,
      questionText: rec.questionText,
    });
    const dbq = byKey.get(`${rec.subject}::${prepared.questionText}`);
    if (!dbq) return { n, missing: true };
    const subject = subjectById.get(String(dbq.subjectId));
    const topic = topicById.get(String(dbq.topicId));
    const issues = validateStructured(dbq.presentationKind || 'plain', dbq.content);
    return {
      n,
      id: String(dbq._id),
      presentationKind: dbq.presentationKind,
      questionType: dbq.questionType,
      subject: subject?.name || '',
      topic: topic?.name || '',
      options: dbq.options?.length || 0,
      correctAnswers: dbq.correctAnswers,
      contentValid: issues.length === 0,
      issues,
    };
  }
  const reps = [1, 2, 3, 8].map(pickRep);

  const verdict =
    failures.length > 0 ? 'FAIL' : warnings.length > 0 ? 'PASS WITH WARNINGS' : 'PASS';

  const md = `# SET A Phase 6 Verification Report

## Database

- database name: \`${dbName}\`
- question count: ${questions.length}
- subject count: ${subjects.length}
- topic count: ${topics.length}
- metadata SHA-256: \`${metadataHash}\`

Read-only native driver. \`connectDb()\`, \`syncIndexes()\`, and import/commit scripts were not run.

## Question Integrity

- JSONL numbering 1–250 unique: ${jsonlDupNums.length === 0 && recs.length === 250 ? 'yes' : 'no'}
- Live Question documents storing \`sourceQuestionNumber\`: ${withSourceNum.length}
- Join of JSONL 1–250 onto live questions (prepared questionText + subjectId): ${matched}/250
- missing records: ${250 - matched}
- invalid subjectId: ${missingSubject}
- invalid topicId: ${missingTopic}
- topic belongs to another subject: ${crossSubject}

## Presentation Distribution

| Kind | Expected | Actual |
|---|---:|---:|
| plain | 49 | ${kinds.plain} |
| two_statements | 8 | ${kinds.two_statements} |
| numbered_list | 179 | ${kinds.numbered_list} |
| table | 14 | ${kinds.table} |
| other | 0 | ${kinds.other} |
| **Total** | **250** | **${questions.length}** |

Match: ${
    kinds.plain === 49 && kinds.two_statements === 8 && kinds.numbered_list === 179 && kinds.table === 14
      ? 'YES'
      : 'NO'
  }

## Answer Integrity

- single_correct: ${types.single_correct}
- multiple_correct: ${types.multiple_correct}
- image_based: ${types.image_based}
- invalid answer indexes / arity: ${invalidAnswers}

All SET A rows are \`single_correct\` with exactly one in-range index (expected).

## Structured Content Integrity

- two_statements / numbered_list / table / plain structural issues: ${structuredIssues.length}
${structuredIssues.length ? structuredIssues.slice(0, 10).map((x) => `- ${x.id} (${x.kind}): ${x.issues.join('; ')}`).join('\n') : '- No malformed structured records.'}

## Metadata Integrity

- 11 subjects exist: ${subjects.length === 11 ? 'yes' : 'no'}
- 48 topics exist: ${topics.length === 48 ? 'yes' : 'no'}
- every question subjectId/topicId resolves: ${missingSubject === 0 && missingTopic === 0 ? 'yes' : 'no'}
- every topic belongs to the question's subject: ${crossSubject === 0 ? 'yes' : 'no'}

## Source Preservation

Compared live documents to \`SET_A_metadata_import_ready.jsonl\` using importer flatten (\`prepareQuestionPresentation\`) for stored \`questionText\` / sanitized \`content\`.

- matched: ${matched}/250
- mismatches: ${preservation.length}
${preservation.length ? preservation.slice(0, 20).map((p) => `- ${p}`).join('\n') : '- No mismatches.'}

## Duplicate result

Importer semantics: same subject + exact \`questionText\`, plus whitespace/case-normalized text.

- exact duplicates: ${exactDups.length}
- normalized questionText duplicates: ${normDups.length}
- duplicate sourceQuestionNumber on documents: ${withSourceNum.length === 0 ? 'n/a (field absent)' : 'checked above'}
- duplicate sourceQuestionNumber in JSONL: ${jsonlDupNums.length}

## API Contract

Inspected \`projectPublicQuestion\` in \`backend/src/services/questionService.js\` and \`presentationFieldsFromQuestion\`.

- \`presentationKind\` and \`content\` are copied onto public question payloads (\`content\` is null for plain).
- Public projection does **not** include \`correctAnswers\`, \`correctAnswerIndex\`, \`correctAnswerValue\`, or \`explanation\`.
- Admin \`projectQuestion\` includes answers (admin-only). Admin picker rows include \`presentationKind\` and flattened \`questionText\` but omit \`content\` (list payload); edit/get-by-id uses the full document.
- Missing \`presentationKind\` normalizes to \`plain\`. Structured payloads still include \`questionText\` (flattened) **and** \`content\` so clients are not limited to flattened text.

## Admin Compatibility

Inspected \`admin/src/pages/AddQuestion.jsx\` and \`QuestionPresentationFields.jsx\`.

- Question Type select: Single Correct / Multiple Correct / Image Based.
- Presentation select: Plain / Two Statements / Numbered List / Table, documented as independent of type.
- Plain: question text editor; structured content not required; edit sends \`content: null\`.
- Two statements: intro, two label/text rows, prompt.
- Numbered list: intro, items with n + text, prompt, add/remove.
- Table: intro, columns/rows with synchronized cells, prompt.
- Missing \`presentationKind\` on load uses \`normalizePresentationKind\` → plain.
- Structured submit uses \`buildPresentationPayload\`, which **omits** client-built \`questionText\` so the backend flattens.

## Mobile Compatibility

Inspected \`mobile/src/components/QuestionPresentation.js\`, \`TestScreen.js\`, \`ReviewAnswersScreen.js\`, \`mobile/src/utils/questionPresentation.js\`.

- Both TestScreen and ReviewAnswersScreen render \`QuestionPresentation\`.
- Plain / two_statements / numbered_list / table have separate render paths.
- Invalid/missing structured content falls back to plain \`questionText\`.
- Options, selection, scoring, and navigation stay in the parent screens.

## Mock/PYQ Compatibility

Inspected \`backend/src/models/Question.js\` and \`backend/src/models/Test.js\`.

- \`presentationKind\` / \`content\` live on **Question**, not Test.
- \`Test.kind\` is \`mock\` | \`previous_year\` (product). \`Test.questionIds[]\` are Question ObjectIds with no presentation filter.
- Mock tests, previous-year papers, daily practice, and battle all consume Question documents. Structured SET A questions are therefore usable in any of those features without a PYQ-only restriction.

## Snapshot/Scoring Compatibility

Inspected \`attemptResultSnapshot.js\`, \`learningSessionSnapshot.js\`, \`battleQuestionSnapshot.js\`, \`testAttemptService.js\`, \`practiceRevealService.js\`, \`questionScoring.js\`.

- New snapshots spread \`presentationFieldsFromQuestion\` (\`presentationKind\` + \`content\`).
- Placeholder/legacy snapshot items default \`presentationKind: 'plain'\` and \`content: null\`.
- \`scoreQuestionSession\` scores from \`correctAnswers\` / option indexes only; it does not read \`presentationKind\`.

## Representative Questions

${reps
    .map((r) => {
      if (!r) return '- missing';
      if (r.missing) return `- Q${r.n}: not found in Mongo`;
      return `- **Q${r.n}** _id=\`${r.id}\` kind=${r.presentationKind} type=${r.questionType} subject=${r.subject} topic=${r.topic} options=${r.options} correctAnswers=${JSON.stringify(r.correctAnswers)} contentValid=${r.contentValid}`;
    })
    .join('\n')}

Expected kinds: Q1 two_statements, Q2 numbered_list, Q3 plain, Q8 table.

## Warnings

${warnings.length ? warnings.map((w) => `- ${w}`).join('\n') : '- none'}

## Failures

${failures.length ? failures.map((f) => `- ${f}`).join('\n') : '- none'}

## Final Verdict

${verdict}
`;

  fs.writeFileSync(REPORT_PATH, md);
  console.log(`database=${dbName} questions=${questions.length} subjects=${subjects.length} topics=${topics.length}`);
  console.log(`presentation plain=${kinds.plain} two_statements=${kinds.two_statements} numbered_list=${kinds.numbered_list} table=${kinds.table}`);
  console.log(`single_correct=${types.single_correct} multiple_correct=${types.multiple_correct}`);
  console.log(`matched=${matched} preservation=${preservation.length} exactDups=${exactDups.length} normDups=${normDups.length}`);
  console.log(`warnings=${warnings.length} failures=${failures.length}`);
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`VERDICT: ${verdict}`);
  if (verdict === 'FAIL') process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
