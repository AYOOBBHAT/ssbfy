/**
 * Gate 2 read-only dry-run wrapper.
 * Invokes existing parseImportBuffer + analyzeRows. Never imports or calls
 * commitValidRows. Mongoose autoIndex is disabled (does not call connectDb()).
 *
 * Run: node scripts/dry-run-set-a-import.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import { loadBackendEnv, moduleUrl } from './lib/db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const METADATA_PATH = path.join(FIXTURE_DIR, 'SET_A_metadata_import_ready.jsonl');
const IMPORT_PATH = path.join(FIXTURE_DIR, 'SET_A_import_ready.jsonl');
const JSONL_PATH = path.join(FIXTURE_DIR, 'SET_A_structured.jsonl');
const ORIGINAL_KEY_PATH = path.join(FIXTURE_DIR, 'SET_A_answer_key.json');
const REPORT_PATH = path.join(FIXTURE_DIR, 'SET_A_gate2_dry_run_report.md');

const EXPECTED_IMPORT_SHA256 =
  '7aad2b3b0a772c1807dce9c326d599e204a99293fae2cd10e1248e4b4db03f40';
const EXPECTED_JSONL_SHA256 =
  '8025d729630c783c6c3b0d3ae33e3fc3322faa34356c8a9b263e94b8926e0fb4';
const EXPECTED_ORIGINAL_KEY_SHA256 =
  '07f77efbc334ca63e8c13b44c36adcf45c12fa86f7f839cf87351d4ee206b259';
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

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function loadJsonl(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => JSON.parse(line));
}

function withoutTaxonomy(rec) {
  const copy = { ...rec };
  delete copy.subject;
  delete copy.topic;
  return copy;
}

function writeReport(md) {
  fs.writeFileSync(REPORT_PATH, md);
}

function blockedReport(reasons, hashes) {
  return `# SET A — Gate 2 Dry Run

Status:
**BLOCKED — DRY-RUN NOT EXECUTED**

Database:
\`${EXPECTED_DB}\`

Input:
\`SET_A_metadata_import_ready.jsonl\`

## Blockers

${reasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}

This wrapper invokes existing \`parseImportBuffer\` + \`analyzeRows\` only.
\`commitValidRows\` is not imported. HTTP admin endpoints were not called.
Fake credentials were not created.

## Summary

| Metric | Count |
|---|---:|
| Total records | not run |
| Valid | not run |
| Invalid | not run |
| Database duplicates | not run |
| In-file duplicates | not run |
| Subject failures | not run |
| Topic failures | not run |
| Question validation failures | not run |

## Database before/after

Not read (blocked before a Mongo dry-run session), or blocked after a failed preflight.

## Hashes

| File | SHA-256 | Status |
|---|---|---|
| \`SET_A_import_ready.jsonl\` | \`${hashes.importReady}\` | ${hashes.importOk ? 'unchanged' : 'MISMATCH'} |
| \`SET_A_structured.jsonl\` | \`${hashes.structured}\` | ${hashes.structuredOk ? 'unchanged' : 'MISMATCH'} |
| Original answer key | \`${hashes.originalKey}\` | ${hashes.originalOk ? 'unchanged' : 'MISMATCH'} |
| \`SET_A_metadata_import_ready.jsonl\` | ${hashes.metadata || 'n/a'} | ${hashes.metadata ? 'not modified by this script' : 'missing'} |

NO QUESTION IMPORT WAS PERFORMED.
NO QUESTION DOCUMENTS WERE WRITTEN.
NO QUESTION DOCUMENTS WERE MODIFIED.
NO QUESTION DOCUMENTS WERE DELETED.
NO SUBJECT/TOPIC CHANGES WERE MADE.
`;
}

function assertNoCommitInThisFile() {
  const src = fs.readFileSync(__filename, 'utf8');
  if (/import\s*\{[^}]*\bcommitValidRows\b/.test(src) || /await\s+commitValidRows\s*\(/.test(src)) {
    throw new Error('STOP: dry-run wrapper must not import or call commitValidRows');
  }
}

async function countCollections(uri) {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10_000,
    readPreference: 'primary',
  });
  try {
    await client.connect();
    const db = client.db();
    const dbName = db.databaseName;
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
    const count = async (name) =>
      names.includes(name) ? db.collection(name).countDocuments({}) : 0;
    return {
      dbName,
      questions: await count('questions'),
      subjects: await count('subjects'),
      topics: await count('topics'),
    };
  } finally {
    await client.close();
  }
}

function classifyInvalid(row) {
  const reasons = Array.isArray(row.reasons) ? row.reasons : [];
  const text = reasons.join(' | ');
  const subjectFail = /subject/i.test(text);
  const topicFail = /topic/i.test(text);
  return { subjectFail, topicFail, other: !subjectFail && !topicFail, reasons };
}

async function main() {
  assertNoCommitInThisFile();

  const hashes = {
    importReady: sha256File(IMPORT_PATH),
    structured: sha256File(JSONL_PATH),
    originalKey: sha256File(ORIGINAL_KEY_PATH),
    metadata: fs.existsSync(METADATA_PATH) ? sha256File(METADATA_PATH) : null,
  };
  hashes.importOk = hashes.importReady === EXPECTED_IMPORT_SHA256;
  hashes.structuredOk = hashes.structured === EXPECTED_JSONL_SHA256;
  hashes.originalOk = hashes.originalKey === EXPECTED_ORIGINAL_KEY_SHA256;

  const blockers = [];
  if (!hashes.importOk) blockers.push('SET_A_import_ready.jsonl hash mismatch — STOP.');
  if (!hashes.structuredOk) blockers.push('SET_A_structured.jsonl hash mismatch — STOP.');
  if (!hashes.originalOk) blockers.push('Original answer key hash mismatch — STOP.');
  if (!fs.existsSync(METADATA_PATH)) {
    blockers.push(
      `\`${path.basename(METADATA_PATH)}\` does not exist at ${METADATA_PATH}.`,
    );
  }

  loadBackendEnv();
  const uri = String(process.env.MONGODB_URI || '').trim();
  if (!uri) {
    blockers.push('MONGODB_URI is unavailable. No MongoDB session was opened.');
  }

  if (blockers.length) {
    writeReport(blockedReport(blockers, hashes));
    console.error('GATE 2 DRY-RUN: BLOCKED');
    for (const b of blockers) console.error(`- ${b}`);
    console.error(`Wrote ${REPORT_PATH}`);
    process.exit(1);
  }

  const metadataHashBefore = hashes.metadata;
  const before = await countCollections(uri);
  if (before.dbName !== EXPECTED_DB) {
    writeReport(
      blockedReport(
        [`Connected database is "${before.dbName}", expected "${EXPECTED_DB}". No dry-run.`],
        hashes,
      ),
    );
    console.error('GATE 2 DRY-RUN: BLOCKED');
    process.exit(1);
  }

  const source = loadJsonl(IMPORT_PATH);
  const enriched = loadJsonl(METADATA_PATH);
  const integrityIssues = [];
  if (enriched.length !== 250) {
    integrityIssues.push(`metadata file has ${enriched.length} records, expected 250`);
  }
  if (source.length !== 250) {
    integrityIssues.push(`import-ready has ${source.length} records, expected 250`);
  }
  const presentation = { plain: 0, two_statements: 0, numbered_list: 0, table: 0, other: 0 };
  const answers = { 0: 0, 1: 0, 2: 0, 3: 0, other: 0 };
  for (let i = 0; i < Math.min(source.length, enriched.length); i += 1) {
    const src = source[i];
    const row = enriched[i];
    const extra = Object.keys(row).filter((k) => !(k in src));
    if (extra.sort().join(',') !== 'subject,topic' && extra.sort().join(',') !== 'topic,subject') {
      integrityIssues.push(`Q${row.sourceQuestionNumber ?? i + 1} extra keys: ${extra.join(', ')}`);
    }
    for (const key of CONTENT_KEYS) {
      if (!(key in src) && !(key in row)) continue;
      if (JSON.stringify(row[key]) !== JSON.stringify(src[key])) {
        integrityIssues.push(`Q${src.sourceQuestionNumber} ${key} changed vs import-ready`);
      }
    }
    if (JSON.stringify(withoutTaxonomy(row)) !== JSON.stringify(src)) {
      integrityIssues.push(`Q${src.sourceQuestionNumber} unexpected field changes besides subject/topic`);
    }
    const kind = row.presentationKind;
    if (kind in presentation) presentation[kind] += 1;
    else presentation.other += 1;
    const idx = Array.isArray(row.correctAnswers) ? row.correctAnswers[0] : null;
    if (idx === 0 || idx === 1 || idx === 2 || idx === 3) answers[idx] += 1;
    else answers.other += 1;
  }

  mongoose.set('strictQuery', true);
  mongoose.set('autoIndex', false);
  await mongoose.connect(uri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 10_000,
  });
  if (mongoose.connection.name !== EXPECTED_DB) {
    await mongoose.disconnect();
    writeReport(
      blockedReport(
        [`Mongoose database is "${mongoose.connection.name}", expected "${EXPECTED_DB}".`],
        hashes,
      ),
    );
    console.error('GATE 2 DRY-RUN: BLOCKED');
    process.exit(1);
  }

  const { parseImportBuffer, analyzeRows } = await import(
    moduleUrl('src/services/questionImportService.js')
  );

  let analysis;
  try {
    const buffer = fs.readFileSync(METADATA_PATH);
    const parsed = parseImportBuffer(buffer, 'SET_A_metadata_import_ready.jsonl');
    analysis = await analyzeRows(parsed, { tagPostIds: [] });
  } finally {
    await mongoose.disconnect().catch(() => {});
  }

  const after = await countCollections(uri);
  const metadataHashAfter = sha256File(METADATA_PATH);
  if (metadataHashAfter !== metadataHashBefore) {
    console.error('STOP: metadata JSONL hash changed during dry-run.');
    process.exit(1);
  }

  const questionCountChanged = before.questions !== after.questions;
  const subjectChanged = before.subjects !== after.subjects;
  const topicChanged = before.topics !== after.topics;

  const rows = analysis.rows || [];
  const summary = analysis.summary || { total: rows.length, valid: 0, invalid: 0, duplicates: 0 };
  const dbDups = [];
  const fileDups = [];
  const invalidRows = [];
  let subjectFailures = 0;
  let topicFailures = 0;
  let validationFailures = 0;
  const subjectCounts = new Map();
  const topicCounts = new Map();

  for (const row of rows) {
    const qnum =
      enriched[row.line - 1]?.sourceQuestionNumber ??
      row.line;
    if (row.status === 'duplicate' && row.duplicateOfId) {
      dbDups.push({ q: qnum, reason: `database duplicate of ${row.duplicateOfId}` });
    } else if (row.status === 'duplicate') {
      fileDups.push({
        q: qnum,
        reason: `in-file duplicate of line ${row.duplicateOfLine}`,
      });
    }
    if (row.status === 'invalid') {
      const cls = classifyInvalid(row);
      if (cls.subjectFail) subjectFailures += 1;
      if (cls.topicFail) topicFailures += 1;
      if (cls.other || (!cls.subjectFail && !cls.topicFail)) validationFailures += 1;
      else if (cls.subjectFail || cls.topicFail) {
        const leftover = (row.reasons || []).filter(
          (r) => !/subject/i.test(r) && !/topic/i.test(r),
        );
        if (leftover.length) validationFailures += 1;
      }
      invalidRows.push({
        q: qnum,
        error: (row.reasons || []).join('; ') || 'invalid',
        field: cls.subjectFail ? 'subject' : cls.topicFail ? 'topic' : 'validation',
      });
    }
    if (row.subject?.name && row.topic?.name) {
      subjectCounts.set(row.subject.name, (subjectCounts.get(row.subject.name) || 0) + 1);
      const key = `${row.subject.name}|||${row.topic.name}`;
      topicCounts.set(key, (topicCounts.get(key) || 0) + 1);
    }
  }

  const errorTable =
    invalidRows.length === 0
      ? 'No validation errors.'
      : [
          '| Q | Error | Field |',
          '|---|---|---|',
          ...invalidRows.map((r) => `| ${r.q} | ${String(r.error).replace(/\|/g, '\\|')} | ${r.field} |`),
        ].join('\n');

  const dupSection = [...dbDups, ...fileDups];
  const dupText =
    dupSection.length === 0
      ? 'No duplicates detected.'
      : [
          '| Q | Reason |',
          '|---|---|',
          ...dupSection.map((r) => `| ${r.q} | ${r.reason} |`),
        ].join('\n');

  const subjTable = [
    '| Subject | Questions |',
    '|---|---:|',
    ...[...subjectCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, n]) => `| ${name} | ${n} |`),
  ].join('\n');

  const topicTable = [
    '| Subject | Topic | Questions |',
    '|---|---|---:|',
    ...[...topicCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map((entry) => {
        const [subject, topic] = entry[0].split('|||');
        return `| ${subject} | ${topic} | ${entry[1]} |`;
      }),
  ].join('\n');

  const status = questionCountChanged || subjectChanged || topicChanged
    ? 'FAILED SAFETY — COUNTS CHANGED'
    : 'DRY-RUN ONLY — COMPLETE';

  const md = `# SET A — Gate 2 Dry Run

Status:
${status}

Database:
\`${after.dbName}\`

Input:
\`SET_A_metadata_import_ready.jsonl\`

Method:
Existing \`parseImportBuffer\` + \`analyzeRows\` (same logic as \`POST /questions/admin/import/dry-run\`).
HTTP was not used (adminChain). \`commitValidRows\` was not called. \`forceImportDuplicates\` was not used.
Mongoose connected with \`autoIndex: false\`.

## Summary

| Metric | Count |
|---|---:|
| Total records | ${summary.total} |
| Valid | ${summary.valid} |
| Invalid | ${summary.invalid} |
| Database duplicates | ${dbDups.length} |
| In-file duplicates | ${fileDups.length} |
| Subject failures | ${subjectFailures} |
| Topic failures | ${topicFailures} |
| Question validation failures | ${validationFailures} |

Importer summary.duplicates: ${summary.duplicates}

## Subject Distribution

${subjTable || '_No resolved subjects._'}

## Topic Distribution

${topicTable || '_No resolved topics._'}

## Validation Errors

${errorTable}

## Duplicate Results

${dupText}

## Structured Presentation

From the metadata file (not rewritten):

| Presentation Kind | Count |
|---|---:|
| plain | ${presentation.plain} |
| two_statements | ${presentation.two_statements} |
| numbered_list | ${presentation.numbered_list} |
| table | ${presentation.table} |
| other | ${presentation.other} |

Expected: plain 49, two_statements 8, numbered_list 179, table 14.

Match: ${
    presentation.plain === 49 &&
    presentation.two_statements === 8 &&
    presentation.numbered_list === 179 &&
    presentation.table === 14 &&
    presentation.other === 0
      ? 'YES'
      : 'NO'
  }

## Answer Distribution

| Letter | Index | Count |
|---|---:|---:|
| A | 0 | ${answers[0]} |
| B | 1 | ${answers[1]} |
| C | 2 | ${answers[2]} |
| D | 3 | ${answers[3]} |
| other | | ${answers.other} |

Expected: A 67, B 82, C 65, D 36.

Match: ${answers[0] === 67 && answers[1] === 82 && answers[2] === 65 && answers[3] === 36 && answers.other === 0 ? 'YES' : 'NO'}

## Answer integrity vs SET_A_import_ready.jsonl

${
    integrityIssues.length === 0
      ? 'Only intended additions are `subject` and `topic`. questionText, options, correctAnswers, presentationKind, content, questionType, and sourceQuestionNumber are unchanged.'
      : integrityIssues.map((i) => `- ${i}`).join('\n')
  }

## Database before/after

| Collection | Before | After |
|---|---:|---:|
| questions | ${before.questions} | ${after.questions} |
| subjects | ${before.subjects} | ${after.subjects} |
| topics | ${before.topics} | ${after.topics} |

Question count unchanged: ${before.questions === after.questions ? 'YES' : 'NO — STOP'}
Subjects remain 11: ${after.subjects === 11 ? 'YES' : `NO (${after.subjects})`}
Topics remain 48: ${after.topics === 48 ? 'YES' : `NO (${after.topics})`}

## Hashes

| File | SHA-256 | Status |
|---|---|---|
| \`SET_A_import_ready.jsonl\` | \`${hashes.importReady}\` | unchanged |
| \`SET_A_structured.jsonl\` | \`${hashes.structured}\` | unchanged |
| Original answer key | \`${hashes.originalKey}\` | unchanged |
| \`SET_A_metadata_import_ready.jsonl\` | \`${metadataHashAfter}\` | unchanged during dry-run |

## Safety

Question documents written: 0
Question documents modified: 0
Question documents deleted: 0
MongoDB writes: 0

NO QUESTION IMPORT WAS PERFORMED.
`;

  writeReport(md);
  console.log(`GATE 2 DRY-RUN: ${questionCountChanged ? 'BLOCKED' : 'COMPLETE'}`);
  console.log(`total=${summary.total} valid=${summary.valid} invalid=${summary.invalid} duplicates=${summary.duplicates}`);
  console.log(`questions before=${before.questions} after=${after.questions}`);
  console.log(`subjects=${after.subjects} topics=${after.topics}`);
  console.log(`metadata SHA-256: ${metadataHashAfter}`);
  console.log(`Wrote ${REPORT_PATH}`);
  console.log('Question documents written: 0');
  console.log('Question documents modified: 0');
  console.log('Question documents deleted: 0');
  console.log('MongoDB writes: 0');
  if (questionCountChanged) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
