/**
 * Phase 5A SET A JSONL structural verification. No Mongo writes.
 * Run: node scripts/verify-set-a-jsonl.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareQuestionPresentation } from '../src/utils/questionPresentation.js';
import { validateJsonRecordShape } from '../src/services/questionImportService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSONL_PATH = path.join(__dirname, 'fixtures', 'set-a', 'SET_A_structured.jsonl');
const KINDS = new Set(['plain', 'two_statements', 'numbered_list', 'table']);
const FOOTER_RE = /schoolofupsc|--\s*\d+\s+of\s+\d+\s*--/i;

let passed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`ok  ${name}`);
    });
}

function loadRecords() {
  const text = fs.readFileSync(JSONL_PATH, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line, i) => {
    try {
      return { line: i + 1, rec: JSON.parse(line) };
    } catch (err) {
      throw new Error(`Line ${i + 1}: invalid JSON (${err.message})`);
    }
  });
}

function blob(rec) {
  return JSON.stringify(rec);
}

async function run() {
  const rows = loadRecords();
  const recs = rows.map((r) => r.rec);

  await test('A. exactly 250 records', () => {
    assert.equal(recs.length, 250);
  });

  await test('B. question numbers 1–250 all present once', () => {
    const nums = recs.map((r) => r.sourceQuestionNumber);
    assert.deepEqual(nums, Array.from({ length: 250 }, (_, i) => i + 1));
  });

  await test('C. every record has questionType, presentationKind, options', () => {
    for (const rec of recs) {
      assert.equal(typeof rec.questionType, 'string');
      assert.equal(typeof rec.presentationKind, 'string');
      assert.ok(Array.isArray(rec.options), `Q${rec.sourceQuestionNumber} options`);
    }
  });

  await test('D. presentationKind is an allowed kind', () => {
    for (const rec of recs) {
      assert.ok(KINDS.has(rec.presentationKind), `Q${rec.sourceQuestionNumber} ${rec.presentationKind}`);
    }
  });

  await test('E/N. backend presentation validation accepts every record', () => {
    for (const rec of recs) {
      prepareQuestionPresentation({
        presentationKind: rec.presentationKind,
        content: rec.content,
        questionText: rec.questionText,
      });
    }
  });

  await test('F. every question has exactly 4 options', () => {
    for (const rec of recs) {
      assert.equal(rec.options.length, 4, `Q${rec.sourceQuestionNumber}`);
      for (const opt of rec.options) {
        assert.ok(String(opt).trim(), `Q${rec.sourceQuestionNumber} empty option`);
      }
    }
  });

  await test('G. correctAnswers omitted (source PDF has no answer key)', () => {
    for (const rec of recs) {
      assert.equal(
        rec.correctAnswers,
        undefined,
        `Q${rec.sourceQuestionNumber} must not invent correctAnswers`
      );
      assert.equal(rec.correctAnswer, undefined);
    }
  });

  await test('G2. if a dummy A-index is supplied, importer shape otherwise validates', () => {
    const failures = [];
    for (const rec of recs) {
      const clone = { ...rec, correctAnswers: [0] };
      const { reasons } = validateJsonRecordShape(clone);
      if (reasons.length) failures.push(`Q${rec.sourceQuestionNumber}: ${reasons.join('; ')}`);
    }
    assert.deepEqual(failures, []);
  });

  await test('H. two_statements has exactly 2 labeled statements', () => {
    const two = recs.filter((r) => r.presentationKind === 'two_statements');
    assert.ok(two.length > 0);
    for (const rec of two) {
      assert.equal(rec.content.statements.length, 2);
      for (const s of rec.content.statements) {
        assert.ok(s.label && s.text);
      }
    }
  });

  await test('I. numbered_list items keep source n and have text', () => {
    const lists = recs.filter((r) => r.presentationKind === 'numbered_list');
    assert.ok(lists.length > 0);
    for (const rec of lists) {
      const ns = rec.content.items.map((it) => it.n);
      assert.ok(ns.length >= 2);
      for (const it of rec.content.items) {
        assert.ok(Number.isInteger(it.n) && it.n >= 1);
        assert.ok(String(it.text).trim());
      }
    }
    const q15 = recs[14];
    assert.deepEqual(q15.content.items.map((it) => it.n), [1, 2, 3, 4, 5]);
  });

  await test('J. table rows match column count', () => {
    const tables = recs.filter((r) => r.presentationKind === 'table');
    assert.equal(tables.length, 14);
    for (const rec of tables) {
      const cols = rec.content.columns.length;
      assert.ok(cols >= 1 && cols <= 8);
      assert.ok(rec.content.rows.length >= 1);
      for (const row of rec.content.rows) {
        assert.equal(row.length, cols, `Q${rec.sourceQuestionNumber}`);
      }
    }
    const q12 = recs[11];
    assert.deepEqual(q12.content.columns, ['Continents', 'Highest Peak']);
    assert.deepEqual(q12.content.rows[0], ['North America', 'Aconcagua']);
  });

  await test('K. no duplicate question records', () => {
    const keys = recs.map((r) => r.sourceQuestionNumber);
    assert.equal(new Set(keys).size, keys.length);
    const texts = recs.map((r) => blob(r));
    assert.equal(new Set(texts).size, texts.length);
  });

  await test('L. no page header/footer contamination', () => {
    for (const rec of recs) {
      assert.doesNotMatch(blob(rec), FOOTER_RE, `Q${rec.sourceQuestionNumber}`);
    }
  });

  await test('M. no empty question text/content', () => {
    for (const rec of recs) {
      if (rec.presentationKind === 'plain') {
        assert.ok(String(rec.questionText || '').trim(), `Q${rec.sourceQuestionNumber}`);
        assert.equal(rec.content, undefined);
      } else {
        assert.ok(rec.content && typeof rec.content === 'object');
      }
    }
  });

  await test('questionType is single_correct for all SET A records', () => {
    for (const rec of recs) {
      assert.equal(rec.questionType, 'single_correct');
    }
  });

  await test('Q1 two_statements preserves Statement – I label', () => {
    assert.equal(recs[0].content.statements[0].label, 'Statement – I');
    assert.equal(recs[0].content.statements[1].label, 'Statement – II');
  });

  console.log(`\n${passed} checks passed (no Mongo writes, no import commit)`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
