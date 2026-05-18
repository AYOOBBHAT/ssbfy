/**
 * Practice reveal scoring verification (run: node scripts/verify-practice-scoring.mjs).
 * Covers multiple-correct, unanswered summary, and idempotent scoring output.
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { scoreQuestionSession } from '../src/utils/questionScoring.js';

const Q1 = new mongoose.Types.ObjectId();
const Q2 = new mongoose.Types.ObjectId();
const Q3 = new mongoose.Types.ObjectId();

function makeQuestion(id, correctAnswers, questionType = 'single_correct') {
  return {
    _id: id,
    questionText: 'Sample',
    options: ['A', 'B', 'C', 'D'],
    correctAnswers,
    correctAnswerIndex: correctAnswers[0] ?? null,
    questionType,
    topicId: new mongoose.Types.ObjectId(),
  };
}

function run() {
  const qSingle = makeQuestion(Q1, [1]);
  const qMulti = makeQuestion(Q2, [0, 2], 'multiple_correct');
  const qUnanswered = makeQuestion(Q3, [3]);

  const questionsById = new Map([
    [Q1.toString(), qSingle],
    [Q2.toString(), qMulti],
    [Q3.toString(), qUnanswered],
  ]);

  const orderedQuestionIds = [Q1, Q2, Q3];

  // multiple_correct: exact match → correct
  const userAnswersExact = new Map([
    [Q1.toString(), [1]],
    [Q2.toString(), [0, 2]],
    [Q3.toString(), []],
  ]);

  const exact = scoreQuestionSession({
    orderedQuestionIds,
    questionsById,
    userAnswersByQid: userAnswersExact,
  });
  assert.equal(exact.summary.correct, 2, 'exact multi: two correct');
  assert.equal(exact.summary.answeredQ, 2, 'exact multi: two answered');
  assert.equal(exact.summary.unanswered, 1, 'exact multi: one unanswered');
  assert.equal(exact.summary.incorrect, 0, 'exact multi: zero incorrect');
  assert.equal(exact.summary.accuracy, 66.67, 'exact multi: accuracy 2/3');

  // multiple_correct: partial selection → incorrect (not [0,2])
  const userAnswersPartial = new Map([
    [Q1.toString(), [1]],
    [Q2.toString(), [0]],
    [Q3.toString(), [3]],
  ]);
  const partial = scoreQuestionSession({
    orderedQuestionIds,
    questionsById,
    userAnswersByQid: userAnswersPartial,
  });
  assert.equal(partial.summary.correct, 2, 'partial multi: Q1+Q3 only');
  assert.equal(partial.summary.incorrect, 1, 'partial multi: Q2 wrong');
  assert.equal(partial.correctAnswers[1].correctAnswers.join(','), '0,2');

  // Idempotency: same inputs → deep-equal summary + correctAnswers length
  const again = scoreQuestionSession({
    orderedQuestionIds,
    questionsById,
    userAnswersByQid: userAnswersExact,
  });
  assert.deepEqual(again.summary, exact.summary, 'idempotent summary');
  assert.equal(again.correctAnswers.length, exact.correctAnswers.length, 'idempotent payload size');

  console.log('verify-practice-scoring: all checks passed');
}

run();
