/**
 * Phase 1 question presentation (plain / two_statements / numbered_list / table).
 * No Mongo writes. Run: node scripts/verify-question-presentation.mjs
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Question } from '../src/models/Question.js';
import { projectPublicQuestion } from '../src/services/questionService.js';
import { scoreQuestionSession } from '../src/utils/questionScoring.js';
import {
  flattenQuestionContentToText,
  PRESENTATION_KINDS,
  prepareQuestionPresentation,
  presentationFieldsFromQuestion,
  canonicalDuplicateStem,
} from '../src/utils/questionPresentation.js';
import { normalizeForDuplicate } from '../src/repositories/questionRepository.js';
import { buildResultSnapshotAtSubmit } from '../src/utils/attemptResultSnapshot.js';
import { buildLearningSessionSnapshotV1 } from '../src/utils/learningSessionSnapshot.js';
import {
  buildBattleQuestionSnapshot,
  questionFromBattleSnapshot,
} from '../src/utils/battleQuestionSnapshot.js';

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

const subjectId = new mongoose.Types.ObjectId();
const topicId = new mongoose.Types.ObjectId();

const twoStatementsContent = {
  intro: 'Consider the following:',
  statements: [
    { label: 'Statement – I', text: 'The sky is blue.' },
    { label: 'Statement – II', text: 'The ocean is deep.' },
  ],
  prompt: 'Which of the above statements is/are correct?',
};

const numberedListContent = {
  intro: 'Consider the following:',
  items: [
    { n: 1, text: 'Wheat' },
    { n: 2, text: 'Rice' },
    { n: 3, text: 'Maize' },
  ],
  prompt: 'How many of the above are cereals?',
};

const tableContent = {
  intro: 'Match the following:',
  columns: ['List I', 'List II'],
  rows: [
    ['A. Delhi', '1. India'],
    ['B. Paris', '2. France'],
  ],
  prompt: 'Select the correct pair.',
};

async function run() {
  await test('A. existing plain question remains valid', async () => {
    const q = new Question({
      questionText: 'What is 2 + 2?',
      options: ['3', '4', '5', '6'],
      correctAnswers: [1],
      subjectId,
      topicId,
    });
    await q.validate();
    assert.equal(q.presentationKind, PRESENTATION_KINDS.PLAIN);
    assert.equal(q.content, undefined);
    assert.equal(q.questionText, 'What is 2 + 2?');
    const prepared = prepareQuestionPresentation({
      questionText: 'What is 2 + 2?',
    });
    assert.equal(prepared.presentationKind, PRESENTATION_KINDS.PLAIN);
    assert.equal(prepared.content, undefined);
    assert.equal(prepared.questionText, 'What is 2 + 2?');
  });

  await test('B. existing question without presentationKind behaves as plain', () => {
    const legacy = {
      _id: new mongoose.Types.ObjectId(),
      questionText: 'Legacy stem',
      options: ['A', 'B', 'C', 'D'],
      questionType: 'single_correct',
      correctAnswers: [0],
      correctAnswerIndex: 0,
      explanation: 'secret',
    };
    assert.deepEqual(presentationFieldsFromQuestion(legacy), {
      presentationKind: PRESENTATION_KINDS.PLAIN,
      content: null,
    });
    const pub = projectPublicQuestion(legacy);
    assert.equal(pub.presentationKind, PRESENTATION_KINDS.PLAIN);
    assert.equal(pub.content, null);
    assert.equal(pub.questionText, 'Legacy stem');
  });

  await test('C. two_statements content validates', () => {
    const prepared = prepareQuestionPresentation({
      presentationKind: PRESENTATION_KINDS.TWO_STATEMENTS,
      content: twoStatementsContent,
      questionText: 'client should be ignored',
    });
    assert.equal(prepared.presentationKind, PRESENTATION_KINDS.TWO_STATEMENTS);
    assert.equal(prepared.content.statements.length, 2);
    assert.equal(prepared.content.statements[0].label, 'Statement – I');
    expectThrow(
      () =>
        prepareQuestionPresentation({
          presentationKind: PRESENTATION_KINDS.TWO_STATEMENTS,
          content: { statements: [{ label: 'Statement – I', text: 'only one' }] },
        }),
      /exactly 2/
    );
  });

  await test('D. numbered_list content validates', () => {
    const prepared = prepareQuestionPresentation({
      presentationKind: PRESENTATION_KINDS.NUMBERED_LIST,
      content: numberedListContent,
    });
    assert.equal(prepared.content.items.length, 3);
    assert.equal(prepared.content.items[0].n, 1);
    expectThrow(
      () =>
        prepareQuestionPresentation({
          presentationKind: PRESENTATION_KINDS.NUMBERED_LIST,
          content: { items: [{ n: 1, text: 'only one' }] },
        }),
      /2–20/
    );
  });

  await test('E. table content validates', () => {
    const prepared = prepareQuestionPresentation({
      presentationKind: PRESENTATION_KINDS.TABLE,
      content: tableContent,
    });
    assert.deepEqual(prepared.content.columns, ['List I', 'List II']);
    assert.equal(prepared.content.rows.length, 2);
    expectThrow(
      () =>
        prepareQuestionPresentation({
          presentationKind: PRESENTATION_KINDS.TABLE,
          content: {
            columns: ['A', 'B'],
            rows: [['only-one-cell']],
          },
        }),
      /array of 2 cells/
    );
  });

  await test('F. structured content generates flattened questionText', () => {
    const two = prepareQuestionPresentation({
      presentationKind: PRESENTATION_KINDS.TWO_STATEMENTS,
      content: twoStatementsContent,
      questionText: 'ignored client text',
    });
    assert.match(two.questionText, /Consider the following:/);
    assert.match(two.questionText, /Statement – I: The sky is blue\./);
    assert.match(two.questionText, /Statement – II: The ocean is deep\./);
    assert.match(two.questionText, /Which of the above statements is\/are correct\?/);
    assert.equal(
      two.questionText,
      flattenQuestionContentToText(PRESENTATION_KINDS.TWO_STATEMENTS, two.content)
    );

    const list = prepareQuestionPresentation({
      presentationKind: PRESENTATION_KINDS.NUMBERED_LIST,
      content: numberedListContent,
    });
    assert.match(list.questionText, /1\. Wheat/);
    assert.match(list.questionText, /2\. Rice/);
    assert.match(list.questionText, /How many of the above are cereals\?/);

    const table = prepareQuestionPresentation({
      presentationKind: PRESENTATION_KINDS.TABLE,
      content: tableContent,
    });
    assert.match(table.questionText, /List I \| List II/);
    assert.match(table.questionText, /A\. Delhi \| 1\. India/);
    assert.match(table.questionText, /Select the correct pair\./);

    expectThrow(
      () =>
        prepareQuestionPresentation({
          presentationKind: PRESENTATION_KINDS.PLAIN,
          content: twoStatementsContent,
          questionText: 'nope',
        }),
      /content is only allowed/
    );
  });

  await test('G. public projection contains presentationKind/content but no answers', () => {
    const qid = new mongoose.Types.ObjectId();
    const q = {
      _id: qid,
      questionText: 'flattened',
      options: ['A', 'B', 'C', 'D'],
      questionType: 'single_correct',
      presentationKind: PRESENTATION_KINDS.TWO_STATEMENTS,
      content: twoStatementsContent,
      correctAnswers: [1, 2],
      correctAnswerIndex: 1,
      correctAnswerValue: 'B',
      explanation: 'because',
      subjectId,
      topicId,
      difficulty: 'medium',
      year: 2024,
    };
    const pub = projectPublicQuestion(q);
    assert.equal(pub.presentationKind, PRESENTATION_KINDS.TWO_STATEMENTS);
    assert.equal(pub.content.statements[0].label, 'Statement – I');
    assert.equal(pub.questionText, 'flattened');
    assert.deepEqual(pub.options, ['A', 'B', 'C', 'D']);
    assert.equal(pub.questionType, 'single_correct');
    assert.equal('correctAnswers' in pub, false);
    assert.equal('correctAnswerIndex' in pub, false);
    assert.equal('correctAnswerValue' in pub, false);
    assert.equal('explanation' in pub, false);
  });

  await test('H. snapshots preserve presentationKind/content', () => {
    const qid = new mongoose.Types.ObjectId();
    const q = {
      _id: qid,
      questionText: 'flattened stem',
      options: ['A', 'B', 'C', 'D'],
      questionType: 'single_correct',
      presentationKind: PRESENTATION_KINDS.TWO_STATEMENTS,
      content: twoStatementsContent,
      correctAnswers: [2],
      correctAnswerIndex: 2,
      explanation: 'hidden from public, kept in snapshot',
      topicId,
      subjectId,
      postIds: [],
      questionImage: '',
      difficulty: 'medium',
      year: 2020,
    };
    const qMap = new Map([[qid.toString(), q]]);
    const answerByQ = new Map([
      [qid.toString(), { selectedOptionIndexes: [2] }],
    ]);

    const attemptSnap = buildResultSnapshotAtSubmit([qid], qMap, answerByQ, []);
    assert.equal(attemptSnap.items[0].presentationKind, PRESENTATION_KINDS.TWO_STATEMENTS);
    assert.equal(attemptSnap.items[0].content.statements[1].label, 'Statement – II');
    assert.equal(attemptSnap.items[0].questionText, 'flattened stem');

    const learningSnap = buildLearningSessionSnapshotV1({
      sessionType: 'practice',
      orderedQuestionIds: [qid],
      questionsById: qMap,
      userAnswersByQid: new Map([[qid.toString(), [2]]]),
      correctAnswersPayload: [],
    });
    assert.equal(learningSnap.questions[0].presentationKind, PRESENTATION_KINDS.TWO_STATEMENTS);
    assert.equal(learningSnap.questions[0].content.intro, 'Consider the following:');

    const battleSnap = buildBattleQuestionSnapshot(q);
    assert.equal(battleSnap.presentationKind, PRESENTATION_KINDS.TWO_STATEMENTS);
    assert.deepEqual(battleSnap.content.statements[0].label, 'Statement – I');

    const restored = questionFromBattleSnapshot({
      questionId: qid,
      questionText: 'old battle',
      options: ['A', 'B'],
      correctAnswers: [0],
    });
    assert.equal(restored.presentationKind, PRESENTATION_KINDS.PLAIN);
    assert.equal(restored.content, null);
  });

  await test('I. scoring behavior remains unchanged', () => {
    const qid = new mongoose.Types.ObjectId();
    const base = {
      _id: qid,
      questionText: 'Sample',
      options: ['A', 'B', 'C', 'D'],
      correctAnswers: [0, 2],
      correctAnswerIndex: 0,
      questionType: 'multiple_correct',
      topicId,
    };
    const withPresentation = {
      ...base,
      presentationKind: PRESENTATION_KINDS.TABLE,
      content: tableContent,
    };
    const ids = [qid];
    const answers = new Map([[qid.toString(), [0, 2]]]);
    const a = scoreQuestionSession({
      orderedQuestionIds: ids,
      questionsById: new Map([[qid.toString(), base]]),
      userAnswersByQid: answers,
    });
    const b = scoreQuestionSession({
      orderedQuestionIds: ids,
      questionsById: new Map([[qid.toString(), withPresentation]]),
      userAnswersByQid: answers,
    });
    assert.deepEqual(a.summary, b.summary);
    assert.deepEqual(a.correctAnswers[0].correctAnswers, [0, 2]);
    assert.deepEqual(b.correctAnswers[0].correctAnswers, [0, 2]);

    const wrong = scoreQuestionSession({
      orderedQuestionIds: ids,
      questionsById: new Map([[qid.toString(), withPresentation]]),
      userAnswersByQid: new Map([[qid.toString(), [0]]]),
    });
    assert.equal(wrong.summary.correct, 0);
    assert.equal(wrong.summary.incorrect, 1);
  });

  await test('structured mongoose document generates questionText on validate', async () => {
    const q = new Question({
      questionText: 'client stale text',
      presentationKind: PRESENTATION_KINDS.TWO_STATEMENTS,
      content: twoStatementsContent,
      options: ['A', 'B', 'C', 'D'],
      correctAnswers: [0],
      subjectId,
      topicId,
    });
    await q.validate();
    assert.match(q.questionText, /Statement – I: The sky is blue\./);
    assert.notEqual(q.questionText, 'client stale text');
  });

  await test('J. canonical duplicate stem matches stored flatten for structured kinds', () => {
    const twoA = canonicalDuplicateStem({
      presentationKind: PRESENTATION_KINDS.TWO_STATEMENTS,
      content: twoStatementsContent,
    });
    const twoB = canonicalDuplicateStem({
      presentationKind: PRESENTATION_KINDS.TWO_STATEMENTS,
      content: {
        ...twoStatementsContent,
        intro: '  Consider the following:  ',
      },
    });
    const twoDifferent = canonicalDuplicateStem({
      presentationKind: PRESENTATION_KINDS.TWO_STATEMENTS,
      content: {
        ...twoStatementsContent,
        statements: [
          { label: 'Statement – I', text: 'Other' },
          { label: 'Statement – II', text: 'Beta' },
        ],
      },
    });
    const prepared = prepareQuestionPresentation({
      presentationKind: PRESENTATION_KINDS.TWO_STATEMENTS,
      content: twoStatementsContent,
    });
    assert.equal(twoA, prepared.questionText);
    assert.equal(normalizeForDuplicate(twoA), normalizeForDuplicate(twoB));
    assert.notEqual(normalizeForDuplicate(twoA), normalizeForDuplicate(twoDifferent));

    const listA = canonicalDuplicateStem({
      presentationKind: PRESENTATION_KINDS.NUMBERED_LIST,
      content: numberedListContent,
    });
    const listB = canonicalDuplicateStem({
      presentationKind: PRESENTATION_KINDS.NUMBERED_LIST,
      content: numberedListContent,
    });
    const listDifferent = canonicalDuplicateStem({
      presentationKind: PRESENTATION_KINDS.NUMBERED_LIST,
      content: {
        ...numberedListContent,
        prompt: 'Different prompt',
      },
    });
    assert.equal(normalizeForDuplicate(listA), normalizeForDuplicate(listB));
    assert.notEqual(normalizeForDuplicate(listA), normalizeForDuplicate(listDifferent));

    const tableA = canonicalDuplicateStem({
      presentationKind: PRESENTATION_KINDS.TABLE,
      content: tableContent,
    });
    const tableDifferent = canonicalDuplicateStem({
      presentationKind: PRESENTATION_KINDS.TABLE,
      content: {
        ...tableContent,
        rows: [
          ['A. Delhi', '1. India'],
          ['B. Tokyo', '2. Japan'],
        ],
      },
    });
    assert.notEqual(normalizeForDuplicate(tableA), normalizeForDuplicate(tableDifferent));

    const plain = canonicalDuplicateStem({
      presentationKind: PRESENTATION_KINDS.PLAIN,
      questionText: '  What is 2 + 2?  ',
    });
    assert.equal(plain, 'What is 2 + 2?');

    const missingKind = canonicalDuplicateStem({ questionText: 'Legacy stem' });
    assert.equal(missingKind, 'Legacy stem');

    const incomplete = canonicalDuplicateStem({
      presentationKind: PRESENTATION_KINDS.NUMBERED_LIST,
      content: { items: [{ n: 1, text: 'only one' }] },
    });
    assert.equal(incomplete, '');
  });

  console.log(`verify-question-presentation: ${passed} checks passed`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
