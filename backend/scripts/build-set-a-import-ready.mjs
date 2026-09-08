/**
 * Phase 5C: merge SET A structured JSONL with the proposed final answer key.
 * File-only. Never connects to MongoDB. Never writes the original source files.
 *
 * Run: node scripts/build-set-a-import-ready.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const SOURCE_PATH = path.join(FIXTURE_DIR, 'SET_A_structured.jsonl');
const PROPOSED_PATH = path.join(FIXTURE_DIR, 'SET_A_final_answer_key_proposed.json');
const ORIGINAL_KEY_PATH = path.join(FIXTURE_DIR, 'SET_A_answer_key.json');
const OUT_PATH = path.join(FIXTURE_DIR, 'SET_A_import_ready.jsonl');

const EXPECTED_JSONL_SHA256 =
  '8025d729630c783c6c3b0d3ae33e3fc3322faa34356c8a9b263e94b8926e0fb4';
const EXPECTED_ORIGINAL_KEY_SHA256 =
  '07f77efbc334ca63e8c13b44c36adcf45c12fa86f7f839cf87351d4ee206b259';
const EXPECTED_PROPOSED_SHA256 =
  '1ba869a795b0bd6bd2c3b14c0d313f7166a1a645d1a4fb7f3c31336e44bfb4d8';

const LETTER_TO_INDEX = Object.freeze({ A: 0, B: 1, C: 2, D: 3 });
const LETTERS = new Set(['A', 'B', 'C', 'D']);

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fail(message) {
  console.error(`STOP: ${message}`);
  process.exit(1);
}

function loadSourceRecords() {
  const text = fs.readFileSync(SOURCE_PATH, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line, i) => {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch (err) {
      fail(`source line ${i + 1}: invalid JSON (${err.message})`);
    }
    return rec;
  });
}

function main() {
  if (!fs.existsSync(SOURCE_PATH)) fail(`missing ${SOURCE_PATH}`);
  if (!fs.existsSync(PROPOSED_PATH)) fail(`missing ${PROPOSED_PATH}`);

  const jsonlHash = sha256File(SOURCE_PATH);
  const proposedHash = sha256File(PROPOSED_PATH);
  const originalKeyHash = sha256File(ORIGINAL_KEY_PATH);
  if (jsonlHash !== EXPECTED_JSONL_SHA256) {
    fail(`SET_A_structured.jsonl hash mismatch: ${jsonlHash}`);
  }
  if (proposedHash !== EXPECTED_PROPOSED_SHA256) {
    fail(`SET_A_final_answer_key_proposed.json hash mismatch: ${proposedHash}`);
  }
  if (originalKeyHash !== EXPECTED_ORIGINAL_KEY_SHA256) {
    fail(`SET_A_answer_key.json hash mismatch: ${originalKeyHash}`);
  }

  const source = loadSourceRecords();
  if (source.length !== 250) fail(`source has ${source.length} records, expected 250`);

  const proposed = JSON.parse(fs.readFileSync(PROPOSED_PATH, 'utf8'));
  const answers = proposed.answers;
  if (!Array.isArray(answers) || answers.length !== 250) {
    fail(`proposed key has ${answers?.length} records, expected 250`);
  }
  if (proposed.totalQuestions !== 250) {
    fail(`proposed.totalQuestions=${proposed.totalQuestions}`);
  }

  const byNumber = new Map();
  const nulls = [];
  for (const row of answers) {
    const n = row.questionNumber;
    if (!Number.isInteger(n) || n < 1 || n > 250) {
      fail(`unexpected proposed questionNumber=${n}`);
    }
    if (byNumber.has(n)) fail(`duplicate proposed answer for Q${n}`);
    if (!LETTERS.has(row.answer)) {
      if (row.answer == null) nulls.push(n);
      else fail(`Q${n} answer is not A/B/C/D: ${JSON.stringify(row.answer)}`);
    }
    byNumber.set(n, row);
  }
  if (byNumber.size !== 250) fail(`proposed key covers ${byNumber.size} questions`);
  for (let n = 1; n <= 250; n += 1) {
    if (!byNumber.has(n)) fail(`missing proposed answer for Q${n}`);
  }
  if (nulls.length) {
    fail(
      `null/unresolved answers — import-ready JSONL was NOT written. Questions: ${nulls
        .map((n) => `Q${n}`)
        .join(', ')}`
    );
  }

  const outLines = [];
  for (let i = 0; i < source.length; i += 1) {
    const rec = source[i];
    const expectedQ = i + 1;
    const qn = rec.sourceQuestionNumber;
    if (qn !== expectedQ) {
      fail(`join mismatch at line ${expectedQ}: sourceQuestionNumber=${qn}`);
    }
    if (Object.prototype.hasOwnProperty.call(rec, 'correctAnswers')) {
      fail(`Q${qn} already has correctAnswers; refusing to overwrite source semantics`);
    }
    const key = byNumber.get(qn);
    const idx = LETTER_TO_INDEX[key.answer];
    if (idx == null) fail(`Q${qn} cannot map letter ${key.answer}`);
    if (idx < 0 || idx >= rec.options.length) {
      fail(`Q${qn} index ${idx} out of range for ${rec.options.length} options`);
    }
    // Copy source fields in original key order; append correctAnswers only.
    const merged = { ...rec, correctAnswers: [idx] };
    outLines.push(JSON.stringify(merged));
  }

  fs.writeFileSync(OUT_PATH, `${outLines.join('\n')}\n`, 'utf8');
  const outHash = sha256File(OUT_PATH);
  console.log(`wrote ${OUT_PATH}`);
  console.log(`records: ${outLines.length}`);
  console.log(`answers merged: ${outLines.length}`);
  console.log(`SET_A_structured.jsonl SHA-256: ${jsonlHash}`);
  console.log(`SET_A_answer_key.json SHA-256: ${originalKeyHash}`);
  console.log(`SET_A_final_answer_key_proposed.json SHA-256: ${proposedHash}`);
  console.log(`SET_A_import_ready.jsonl SHA-256: ${outHash}`);
}

main();
