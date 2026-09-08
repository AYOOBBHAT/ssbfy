/**
 * Phase 5C SET A import-ready JSONL verification. File-only. No Mongo writes.
 * Run: node scripts/verify-set-a-import-ready.mjs
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUESTION_TYPE_VALUES } from '../src/models/Question.js';
import { validateJsonRecordShape } from '../src/services/questionImportService.js';
import {
  PRESENTATION_KIND_VALUES,
  prepareQuestionPresentation,
} from '../src/utils/questionPresentation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const SOURCE_PATH = path.join(FIXTURE_DIR, 'SET_A_structured.jsonl');
const PROPOSED_PATH = path.join(FIXTURE_DIR, 'SET_A_final_answer_key_proposed.json');
const ORIGINAL_KEY_PATH = path.join(FIXTURE_DIR, 'SET_A_answer_key.json');
const IMPORT_PATH = path.join(FIXTURE_DIR, 'SET_A_import_ready.jsonl');

const EXPECTED_JSONL_SHA256 =
  '8025d729630c783c6c3b0d3ae33e3fc3322faa34356c8a9b263e94b8926e0fb4';
const EXPECTED_ORIGINAL_KEY_SHA256 =
  '07f77efbc334ca63e8c13b44c36adcf45c12fa86f7f839cf87351d4ee206b259';
const EXPECTED_PROPOSED_SHA256 =
  '1ba869a795b0bd6bd2c3b14c0d313f7166a1a645d1a4fb7f3c31336e44bfb4d8';

const LETTER_TO_INDEX = Object.freeze({ A: 0, B: 1, C: 2, D: 3 });
const SUPPORTED_OPTIONAL = [
  'subject',
  'topic',
  'difficulty',
  'explanation',
  'year',
  'questionImage',
  'postIds',
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
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line, i) => {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch (err) {
      throw new Error(`${path.basename(filePath)} line ${i + 1}: invalid JSON (${err.message})`);
    }
    return rec;
  });
}

function withoutCorrectAnswers(rec) {
  const copy = { ...rec };
  delete copy.correctAnswers;
  delete copy.correctAnswer;
  return copy;
}

function run() {
  test('A. exactly 250 JSONL records', () => {
    assert.equal(fs.existsSync(IMPORT_PATH), true, `missing ${IMPORT_PATH}`);
    const recs = loadJsonl(IMPORT_PATH);
    assert.equal(recs.length, 250);
  });

  const source = loadJsonl(SOURCE_PATH);
  const importRecs = loadJsonl(IMPORT_PATH);
  const proposed = JSON.parse(fs.readFileSync(PROPOSED_PATH, 'utf8'));
  const byProposed = new Map(proposed.answers.map((a) => [a.questionNumber, a]));

  test('B. every line is valid JSON', () => {
    assert.equal(importRecs.length, 250);
  });

  test('C. every record has questionType, presentationKind, options, correctAnswers', () => {
    for (const rec of importRecs) {
      assert.equal(typeof rec.questionType, 'string');
      assert.equal(typeof rec.presentationKind, 'string');
      assert.ok(Array.isArray(rec.options), `Q${rec.sourceQuestionNumber} options`);
      assert.ok(Array.isArray(rec.correctAnswers), `Q${rec.sourceQuestionNumber} correctAnswers`);
    }
  });

  test('D. questionType is valid', () => {
    for (const rec of importRecs) {
      assert.ok(
        QUESTION_TYPE_VALUES.includes(rec.questionType),
        `Q${rec.sourceQuestionNumber} questionType=${rec.questionType}`,
      );
    }
  });

  test('E. presentationKind is valid', () => {
    for (const rec of importRecs) {
      assert.ok(
        PRESENTATION_KIND_VALUES.includes(rec.presentationKind),
        `Q${rec.sourceQuestionNumber} presentationKind=${rec.presentationKind}`,
      );
    }
  });

  test('F. every question has exactly four options if source has four', () => {
    for (let i = 0; i < importRecs.length; i += 1) {
      assert.equal(source[i].options.length, 4);
      assert.deepEqual(importRecs[i].options, source[i].options);
      assert.equal(importRecs[i].options.length, 4);
    }
  });

  test('G. correctAnswers are valid option indexes', () => {
    for (const rec of importRecs) {
      for (const idx of rec.correctAnswers) {
        assert.equal(Number.isInteger(idx), true);
        assert.ok(idx >= 0 && idx < rec.options.length, `Q${rec.sourceQuestionNumber} idx=${idx}`);
      }
    }
  });

  test('H. single_correct has exactly one correct index', () => {
    for (const rec of importRecs) {
      assert.equal(rec.questionType, 'single_correct');
      assert.equal(rec.correctAnswers.length, 1, `Q${rec.sourceQuestionNumber}`);
    }
  });

  test('I. two_statements content is valid', () => {
    for (const rec of importRecs) {
      if (rec.presentationKind !== 'two_statements') continue;
      assert.equal(rec.content.statements.length, 2);
      for (const s of rec.content.statements) {
        assert.equal(typeof s.label, 'string');
        assert.equal(typeof s.text, 'string');
      }
    }
  });

  test('J. numbered_list content is valid', () => {
    for (const rec of importRecs) {
      if (rec.presentationKind !== 'numbered_list') continue;
      assert.ok(Array.isArray(rec.content.items));
      assert.ok(rec.content.items.length >= 2);
      for (const it of rec.content.items) {
        assert.equal(Number.isInteger(it.n) && it.n >= 1, true);
        assert.equal(typeof it.text, 'string');
      }
    }
  });

  test('K. table content is valid', () => {
    for (const rec of importRecs) {
      if (rec.presentationKind !== 'table') continue;
      const cols = rec.content.columns.length;
      assert.ok(cols >= 1);
      for (const row of rec.content.rows) {
        assert.equal(row.length, cols, `Q${rec.sourceQuestionNumber}`);
      }
    }
  });

  test('L. structured content passes prepareQuestionPresentation() and importer shape', () => {
    const failures = [];
    for (const rec of importRecs) {
      prepareQuestionPresentation({
        presentationKind: rec.presentationKind,
        content: rec.content,
        questionText: rec.questionText,
      });
      const { reasons } = validateJsonRecordShape(rec);
      if (reasons.length) {
        failures.push(`Q${rec.sourceQuestionNumber}: ${reasons.join('; ')}`);
      }
    }
    assert.deepEqual(failures, []);
  });

  test('M. no duplicate records', () => {
    const nums = importRecs.map((r) => r.sourceQuestionNumber);
    assert.equal(new Set(nums).size, nums.length);
    const blobs = importRecs.map((r) => JSON.stringify(r));
    assert.equal(new Set(blobs).size, blobs.length);
  });

  test('N. no missing answers', () => {
    for (const rec of importRecs) {
      assert.notEqual(rec.correctAnswers, null);
      assert.equal(rec.correctAnswers.length, 1);
      assert.equal(typeof rec.correctAnswers[0], 'number');
    }
  });

  test('O. numbered item n values are unchanged', () => {
    for (let i = 0; i < source.length; i += 1) {
      if (source[i].presentationKind !== 'numbered_list') continue;
      assert.deepEqual(
        importRecs[i].content.items.map((it) => it.n),
        source[i].content.items.map((it) => it.n),
      );
    }
  });

  test('P. table rows still match column counts', () => {
    for (const rec of importRecs) {
      if (rec.presentationKind !== 'table') continue;
      const cols = rec.content.columns.length;
      for (const row of rec.content.rows) assert.equal(row.length, cols);
    }
  });

  test('Q. statement labels remain unchanged', () => {
    for (let i = 0; i < source.length; i += 1) {
      if (source[i].presentationKind !== 'two_statements') continue;
      assert.deepEqual(
        importRecs[i].content.statements.map((s) => s.label),
        source[i].content.statements.map((s) => s.label),
      );
    }
  });

  test('R. source metadata has not been unexpectedly dropped', () => {
    for (let i = 0; i < source.length; i += 1) {
      const src = source[i];
      const out = importRecs[i];
      for (const key of Object.keys(src)) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(out, key),
          true,
          `Q${src.sourceQuestionNumber} dropped ${key}`,
        );
        assert.deepEqual(out[key], src[key], `Q${src.sourceQuestionNumber} changed ${key}`);
      }
      for (const key of SUPPORTED_OPTIONAL) {
        if (Object.prototype.hasOwnProperty.call(src, key)) {
          assert.deepEqual(out[key], src[key]);
        } else {
          assert.equal(
            Object.prototype.hasOwnProperty.call(out, key),
            false,
            `Q${src.sourceQuestionNumber} invented ${key}`,
          );
        }
      }
    }
  });

  test('S. SHA-256 of SET_A_structured.jsonl is unchanged', () => {
    assert.equal(sha256File(SOURCE_PATH), EXPECTED_JSONL_SHA256);
  });

  test('T. SHA-256 of SET_A_final_answer_key_proposed.json is unchanged', () => {
    assert.equal(sha256File(PROPOSED_PATH), EXPECTED_PROPOSED_SHA256);
  });

  test('original answer key is unchanged', () => {
    assert.equal(sha256File(ORIGINAL_KEY_PATH), EXPECTED_ORIGINAL_KEY_SHA256);
  });

  test('only semantic addition is correctAnswers', () => {
    for (let i = 0; i < source.length; i += 1) {
      const src = source[i];
      const out = importRecs[i];
      assert.equal(out.questionType, src.questionType);
      assert.equal(out.presentationKind, src.presentationKind);
      assert.equal(out.questionText, src.questionText);
      assert.deepEqual(out.options, src.options);
      assert.deepEqual(out.content, src.content);
      assert.deepEqual(withoutCorrectAnswers(out), src);
      const extra = Object.keys(out).filter((k) => !Object.prototype.hasOwnProperty.call(src, k));
      assert.deepEqual(extra, ['correctAnswers'], `Q${src.sourceQuestionNumber} extra=${extra}`);
    }
  });

  test('correctAnswers match proposed letters A→0 B→1 C→2 D→3', () => {
    for (const rec of importRecs) {
      const key = byProposed.get(rec.sourceQuestionNumber);
      assert.ok(key, `missing proposed Q${rec.sourceQuestionNumber}`);
      assert.equal(rec.correctAnswers[0], LETTER_TO_INDEX[key.answer]);
    }
    assert.deepEqual(importRecs[87].correctAnswers, [0]); // Q88 A
    assert.deepEqual(importRecs[119].correctAnswers, [2]); // Q120 C
    assert.deepEqual(importRecs[150].correctAnswers, [0]); // Q151 A
    assert.deepEqual(importRecs[37].correctAnswers, [2]); // Q38 C
    assert.deepEqual(importRecs[93].correctAnswers, [0]); // Q94 A
  });

  test('no answer letters were added to import-ready records', () => {
    for (const rec of importRecs) {
      assert.equal(rec.answer, undefined);
      assert.equal(rec.correctAnswer, undefined);
      assert.equal(rec.confidence, undefined);
      assert.equal(rec.verdict, undefined);
    }
  });

  const kinds = { plain: 0, two_statements: 0, numbered_list: 0, table: 0 };
  const letters = { A: 0, B: 0, C: 0, D: 0 };
  const INDEX_TO_LETTER = ['A', 'B', 'C', 'D'];
  for (const rec of importRecs) {
    kinds[rec.presentationKind] += 1;
    letters[INDEX_TO_LETTER[rec.correctAnswers[0]]] += 1;
  }

  console.log('');
  console.log(`Import-ready records: ${importRecs.length}`);
  console.log(`Source records: ${source.length}`);
  console.log('Presentation:');
  console.log(`  plain: ${kinds.plain}`);
  console.log(`  two_statements: ${kinds.two_statements}`);
  console.log(`  numbered_list: ${kinds.numbered_list}`);
  console.log(`  table: ${kinds.table}`);
  console.log('Answers:');
  console.log(`  A/0: ${letters.A}`);
  console.log(`  B/1: ${letters.B}`);
  console.log(`  C/2: ${letters.C}`);
  console.log(`  D/3: ${letters.D}`);
  console.log('');
  console.log(`JSONL SHA-256: ${sha256File(SOURCE_PATH)}`);
  console.log(`Original key SHA-256: ${sha256File(ORIGINAL_KEY_PATH)}`);
  console.log(`Proposed key SHA-256: ${sha256File(PROPOSED_PATH)}`);
  console.log(`Import-ready SHA-256: ${sha256File(IMPORT_PATH)}`);
  console.log('');
  console.log(`${passed} checks passed (file-only; no MongoDB; no import commit).`);
}

run();
