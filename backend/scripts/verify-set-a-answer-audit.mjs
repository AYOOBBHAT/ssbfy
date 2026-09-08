/**
 * Phase 5B.1 SET A answer-key audit verification. File-only. No Mongo writes.
 * Run: node scripts/verify-set-a-answer-audit.mjs
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
const AUDIT_PATH = path.join(FIXTURE_DIR, 'SET_A_answer_audit.json');
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
const WEAK_VERDICTS = new Set(['UNCERTAIN', 'LIKELY_WRONG', 'CANNOT_VERIFY']);

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
  test('A. audit file exists', () => {
    assert.equal(fs.existsSync(AUDIT_PATH), true, `missing ${AUDIT_PATH}`);
  });

  const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'));
  const results = audit.results;
  const key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
  const keyByQ = new Map(key.answers.map((a) => [a.questionNumber, a]));
  const jsonlNums = new Set(loadJsonlNumbers());

  test('B. exactly 79 questions audited', () => {
    assert.equal(audit.auditedQuestions, 79);
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 79);
  });

  test('C. question numbers are unique', () => {
    const seen = new Set();
    for (const r of results) {
      assert.equal(seen.has(r.questionNumber), false, `duplicate Q${r.questionNumber}`);
      seen.add(r.questionNumber);
    }
    assert.equal(seen.size, 79);
  });

  test('D. every audited question exists in SET_A_structured.jsonl', () => {
    for (const r of results) {
      assert.equal(jsonlNums.has(r.questionNumber), true, `Q${r.questionNumber} missing from JSONL`);
    }
  });

  test('E. every audited question was originally medium or low confidence', () => {
    for (const r of results) {
      const orig = keyByQ.get(r.questionNumber);
      assert.ok(orig, `Q${r.questionNumber} missing from answer key`);
      assert.ok(
        orig.confidence === 'medium' || orig.confidence === 'low',
        `Q${r.questionNumber} was ${orig.confidence}`,
      );
    }
  });

  test('F. originalAnswer matches SET_A_answer_key.json', () => {
    for (const r of results) {
      const orig = keyByQ.get(r.questionNumber);
      assert.equal(r.originalAnswer, orig.answer, `Q${r.questionNumber} originalAnswer`);
    }
  });

  test('G. originalConfidence matches SET_A_answer_key.json', () => {
    for (const r of results) {
      const orig = keyByQ.get(r.questionNumber);
      assert.equal(r.originalConfidence, orig.confidence, `Q${r.questionNumber} originalConfidence`);
    }
  });

  test('H. verdict is valid', () => {
    for (const r of results) {
      assert.ok(VERDICTS.has(r.verdict), `Q${r.questionNumber} verdict=${r.verdict}`);
    }
  });

  test('I. recommendedAnswer is A/B/C/D/null', () => {
    for (const r of results) {
      const ok = r.recommendedAnswer === null || LETTERS.has(r.recommendedAnswer);
      assert.equal(ok, true, `Q${r.questionNumber} recommendedAnswer=${r.recommendedAnswer}`);
      assert.equal(typeof r.recommendedAnswer === 'number', false);
    }
  });

  test('J. recommendedConfidence is high/medium/low', () => {
    for (const r of results) {
      assert.ok(CONF.has(r.recommendedConfidence), `Q${r.questionNumber} ${r.recommendedConfidence}`);
    }
  });

  test('K. UNCERTAIN / LIKELY_WRONG / CANNOT_VERIFY have a useful reason', () => {
    for (const r of results) {
      if (!WEAK_VERDICTS.has(r.verdict)) continue;
      assert.equal(typeof r.reason, 'string');
      assert.ok(r.reason.trim().length >= 20, `Q${r.questionNumber} reason too short`);
    }
  });

  test('L. no source JSONL modification occurred', () => {
    assert.equal(sha256File(JSONL_PATH), EXPECTED_JSONL_SHA256);
  });

  test('M. no answer-key modification occurred', () => {
    assert.equal(sha256File(KEY_PATH), EXPECTED_KEY_SHA256);
  });

  const counts = {
    CONFIRMED: 0,
    PROBABLY_CORRECT: 0,
    UNCERTAIN: 0,
    LIKELY_WRONG: 0,
    CANNOT_VERIFY: 0,
  };
  const changes = [];
  const human = [];
  const remainLow = [];
  const extraction = [];
  const EXTRACTION = new Set([8, 94, 146, 176, 250]);
  for (const r of results) {
    counts[r.verdict] += 1;
    if (r.recommendedAnswer !== r.originalAnswer) {
      changes.push(`Q${r.questionNumber} ${r.originalAnswer}→${r.recommendedAnswer}`);
    }
    if (r.needsHumanReview) human.push(`Q${r.questionNumber}`);
    if (r.recommendedConfidence === 'low') remainLow.push(`Q${r.questionNumber}`);
    if (EXTRACTION.has(r.questionNumber)) extraction.push(`Q${r.questionNumber}`);
  }

  console.log('');
  console.log('Audited: 79');
  console.log(`CONFIRMED: ${counts.CONFIRMED}`);
  console.log(`PROBABLY_CORRECT: ${counts.PROBABLY_CORRECT}`);
  console.log(`UNCERTAIN: ${counts.UNCERTAIN}`);
  console.log(`LIKELY_WRONG: ${counts.LIKELY_WRONG}`);
  console.log(`CANNOT_VERIFY: ${counts.CANNOT_VERIFY}`);
  console.log('');
  console.log(`Recommended answer changes: ${changes.length}`);
  console.log(`Needs human review: ${human.length}`);
  console.log('');
  console.log('Recommended answer differs from original:');
  console.log(changes.length ? changes.join('\n') : 'None.');
  console.log('');
  console.log('Remain low confidence (recommended):');
  console.log(remainLow.length ? remainLow.join(', ') : 'None.');
  console.log('');
  console.log('Source extraction problematic (among audited 79):');
  console.log(extraction.length ? extraction.join(', ') : 'None.');
  console.log('');
  console.log(`${passed} checks passed (file-only; no MongoDB).`);
}

run();
