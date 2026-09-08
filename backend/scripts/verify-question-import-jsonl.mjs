/**
 * Phase 4 structured JSONL/JSON question import.
 * No Mongo writes. Run: node scripts/verify-question-import-jsonl.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { Question } from '../src/models/Question.js';
import { projectPublicQuestion } from '../src/services/questionService.js';
import { scoreQuestionSession } from '../src/utils/questionScoring.js';
import {
  flattenQuestionContentToText,
  PRESENTATION_KINDS,
  prepareQuestionPresentation,
} from '../src/utils/questionPresentation.js';
import { buildResultSnapshotAtSubmit } from '../src/utils/attemptResultSnapshot.js';
import { buildLearningSessionSnapshotV1 } from '../src/utils/learningSessionSnapshot.js';
import { buildBattleQuestionSnapshot } from '../src/utils/battleQuestionSnapshot.js';
import {
  CSV_TEMPLATE,
  detectImportFormat,
  parseCsvBuffer,
  parseImportBuffer,
  parseJsonBuffer,
  parseJsonlBuffer,
  validateJsonRecordShape,
} from '../src/services/questionImportService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, 'fixtures', 'question-import');

let passed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`ok  ${name}`);
    });
}

function expectThrow(fn, re) {
  let err;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'expected an error');
  if (re) assert.match(String(err.message), re);
  return err;
}

function readFixture(name) {
  return fs.readFileSync(path.join(fixtures, name));
}

const subjectId = new mongoose.Types.ObjectId();
const topicId = new mongoose.Types.ObjectId();

function payloadFromParsed(parsed) {
  const primary = parsed.correctIndexes[0];
  const payload = {
    questionText: parsed.questionText,
    options: parsed.options,
    questionType: parsed.questionType,
    questionImage: parsed.questionImage || '',
    correctAnswers: parsed.correctIndexes,
    correctAnswerIndex: primary,
    correctAnswerValue: parsed.options[primary] || '',
    explanation: parsed.explanation || '',
    subjectId,
    topicId,
    postIds: [],
    year: parsed.year,
    difficulty: parsed.difficulty,
    isActive: true,
  };
  if (parsed.presentationKind) {
    payload.presentationKind = parsed.presentationKind;
  }
  if (parsed.content != null) {
    payload.content = parsed.content;
  }
  return payload;
}

function assertCanonicalFlatten(raw, parsed) {
  const prepared = prepareQuestionPresentation({
    presentationKind: raw.presentationKind,
    content: raw.content,
    questionText: raw.questionText,
  });
  assert.equal(parsed.presentationKind, prepared.presentationKind);
  assert.equal(parsed.questionText, prepared.questionText);
  if (prepared.presentationKind !== PRESENTATION_KINDS.PLAIN) {
    assert.equal(
      parsed.questionText,
      flattenQuestionContentToText(prepared.presentationKind, prepared.content)
    );
  }
}

async function assertPersistedShape(parsed, raw) {
  const q = new Question(payloadFromParsed(parsed));
  await q.validate();
  assert.equal(q.presentationKind, parsed.presentationKind);
  assert.equal(q.questionText, parsed.questionText);
  if (parsed.content != null) {
    assert.deepEqual(q.content, parsed.content);
  }

  const pub = projectPublicQuestion(q);
  assert.equal(pub.presentationKind, parsed.presentationKind);
  if (parsed.content != null) {
    assert.deepEqual(pub.content, parsed.content);
  } else {
    assert.equal(pub.content, null);
  }
  assert.ok(!Object.prototype.hasOwnProperty.call(pub, 'correctAnswers'));
  assert.ok(!Object.prototype.hasOwnProperty.call(pub, 'explanation'));
  assert.ok(!Object.prototype.hasOwnProperty.call(pub, 'correctAnswerIndex'));

  const qid = q._id;
  const qMap = new Map([[qid.toString(), q.toObject()]]);
  const answerByQ = new Map([
    [qid.toString(), { selectedOptionIndexes: [...parsed.correctIndexes] }],
  ]);
  const attemptSnap = buildResultSnapshotAtSubmit([qid], qMap, answerByQ, []);
  assert.equal(attemptSnap.items[0].presentationKind, parsed.presentationKind);
  if (parsed.content != null) {
    assert.ok(attemptSnap.items[0].content);
  }

  const learningSnap = buildLearningSessionSnapshotV1({
    sessionType: 'practice',
    orderedQuestionIds: [qid],
    questionsById: qMap,
    userAnswersByQid: new Map([[qid.toString(), [...parsed.correctIndexes]]]),
    correctAnswersPayload: [],
  });
  assert.equal(learningSnap.questions[0].presentationKind, parsed.presentationKind);

  const battleSnap = buildBattleQuestionSnapshot(q);
  assert.equal(battleSnap.presentationKind, parsed.presentationKind);
  return q;
}

async function run() {
  const validBuf = readFixture('valid.jsonl');
  const invalidBuf = readFixture('invalid.jsonl');
  const arrayBuf = readFixture('valid-array.json');
  const objectBuf = readFixture('single-object.json');

  await test('detectImportFormat: jsonl / ndjson / json / csv', () => {
    assert.equal(detectImportFormat(validBuf, 'questions.jsonl'), 'jsonl');
    assert.equal(detectImportFormat(validBuf, 'questions.ndjson'), 'jsonl');
    assert.equal(detectImportFormat(arrayBuf, 'questions.json'), 'json');
    assert.equal(detectImportFormat(Buffer.from(CSV_TEMPLATE.body), 'questions.csv'), 'csv');
    assert.equal(detectImportFormat(Buffer.from(CSV_TEMPLATE.body), 'questions.txt'), 'csv');
  });

  await test('parseImportBuffer routes by filename', () => {
    const jsonl = parseImportBuffer(validBuf, 'set.jsonl');
    assert.equal(jsonl.length, 5);
    assert.equal(jsonl[0].format, 'json');
    const csv = parseImportBuffer(Buffer.from(CSV_TEMPLATE.body), 'template.csv');
    assert.equal(csv[0].raw.questionText, 'What is the capital of J&K?');
    assert.equal(csv[0].raw.optionA, 'Jammu');
    assert.equal(csv[0].raw.optionB, 'Srinagar');
    assert.equal(csv[0].raw.correctAnswer, 'B');
    assert.equal(csv[0].format, undefined);
  });

  await test('A. plain JSONL question', async () => {
    const rows = parseJsonlBuffer(validBuf);
    const { reasons, parsed } = validateJsonRecordShape(rows[0].raw);
    assert.deepEqual(reasons, []);
    assert.equal(parsed.presentationKind, PRESENTATION_KINDS.PLAIN);
    assert.equal(parsed.questionType, 'single_correct');
    assert.deepEqual(parsed.correctIndexes, [1]);
    assert.equal(parsed.year, 2025);
    assert.equal(parsed.explanation.includes('Srinagar'), true);
    assertCanonicalFlatten(rows[0].raw, parsed);
    await assertPersistedShape(parsed, rows[0].raw);
  });

  await test('plain JSONL with omitted presentationKind', () => {
    const { reasons, parsed } = validateJsonRecordShape({
      questionType: 'single_correct',
      questionText: 'Phase4-plain-omitted-kind',
      options: ['A', 'B', 'C', 'D'],
      correctAnswers: [0],
    });
    assert.deepEqual(reasons, []);
    assert.equal(parsed.presentationKind, PRESENTATION_KINDS.PLAIN);
    assert.equal(parsed.questionText, 'Phase4-plain-omitted-kind');
    assert.equal(parsed.content, undefined);
  });

  await test('B. two_statements JSONL', async () => {
    const rows = parseJsonlBuffer(validBuf);
    const raw = rows[1].raw;
    const { reasons, parsed } = validateJsonRecordShape(raw);
    assert.deepEqual(reasons, []);
    assert.equal(parsed.presentationKind, PRESENTATION_KINDS.TWO_STATEMENTS);
    assert.equal(parsed.questionType, 'single_correct');
    assert.equal(parsed.content.statements.length, 2);
    assert.equal(parsed.content.statements[0].label, 'Statement – I');
    assert.equal(parsed.content.statements[1].label, 'Statement – II');
    assert.ok(parsed.questionText.includes('Statement – I'));
    assertCanonicalFlatten(raw, parsed);
    const q = await assertPersistedShape(parsed, raw);
    assert.equal(q.content.statements[0].label, 'Statement – I');
  });

  await test('C. numbered_list preserves n = 1, 2, 4', async () => {
    const rows = parseJsonlBuffer(validBuf);
    const raw = rows[2].raw;
    const { reasons, parsed } = validateJsonRecordShape(raw);
    assert.deepEqual(reasons, []);
    assert.equal(parsed.presentationKind, PRESENTATION_KINDS.NUMBERED_LIST);
    assert.deepEqual(parsed.content.items.map((item) => item.n), [1, 2, 4]);
    assert.match(parsed.questionText, /1\. Wheat/);
    assert.match(parsed.questionText, /2\. Rice/);
    assert.match(parsed.questionText, /4\. Coffee/);
    assert.doesNotMatch(parsed.questionText, /3\. Coffee/);
    assertCanonicalFlatten(raw, parsed);
    const q = await assertPersistedShape(parsed, raw);
    assert.deepEqual(q.content.items.map((item) => item.n), [1, 2, 4]);
  });

  await test('D. table JSONL including empty cell', async () => {
    const rows = parseJsonlBuffer(validBuf);
    const raw = rows[3].raw;
    const { reasons, parsed } = validateJsonRecordShape(raw);
    assert.deepEqual(reasons, []);
    assert.equal(parsed.presentationKind, PRESENTATION_KINDS.TABLE);
    assert.deepEqual(parsed.content.columns, ['Continents', 'Highest Peak']);
    assert.equal(parsed.content.rows.length, 5);
    assert.equal(parsed.content.rows[4][1], '');
    assert.equal(parsed.questionType, 'single_correct');
    assertCanonicalFlatten(raw, parsed);
    await assertPersistedShape(parsed, raw);
  });

  await test('E. multiple_correct + numbered_list does not change answers', async () => {
    const rows = parseJsonlBuffer(validBuf);
    const raw = rows[4].raw;
    const { reasons, parsed } = validateJsonRecordShape(raw);
    assert.deepEqual(reasons, []);
    assert.equal(parsed.presentationKind, PRESENTATION_KINDS.NUMBERED_LIST);
    assert.equal(parsed.questionType, 'multiple_correct');
    assert.deepEqual(parsed.correctIndexes, [0, 1]);
    const q = await assertPersistedShape(parsed, raw);
    const qid = q._id;
    const withPresentation = q.toObject();
    const withoutPresentation = {
      ...withPresentation,
      presentationKind: PRESENTATION_KINDS.PLAIN,
      content: undefined,
      questionText: 'plain stem',
    };
    const answers = new Map([[qid.toString(), [0, 1]]]);
    const a = scoreQuestionSession({
      orderedQuestionIds: [qid],
      questionsById: new Map([[qid.toString(), withoutPresentation]]),
      userAnswersByQid: answers,
    });
    const b = scoreQuestionSession({
      orderedQuestionIds: [qid],
      questionsById: new Map([[qid.toString(), withPresentation]]),
      userAnswersByQid: answers,
    });
    assert.deepEqual(a.summary, b.summary);
    assert.deepEqual(a.correctAnswers[0].correctAnswers, [0, 1]);
    assert.deepEqual(b.correctAnswers[0].correctAnswers, [0, 1]);
  });

  await test('questionType is not derived from presentationKind', () => {
    const two = validateJsonRecordShape(parseJsonlBuffer(validBuf)[1].raw);
    assert.equal(two.parsed.questionType, 'single_correct');
    const multi = validateJsonRecordShape(parseJsonlBuffer(validBuf)[4].raw);
    assert.equal(multi.parsed.questionType, 'multiple_correct');
    const invented = validateJsonRecordShape({
      questionType: 'statement_single_correct',
      presentationKind: 'two_statements',
      content: {
        statements: [
          { label: 'Statement – I', text: 'A' },
          { label: 'Statement – II', text: 'B' },
        ],
      },
      options: ['A', 'B', 'C', 'D'],
      correctAnswers: [0],
    });
    assert.ok(invented.reasons.some((r) => r.includes('questionType must be one of')));
  });

  await test('invalid JSONL reports line number + field/path reason', () => {
    const rows = parseJsonlBuffer(invalidBuf);
    assert.equal(rows.length, 4);

    const line1 = validateJsonRecordShape(rows[0].raw);
    assert.equal(rows[0].line, 1);
    assert.ok(
      line1.reasons.some((r) => /content\.statements must contain exactly 2/.test(r)),
      line1.reasons.join('; ')
    );

    const line2 = validateJsonRecordShape(rows[1].raw);
    assert.equal(rows[1].line, 2);
    assert.ok(
      line2.reasons.some((r) => /rows\[0] must be an array of 3 cells/.test(r)),
      line2.reasons.join('; ')
    );

    const line3 = validateJsonRecordShape(rows[2].raw);
    assert.equal(rows[2].line, 3);
    assert.ok(
      line3.reasons.some((r) =>
        /correctAnswers must contain exactly one index for single_correct/.test(r)
      ),
      line3.reasons.join('; ')
    );

    assert.equal(rows[3].line, 4);
    assert.match(rows[3].parseError || '', /invalid JSON/);
  });

  await test('malformed JSONL line does not abort later records', () => {
    const mixed = Buffer.from(
      'not-json\n' +
        JSON.stringify({
          questionType: 'single_correct',
          questionText: 'Later valid record',
          options: ['A', 'B', 'C', 'D'],
          correctAnswers: [0],
        }) +
        '\n'
    );
    const rows = parseJsonlBuffer(mixed);
    assert.equal(rows.length, 2);
    assert.match(rows[0].parseError || '', /invalid JSON/);
    const { reasons } = validateJsonRecordShape(rows[1].raw);
    assert.deepEqual(reasons, []);
  });

  await test('JSON array and single object are supported', async () => {
    const arr = parseJsonBuffer(arrayBuf);
    assert.equal(arr.length, 2);
    assert.equal(arr[0].line, 1);
    const a = validateJsonRecordShape(arr[0].raw);
    const b = validateJsonRecordShape(arr[1].raw);
    assert.deepEqual(a.reasons, []);
    assert.deepEqual(b.reasons, []);
    assert.equal(b.parsed.presentationKind, PRESENTATION_KINDS.TWO_STATEMENTS);
    await assertPersistedShape(b.parsed, arr[1].raw);

    const one = parseJsonBuffer(objectBuf);
    assert.equal(one.length, 1);
    const o = validateJsonRecordShape(one[0].raw);
    assert.deepEqual(o.reasons, []);
    assert.equal(o.parsed.presentationKind, PRESENTATION_KINDS.PLAIN);
    assert.equal(o.parsed.questionText, 'Phase4-JSON-object: Capital of France?');
  });

  await test('existing CSV importer still parses the same columns', () => {
    const rows = parseCsvBuffer(Buffer.from(CSV_TEMPLATE.body));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].line, 2);
    const raw = rows[0].raw;
    assert.equal(raw.questionText, 'What is the capital of J&K?');
    assert.equal(raw.optionA, 'Jammu');
    assert.equal(raw.optionB, 'Srinagar');
    assert.equal(raw.optionC, 'Leh');
    assert.equal(raw.optionD, 'Anantnag');
    assert.equal(raw.correctAnswer, 'B');
    assert.equal(raw.subject, 'Geography');
    assert.equal(raw.topic, 'States and Capitals');
    assert.equal(raw.difficulty, 'medium');
    assert.equal(raw.explanation.startsWith('Srinagar'), true);
    assert.equal(raw.year, '2024');
    assert.equal(raw.questionType, 'single_correct');
    assert.equal(raw.questionImage, '');
    assert.equal(raw.postIds, '');
    assert.equal(raw.presentationKind, undefined);
    assert.equal(raw.content, undefined);
  });

  await test('empty JSONL aborts at file level like empty CSV', () => {
    expectThrow(() => parseJsonlBuffer(Buffer.from('\n\n')), /no records/);
    expectThrow(() => parseCsvBuffer(Buffer.from('')), /empty/);
  });

  await test('no PDF parsing was added to the JSON/CSV import path', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/questionImportService.js'),
      'utf8'
    );
    assert.doesNotMatch(src, /pdf|PDF|pdf-parse|pdfjs/i);
    assert.notEqual(detectImportFormat(Buffer.from('%PDF-1.7'), 'set-a.pdf'), 'jsonl');
    assert.notEqual(detectImportFormat(Buffer.from('%PDF-1.7'), 'set-a.pdf'), 'json');
  });

  console.log(`\n${passed} checks passed (no Mongo writes)`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
