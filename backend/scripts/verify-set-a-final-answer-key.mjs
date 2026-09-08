/**
 * Phase 5B.2 SET A proposed final-answer-key verification. File-only. No Mongo writes.
 * Run: node scripts/verify-set-a-final-answer-key.mjs
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const JSONL_PATH = path.join(FIXTURE_DIR, 'SET_A_structured.jsonl');
const ORIGINAL_KEY_PATH = path.join(FIXTURE_DIR, 'SET_A_answer_key.json');
const PROPOSED_PATH = path.join(FIXTURE_DIR, 'SET_A_final_answer_key_proposed.json');
const EXPECTED_JSONL_SHA256 =
  '8025d729630c783c6c3b0d3ae33e3fc3322faa34356c8a9b263e94b8926e0fb4';
const EXPECTED_KEY_SHA256 =
  '07f77efbc334ca63e8c13b44c36adcf45c12fa86f7f839cf87351d4ee206b259';
const LETTERS = new Set(['A', 'B', 'C', 'D']);
const CONF = new Set(['high', 'medium', 'low']);
const VERDICTS = new Set([
  'CONFIRMED',
  'PROBABLY_CORRECT',
  'UNCERTAIN',
  'LIKELY_WRONG',
  'CANNOT_VERIFY',
]);
const EXPECTED_LETTER_CHANGES = new Map([
  [88, 'A'],
  [120, 'C'],
  [151, 'A'],
]);

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
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => JSON.parse(line).sourceQuestionNumber);
}

function run() {
  test('A. proposed key exists', () => {
    assert.equal(fs.existsSync(PROPOSED_PATH), true, `missing ${PROPOSED_PATH}`);
  });

  const proposed = JSON.parse(fs.readFileSync(PROPOSED_PATH, 'utf8'));
  const answers = proposed.answers;
  const original = JSON.parse(fs.readFileSync(ORIGINAL_KEY_PATH, 'utf8'));
  const origByQ = new Map(original.answers.map((a) => [a.questionNumber, a]));
  const jsonlNums = new Set(loadJsonlNumbers());

  test('B. exactly 250 records', () => {
    assert.equal(proposed.totalQuestions, 250);
    assert.ok(Array.isArray(answers));
    assert.equal(answers.length, 250);
  });

  test('C. question numbers exactly 1–250', () => {
    assert.deepEqual(
      answers.map((a) => a.questionNumber),
      Array.from({ length: 250 }, (_, i) => i + 1),
    );
  });

  test('D. no duplicates', () => {
    const seen = new Set();
    for (const a of answers) {
      assert.equal(seen.has(a.questionNumber), false, `duplicate Q${a.questionNumber}`);
      seen.add(a.questionNumber);
    }
    assert.equal(seen.size, 250);
  });

  test('E. every answer is A/B/C/D/null', () => {
    for (const a of answers) {
      const ok = a.answer === null || LETTERS.has(a.answer);
      assert.equal(ok, true, `Q${a.questionNumber} answer=${JSON.stringify(a.answer)}`);
      assert.equal(typeof a.answer === 'number', false, `Q${a.questionNumber} numeric answer`);
    }
  });

  test('F. every confidence is high/medium/low', () => {
    for (const a of answers) {
      assert.ok(CONF.has(a.confidence), `Q${a.questionNumber} confidence=${a.confidence}`);
    }
  });

  test('G. every verdict is valid', () => {
    for (const a of answers) {
      assert.ok(VERDICTS.has(a.verdict), `Q${a.questionNumber} verdict=${a.verdict}`);
    }
  });

  test('H. null answers require low confidence', () => {
    for (const a of answers) {
      if (a.answer !== null) continue;
      assert.equal(a.confidence, 'low', `Q${a.questionNumber} null without low confidence`);
      assert.ok(
        a.verdict === 'UNCERTAIN' || a.verdict === 'CANNOT_VERIFY',
        `Q${a.questionNumber} null verdict=${a.verdict}`,
      );
      assert.equal(typeof a.notes, 'string');
      assert.ok(String(a.notes).trim().length >= 20, `Q${a.questionNumber} null notes too short`);
    }
  });

  test('I. all questions exist in SET_A_structured.jsonl', () => {
    assert.equal(jsonlNums.size, 250);
    for (const a of answers) {
      assert.equal(jsonlNums.has(a.questionNumber), true, `Q${a.questionNumber} missing from JSONL`);
    }
  });

  test('J. original SET_A_answer_key.json is unchanged', () => {
    assert.equal(sha256File(ORIGINAL_KEY_PATH), EXPECTED_KEY_SHA256);
  });

  test('K. original SET_A_structured.jsonl is unchanged', () => {
    assert.equal(sha256File(JSONL_PATH), EXPECTED_JSONL_SHA256);
  });

  test('L. proposed key contains the three known changes', () => {
    const byQ = new Map(answers.map((a) => [a.questionNumber, a]));
    assert.equal(byQ.get(88).answer, 'A', 'Q88 must be A');
    assert.equal(byQ.get(120).answer, 'C', 'Q120 must be C');
    assert.equal(byQ.get(151).answer, 'A', 'Q151 must be A');
  });

  const letterChanges = [];
  test('M. no unexpected answer changes without a corresponding reason', () => {
    for (const a of answers) {
      const orig = origByQ.get(a.questionNumber);
      assert.ok(orig, `Q${a.questionNumber} missing from original key`);
      if (a.answer === orig.answer) continue;
      letterChanges.push({
        q: a.questionNumber,
        from: orig.answer,
        to: a.answer,
      });
      assert.equal(
        EXPECTED_LETTER_CHANGES.has(a.questionNumber),
        true,
        `unexpected letter change Q${a.questionNumber} ${orig.answer}→${a.answer}`,
      );
      assert.equal(
        EXPECTED_LETTER_CHANGES.get(a.questionNumber),
        a.answer,
        `Q${a.questionNumber} expected ${EXPECTED_LETTER_CHANGES.get(a.questionNumber)} got ${a.answer}`,
      );
      assert.equal(typeof a.notes, 'string');
      assert.ok(String(a.notes).trim().length >= 20, `Q${a.questionNumber} change notes too short`);
    }
    assert.equal(letterChanges.length, EXPECTED_LETTER_CHANGES.size, 'missing expected letter changes');
  });

  const conf = { high: 0, medium: 0, low: 0 };
  const verd = {
    CONFIRMED: 0,
    PROBABLY_CORRECT: 0,
    UNCERTAIN: 0,
    LIKELY_WRONG: 0,
    CANNOT_VERIFY: 0,
  };
  let answered = 0;
  let nulls = 0;
  const lowOrWeak = [];
  for (const a of answers) {
    conf[a.confidence] += 1;
    verd[a.verdict] += 1;
    if (a.answer === null) nulls += 1;
    else answered += 1;
    if (
      a.confidence === 'low' ||
      a.verdict === 'UNCERTAIN' ||
      a.verdict === 'CANNOT_VERIFY'
    ) {
      lowOrWeak.push(`Q${a.questionNumber} ${a.answer ?? 'null'} ${a.confidence} ${a.verdict}`);
    }
  }

  console.log('');
  console.log('Proposed key: SET_A_final_answer_key_proposed.json');
  console.log(`status: ${proposed.status}`);
  console.log(`answerOrigin: ${proposed.answerOrigin}`);
  console.log(`Total questions: ${answers.length}`);
  console.log(`Answered (A–D): ${answered}`);
  console.log(`Null: ${nulls}`);
  console.log('');
  console.log(`High confidence: ${conf.high}`);
  console.log(`Medium confidence: ${conf.medium}`);
  console.log(`Low confidence: ${conf.low}`);
  console.log('');
  console.log(`CONFIRMED: ${verd.CONFIRMED}`);
  console.log(`PROBABLY_CORRECT: ${verd.PROBABLY_CORRECT}`);
  console.log(`UNCERTAIN: ${verd.UNCERTAIN}`);
  console.log(`LIKELY_WRONG: ${verd.LIKELY_WRONG}`);
  console.log(`CANNOT_VERIFY: ${verd.CANNOT_VERIFY}`);
  console.log('');
  console.log('Letter changes vs original SET_A_answer_key.json:');
  console.log(
    letterChanges.length
      ? letterChanges.map((c) => `Q${c.q} ${c.from} → ${c.to}`).join('\n')
      : 'None.',
  );
  console.log('');
  console.log('Low confidence / UNCERTAIN / CANNOT_VERIFY:');
  console.log(lowOrWeak.length ? lowOrWeak.join('\n') : 'None.');
  console.log('');
  console.log(`JSONL SHA-256: ${sha256File(JSONL_PATH)}`);
  console.log(`Original key SHA-256: ${sha256File(ORIGINAL_KEY_PATH)}`);
  console.log('');
  console.log(`${passed} checks passed (file-only; no MongoDB; no import).`);
}

run();
