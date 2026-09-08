/**
 * Phase 5D SET A metadata-mapping verification. File-only. No Mongo writes.
 * Run: node scripts/verify-set-a-metadata-mapping.mjs
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const MAPPING_PATH = path.join(FIXTURE_DIR, 'SET_A_metadata_mapping_proposed.json');
const IMPORT_PATH = path.join(FIXTURE_DIR, 'SET_A_import_ready.jsonl');
const JSONL_PATH = path.join(FIXTURE_DIR, 'SET_A_structured.jsonl');
const ORIGINAL_KEY_PATH = path.join(FIXTURE_DIR, 'SET_A_answer_key.json');
const PROPOSED_KEY_PATH = path.join(FIXTURE_DIR, 'SET_A_final_answer_key_proposed.json');

const EXPECTED_IMPORT_SHA256 =
  '7aad2b3b0a772c1807dce9c326d599e204a99293fae2cd10e1248e4b4db03f40';
const EXPECTED_JSONL_SHA256 =
  '8025d729630c783c6c3b0d3ae33e3fc3322faa34356c8a9b263e94b8926e0fb4';
const EXPECTED_ORIGINAL_KEY_SHA256 =
  '07f77efbc334ca63e8c13b44c36adcf45c12fa86f7f839cf87351d4ee206b259';
const EXPECTED_PROPOSED_KEY_SHA256 =
  '1ba869a795b0bd6bd2c3b14c0d313f7166a1a645d1a4fb7f3c31336e44bfb4d8';
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

function loadImportNumbers() {
  const text = fs.readFileSync(IMPORT_PATH, 'utf8').replace(/^\uFEFF/, '');
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => JSON.parse(line).sourceQuestionNumber);
}

function run() {
  test('A. mapping file exists', () => {
    assert.equal(fs.existsSync(MAPPING_PATH), true, `missing ${MAPPING_PATH}`);
  });

  const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
  const rows = mapping.mappings;
  const inspectedSubjects = new Set(
    (mapping.taxonomyInspection?.inspectedSubjects || []).map((s) =>
      String(s.name || s).toLowerCase(),
    ),
  );
  const inspectedTopics = new Set(
    (mapping.taxonomyInspection?.inspectedTopics || []).map((t) =>
      String(t.name || t).toLowerCase(),
    ),
  );
  const importNums = new Set(loadImportNumbers());

  test('B. exactly 250 question mappings', () => {
    assert.equal(mapping.totalQuestions, 250);
    assert.ok(Array.isArray(rows));
    assert.equal(rows.length, 250);
  });

  test('C. question numbers are exactly 1–250', () => {
    assert.deepEqual(
      rows.map((r) => r.questionNumber),
      Array.from({ length: 250 }, (_, i) => i + 1),
    );
  });

  test('D. no duplicate question numbers', () => {
    const seen = new Set();
    for (const r of rows) {
      assert.equal(seen.has(r.questionNumber), false, `duplicate Q${r.questionNumber}`);
      seen.add(r.questionNumber);
    }
  });

  test('E. every mapped question exists in SET_A_import_ready.jsonl', () => {
    assert.equal(importNums.size, 250);
    for (const r of rows) {
      assert.equal(importNums.has(r.questionNumber), true, `Q${r.questionNumber} missing from import-ready`);
    }
  });

  test('F. subject identifiers/names are from the inspected existing taxonomy', () => {
    for (const r of rows) {
      if (r.subject == null) continue;
      assert.equal(
        inspectedSubjects.has(String(r.subject).toLowerCase()),
        true,
        `Q${r.questionNumber} invented subject ${r.subject}`,
      );
    }
  });

  test('G. topic identifiers/names are from the inspected existing taxonomy', () => {
    for (const r of rows) {
      if (r.topic == null) continue;
      assert.equal(
        inspectedTopics.has(String(r.topic).toLowerCase()),
        true,
        `Q${r.questionNumber} invented topic ${r.topic}`,
      );
    }
  });

  test('H. no invented subject/topic identifiers', () => {
    const fixtureBan = new Set(
      (mapping.taxonomyInspection?.nonAuthoritativeFixtureNames?.examples || []).flatMap((ex) => [
        String(ex.subject).toLowerCase(),
        String(ex.topic).toLowerCase(),
      ]),
    );
    for (const r of rows) {
      if (r.subject != null && fixtureBan.has(String(r.subject).toLowerCase())) {
        assert.ok(
          inspectedSubjects.has(String(r.subject).toLowerCase()),
          `Q${r.questionNumber} used fixture-only subject ${r.subject}`,
        );
      }
      if (r.topic != null && fixtureBan.has(String(r.topic).toLowerCase())) {
        assert.ok(
          inspectedTopics.has(String(r.topic).toLowerCase()),
          `Q${r.questionNumber} used fixture-only topic ${r.topic}`,
        );
      }
      if (r.subject == null || r.topic == null) {
        assert.equal(r.confidence, 'low', `Q${r.questionNumber} unmapped without low confidence`);
      }
    }
  });

  test('I. confidence is high/medium/low', () => {
    for (const r of rows) {
      assert.ok(CONF.has(r.confidence), `Q${r.questionNumber} ${r.confidence}`);
    }
  });

  test('J. low-confidence records have a reason', () => {
    for (const r of rows) {
      if (r.confidence !== 'low') continue;
      assert.equal(typeof r.reason, 'string');
      assert.ok(r.reason.trim().length >= 20, `Q${r.questionNumber} reason too short`);
    }
  });

  test('K. original SET_A_import_ready.jsonl is unchanged', () => {
    assert.equal(sha256File(IMPORT_PATH), EXPECTED_IMPORT_SHA256);
  });

  test('L. original SET_A_structured.jsonl is unchanged', () => {
    assert.equal(sha256File(JSONL_PATH), EXPECTED_JSONL_SHA256);
  });

  test('M. answer key files remain unchanged', () => {
    assert.equal(sha256File(ORIGINAL_KEY_PATH), EXPECTED_ORIGINAL_KEY_SHA256);
    assert.equal(sha256File(PROPOSED_KEY_PATH), EXPECTED_PROPOSED_KEY_SHA256);
  });

  test('N. no MongoDB writes occurred', () => {
    assert.equal(mapping.safety?.mongoWrites, false);
    assert.equal(mapping.safety?.importDryRun, false);
    assert.equal(mapping.safety?.importCommit, false);
    assert.equal(mapping.taxonomyInspection?.liveDatabase, 'blocked');
  });

  const mapped = rows.filter((r) => r.subject != null && r.topic != null).length;
  const unmapped = 250 - mapped;
  const conf = { high: 0, medium: 0, low: 0 };
  for (const r of rows) conf[r.confidence] += 1;

  console.log('');
  console.log(`Mapped: ${mapped}`);
  console.log(`Unmapped: ${unmapped}`);
  console.log(`High: ${conf.high}`);
  console.log(`Medium: ${conf.medium}`);
  console.log(`Low: ${conf.low}`);
  console.log(`Inspected subjects: ${inspectedSubjects.size}`);
  console.log(`Inspected topics: ${inspectedTopics.size}`);
  console.log('');
  console.log(`Import-ready SHA-256: ${sha256File(IMPORT_PATH)}`);
  console.log(`JSONL SHA-256: ${sha256File(JSONL_PATH)}`);
  console.log(`Original key SHA-256: ${sha256File(ORIGINAL_KEY_PATH)}`);
  console.log('');
  console.log(`${passed} checks passed (file-only; no MongoDB; no import).`);
}

run();
