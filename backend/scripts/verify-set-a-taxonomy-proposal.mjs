/**
 * Phase 5E-1 SET A taxonomy-proposal verification. File-only. No Mongo writes.
 * Run: node scripts/verify-set-a-taxonomy-proposal.mjs
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const PROPOSAL_PATH = path.join(FIXTURE_DIR, 'SET_A_taxonomy_proposal.json');
const REPORT_PATH = path.join(FIXTURE_DIR, 'SET_A_taxonomy_proposal.md');
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
const FORBIDDEN_ID_KEYS = new Set([
  '_id',
  'id',
  'subjectId',
  'topicId',
  'canonicalTopicId',
  'postId',
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

function norm(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function assertName(label, value) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  const trimmed = value.trim();
  assert.ok(trimmed.length >= 2, `${label} empty or too short`);
  assert.ok(trimmed.length <= 100, `${label} exceeds 100 characters`);
  assert.equal(trimmed, value, `${label} must already be trimmed`);
}

function collectKeys(value, acc = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
    return acc;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      acc.push(k);
      collectKeys(v, acc);
    }
  }
  return acc;
}

function loadImportNumbers() {
  const text = fs.readFileSync(IMPORT_PATH, 'utf8').replace(/^\uFEFF/, '');
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => JSON.parse(line).sourceQuestionNumber);
}

function parseMdSubjectTotals(md) {
  const start = md.indexOf('| Subject | Questions | Percentage |');
  assert.ok(start >= 0, 'markdown missing subject distribution table');
  const slice = md.slice(start);
  const rows = [];
  for (const line of slice.split(/\r?\n/).slice(2)) {
    if (!line.startsWith('|')) break;
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    if (cells[0] === 'Subject') continue;
    const n = Number(cells[1]);
    assert.equal(Number.isInteger(n), true, `bad subject count cell: ${line}`);
    rows.push({ subject: cells[0], count: n });
  }
  return rows;
}

function parseMdTopicTotals(md) {
  const start = md.indexOf('| Subject | Topic | Questions |');
  assert.ok(start >= 0, 'markdown missing topic distribution table');
  const slice = md.slice(start);
  const rows = [];
  for (const line of slice.split(/\r?\n/).slice(2)) {
    if (!line.startsWith('|')) break;
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3) continue;
    if (cells[0] === 'Subject') continue;
    const n = Number(cells[2]);
    assert.equal(Number.isInteger(n), true, `bad topic count cell: ${line}`);
    rows.push({ subject: cells[0], topic: cells[1], count: n });
  }
  return rows;
}

function run() {
  test('1. proposal exists', () => {
    assert.equal(fs.existsSync(PROPOSAL_PATH), true, `missing ${PROPOSAL_PATH}`);
    assert.equal(fs.existsSync(REPORT_PATH), true, `missing ${REPORT_PATH}`);
  });

  const proposal = JSON.parse(fs.readFileSync(PROPOSAL_PATH, 'utf8'));
  const mappings = proposal.questionMappings;
  const subjects = proposal.subjects;
  const importNums = new Set(loadImportNumbers());

  test('2. status is PROPOSED_NOT_APPROVED', () => {
    assert.equal(proposal.status, 'PROPOSED_NOT_APPROVED');
    assert.equal(proposal.source, 'SET_A_import_ready.jsonl');
    assert.equal(proposal.totalQuestions, 250);
  });

  test('3. exactly 250 mappings', () => {
    assert.ok(Array.isArray(mappings));
    assert.equal(mappings.length, 250);
  });

  test('4. question numbers are exactly 1–250', () => {
    assert.deepEqual(
      mappings.map((m) => m.questionNumber),
      Array.from({ length: 250 }, (_, i) => i + 1),
    );
  });

  test('5. no duplicate question numbers and each mapping is unique', () => {
    const seen = new Set();
    for (const m of mappings) {
      assert.equal(seen.has(m.questionNumber), false, `duplicate Q${m.questionNumber}`);
      seen.add(m.questionNumber);
      assert.equal(importNums.has(m.questionNumber), true, `Q${m.questionNumber} missing from import-ready`);
    }
    assert.equal(seen.size, 250);
  });

  const subjectByName = new Map();
  test('8. no duplicate subjects and names are valid', () => {
    assert.ok(Array.isArray(subjects));
    assert.ok(subjects.length >= 1);
    const ci = new Set();
    for (const s of subjects) {
      assertName('subject proposedName', s.proposedName);
      const key = norm(s.proposedName);
      assert.equal(ci.has(key), false, `duplicate subject ${s.proposedName}`);
      ci.add(key);
      assert.equal(Number.isInteger(s.proposedOrder), true);
      assert.ok(s.proposedOrder >= 1);
      assert.ok(Array.isArray(s.topics));
      assert.ok(s.topics.length >= 1, `subject ${s.proposedName} has no topics`);
      subjectByName.set(s.proposedName, s);
    }
  });

  test('9. no duplicate topics within a subject', () => {
    for (const s of subjects) {
      const ci = new Set();
      const orders = new Set();
      for (const t of s.topics) {
        assertName(`topic under ${s.proposedName}`, t.proposedName);
        const key = norm(t.proposedName);
        assert.equal(ci.has(key), false, `duplicate topic ${t.proposedName} under ${s.proposedName}`);
        ci.add(key);
        assert.equal(Number.isInteger(t.proposedOrder), true);
        assert.equal(orders.has(t.proposedOrder), false, `duplicate topic order under ${s.proposedName}`);
        orders.add(t.proposedOrder);
      }
    }
  });

  test('6–7. every mapped subject/topic exists in the proposal', () => {
    for (const m of mappings) {
      assert.equal(typeof m.subject, 'string');
      assert.equal(typeof m.topic, 'string');
      const subject = subjectByName.get(m.subject);
      assert.ok(subject, `Q${m.questionNumber} unknown subject ${m.subject}`);
      const topic = subject.topics.find((t) => t.proposedName === m.topic);
      assert.ok(topic, `Q${m.questionNumber} unknown topic ${m.topic} under ${m.subject}`);
    }
  });

  test('10. confidence values are high/medium/low', () => {
    for (const m of mappings) {
      assert.ok(CONF.has(m.confidence), `Q${m.questionNumber} ${m.confidence}`);
    }
  });

  test('11. reasons are present', () => {
    for (const m of mappings) {
      assert.equal(typeof m.reason, 'string', `Q${m.questionNumber} missing reason`);
      assert.ok(m.reason.trim().length >= 20, `Q${m.questionNumber} reason too short`);
    }
  });

  const subjectCounts = new Map();
  const topicCounts = new Map();
  const conf = { high: 0, medium: 0, low: 0 };
  for (const m of mappings) {
    subjectCounts.set(m.subject, (subjectCounts.get(m.subject) || 0) + 1);
    const key = `${m.subject}|||${m.topic}`;
    topicCounts.set(key, (topicCounts.get(key) || 0) + 1);
    conf[m.confidence] += 1;
  }

  test('12. distribution totals equal 250', () => {
    const subjectSum = [...subjectCounts.values()].reduce((a, b) => a + b, 0);
    const topicSum = [...topicCounts.values()].reduce((a, b) => a + b, 0);
    assert.equal(subjectSum, 250);
    assert.equal(topicSum, 250);
    for (const s of subjects) {
      const n = subjectCounts.get(s.proposedName) || 0;
      assert.ok(n >= 1, `subject ${s.proposedName} has zero questions`);
      for (const t of s.topics) {
        const tn = topicCounts.get(`${s.proposedName}|||${t.proposedName}`) || 0;
        assert.ok(tn >= 1, `topic ${s.proposedName} / ${t.proposedName} has zero questions`);
      }
    }

    const md = fs.readFileSync(REPORT_PATH, 'utf8');
    assert.match(md, /Status: PROPOSED — NOT APPROVED/);
    const mdSubjects = parseMdSubjectTotals(md);
    assert.equal(mdSubjects.reduce((n, r) => n + r.count, 0), 250);
    for (const row of mdSubjects) {
      assert.equal(row.count, subjectCounts.get(row.subject), `MD subject total mismatch: ${row.subject}`);
    }
    const mdTopics = parseMdTopicTotals(md);
    assert.equal(mdTopics.reduce((n, r) => n + r.count, 0), 250);
    for (const row of mdTopics) {
      assert.equal(
        row.count,
        topicCounts.get(`${row.subject}|||${row.topic}`),
        `MD topic total mismatch: ${row.subject} / ${row.topic}`,
      );
    }
    const fullStart = md.indexOf('## Full Question Mapping');
    const mediumStart = md.indexOf('## Medium Confidence');
    assert.ok(fullStart >= 0 && mediumStart > fullStart);
    const fullRows = md
      .slice(fullStart, mediumStart)
      .split(/\r?\n/)
      .filter((line) => /^\| \d+ \|/.test(line) && /\| (high|medium|low) \|/.test(line));
    assert.equal(fullRows.length, 250, `full mapping table has ${fullRows.length} rows`);
  });

  test('no MongoDB identifiers in the proposal', () => {
    const keys = collectKeys(proposal);
    for (const key of keys) {
      assert.equal(FORBIDDEN_ID_KEYS.has(key), false, `proposal contains identifier field ${key}`);
    }
    const raw = fs.readFileSync(PROPOSAL_PATH, 'utf8');
    assert.equal(/\bObjectId\b/.test(raw), false);
  });

  test('13. source SET_A_import_ready.jsonl unchanged', () => {
    assert.equal(sha256File(IMPORT_PATH), EXPECTED_IMPORT_SHA256);
  });

  test('14. structured JSONL and answer files unchanged', () => {
    assert.equal(sha256File(JSONL_PATH), EXPECTED_JSONL_SHA256);
    assert.equal(sha256File(ORIGINAL_KEY_PATH), EXPECTED_ORIGINAL_KEY_SHA256);
    assert.equal(sha256File(PROPOSED_KEY_PATH), EXPECTED_PROPOSED_KEY_SHA256);
  });

  const topicCount = subjects.reduce((n, s) => n + s.topics.length, 0);
  const largest = [...subjectCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  console.log('');
  console.log(`Subjects: ${subjects.length}`);
  console.log(`Topics: ${topicCount}`);
  console.log(`Questions mapped: ${mappings.length}`);
  console.log(`High: ${conf.high}`);
  console.log(`Medium: ${conf.medium}`);
  console.log(`Low: ${conf.low}`);
  console.log(`Largest subject: ${largest[0][0]} (${largest[0][1]})`);
  console.log('');
  console.log(`Import-ready SHA-256: ${sha256File(IMPORT_PATH)}`);
  console.log(`JSONL SHA-256: ${sha256File(JSONL_PATH)}`);
  console.log(`Original key SHA-256: ${sha256File(ORIGINAL_KEY_PATH)}`);
  console.log('');
  console.log(`${passed} checks passed (file-only; no MongoDB; no import).`);
}

run();
