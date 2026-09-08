/**
 * Phase 5B SET A answer-key verification. File-only. No Mongo writes.
 * Run: node scripts/verify-set-a-answer-key.mjs
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const JSONL_PATH = path.join(FIXTURE_DIR, 'SET_A_structured.jsonl');
const KEY_PATH = path.join(FIXTURE_DIR, 'SET_A_answer_key.json');
const EXPECTED_JSONL_SHA256 =
  '8025d729630c783c6c3b0d3ae33e3fc3322faa34356c8a9b263e94b8926e0fb4';
const LETTERS = new Set(['A', 'B', 'C', 'D']);
const CONF = new Set(['high', 'medium', 'low']);

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function loadJsonlNumbers() {
  const text = fs.readFileSync(JSONL_PATH, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line, i) => {
    const rec = JSON.parse(line);
    const n = rec.sourceQuestionNumber;
    if (typeof n !== 'number') {
      throw new Error(`JSONL line ${i + 1}: missing sourceQuestionNumber`);
    }
    return n;
  });
}

function run() {
  test('A. answer-key file exists', () => {
    assert.equal(fs.existsSync(KEY_PATH), true, `missing ${KEY_PATH}`);
  });

  const key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
  const answers = key.answers;

  test('B. totalQuestions = 250', () => {
    assert.equal(key.totalQuestions, 250);
  });

  test('C. exactly 250 answer records', () => {
    assert.ok(Array.isArray(answers));
    assert.equal(answers.length, 250);
  });

  test('D. question numbers are exactly 1–250', () => {
    assert.deepEqual(
      answers.map((a) => a.questionNumber),
      Array.from({ length: 250 }, (_, i) => i + 1),
    );
  });

  test('E. no duplicate question numbers', () => {
    const seen = new Set();
    for (const a of answers) {
      assert.equal(seen.has(a.questionNumber), false, `duplicate Q${a.questionNumber}`);
      seen.add(a.questionNumber);
    }
    assert.equal(seen.size, 250);
  });

  test('F. every answer is A, B, C, D, or null', () => {
    for (const a of answers) {
      const ok = a.answer === null || LETTERS.has(a.answer);
      assert.equal(ok, true, `Q${a.questionNumber} answer=${JSON.stringify(a.answer)}`);
      assert.equal(typeof a.answer === 'number', false, `Q${a.questionNumber} numeric answer`);
    }
  });

  test('G. every null answer has confidence=low and a non-empty note', () => {
    for (const a of answers) {
      if (a.answer !== null) continue;
      assert.equal(a.confidence, 'low', `Q${a.questionNumber} null without low confidence`);
      assert.equal(typeof a.notes, 'string');
      assert.ok(a.notes.trim().length > 0, `Q${a.questionNumber} null without notes`);
    }
  });

  test('H. confidence is high, medium, or low', () => {
    for (const a of answers) {
      assert.ok(CONF.has(a.confidence), `Q${a.questionNumber} confidence=${a.confidence}`);
    }
  });

  const jsonlNums = loadJsonlNumbers();

  test('I. every JSONL question has a corresponding answer-key record', () => {
    const keyNums = new Set(answers.map((a) => a.questionNumber));
    for (const n of jsonlNums) {
      assert.equal(keyNums.has(n), true, `JSONL Q${n} missing from answer key`);
    }
  });

  test('J. no extra question numbers exist', () => {
    const jsonlSet = new Set(jsonlNums);
    for (const a of answers) {
      assert.equal(jsonlSet.has(a.questionNumber), true, `extra Q${a.questionNumber} in answer key`);
    }
    assert.equal(jsonlNums.length, 250);
  });

  test('K. original SET_A_structured.jsonl is not modified', () => {
    assert.equal(sha256File(JSONL_PATH), EXPECTED_JSONL_SHA256);
  });

  const summary = { high: 0, medium: 0, low: 0, answered: 0, unanswered: 0 };
  for (const a of answers) {
    summary[a.confidence] += 1;
    if (a.answer == null) summary.unanswered += 1;
    else summary.answered += 1;
  }

  console.log('');
  console.log('L. summary');
  console.log(`Total: 250`);
  console.log(`Answered: ${summary.answered}`);
  console.log(`Unanswered: ${summary.unanswered}`);
  console.log(`High confidence: ${summary.high}`);
  console.log(`Medium confidence: ${summary.medium}`);
  console.log(`Low confidence: ${summary.low}`);
  console.log('');
  console.log(`${passed} checks passed (file-only; no MongoDB).`);
}

run();
