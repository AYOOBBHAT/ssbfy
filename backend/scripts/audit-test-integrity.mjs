#!/usr/bin/env node
/**
 * Audit Test + TestAttempt integrity.
 * Usage: node scripts/audit-test-integrity.mjs [--verbose]
 */
import { Test } from '../src/models/Test.js';
import { Question } from '../src/models/Question.js';
import { TestAttempt } from '../src/models/TestAttempt.js';
import { TEST_TYPE_VALUES } from '../src/constants/testType.js';
import { openDb, closeDb } from './lib/db.mjs';
import { createReporter, parseArgs } from './lib/reporter.mjs';

const MAX_REASONABLE_SECONDS = 7 * 24 * 3600;

function hasDupIds(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return false;
  const s = new Set();
  for (const x of arr) {
    const k = String(x);
    if (s.has(k)) return true;
    s.add(k);
  }
  return false;
}

function answerLooksMalformed(entry) {
  if (!entry || entry.questionId == null) return true;
  const arr = entry.selectedOptionIndexes;
  if (arr != null && !Array.isArray(arr)) return true;
  if (Array.isArray(arr)) {
    for (const v of arr) {
      if (!Number.isInteger(v) || v < 0) return true;
    }
  }
  return false;
}

async function main() {
  const { verbose } = parseArgs();
  const r = createReporter();
  await openDb();

  const questionIdsValid = new Set(
    (await Question.find({}, { _id: 1, isActive: 1 }).lean()).map((q) => String(q._id))
  );
  const qActive = new Map(
    (await Question.find({}, { _id: 1, isActive: 1 }).lean()).map((q) => [
      String(q._id),
      q.isActive !== false,
    ])
  );

  const tests = await Test.find({}).lean();
  const testIds = new Set(tests.map((t) => String(t._id)));

  const c = {
    badTestType: 0,
    dupQuestionIdsInTest: 0,
    missingQuestionRef: 0,
    inactiveQuestionInTest: 0,
    attemptMissingTest: 0,
    attemptMalformedAnswer: 0,
    submittedMissingScore: 0,
    submittedBadTiming: 0,
    answerCountMismatch: 0,
  };

  for (const t of tests) {
    const id = String(t._id);
    if (!TEST_TYPE_VALUES.includes(t.type)) {
      c.badTestType += 1;
      r.error(`Test ${id} invalid type=${t.type}`);
    }
    if (!Array.isArray(t.questionIds)) {
      r.warn(`Test ${id} questionIds not array`);
    } else {
      if (hasDupIds(t.questionIds)) {
        c.dupQuestionIdsInTest += 1;
        r.fixable(`Test ${id} has duplicate questionIds entries`);
      }
      for (const qid of t.questionIds) {
        const qs = String(qid);
        if (!questionIdsValid.has(qs)) {
          c.missingQuestionRef += 1;
          r.error(`Test ${id} references missing Question ${qs}`);
        } else if (qActive.get(qs) === false) {
          c.inactiveQuestionInTest += 1;
          r.warn(`Test ${id} includes inactive Question ${qs}`);
        }
      }
    }
  }

  const attempts = await TestAttempt.find({}).lean();
  for (const a of attempts) {
    const aid = String(a._id);
    const tid = a.testId ? String(a.testId) : null;
    if (tid && !testIds.has(tid)) {
      c.attemptMissingTest += 1;
      r.error(`Attempt ${aid} references missing Test ${tid}`);
    }

    const submitted = a.endTime != null;
    if (submitted) {
      if (a.score == null || a.accuracy == null) {
        c.submittedMissingScore += 1;
        r.warn(`Attempt ${aid} submitted but missing score/accuracy`);
      }
      const st = a.startTime ? new Date(a.startTime).getTime() : NaN;
      const en = a.endTime ? new Date(a.endTime).getTime() : NaN;
      if (!Number.isFinite(st) || !Number.isFinite(en) || en < st) {
        c.submittedBadTiming += 1;
        r.error(`Attempt ${aid} invalid start/end timestamps`);
      }
      const tt = Number(a.timeTaken);
      if (!Number.isFinite(tt) || tt < 0 || tt > MAX_REASONABLE_SECONDS) {
        c.submittedBadTiming += 1;
        r.warn(`Attempt ${aid} suspicious timeTaken=${a.timeTaken}`);
      }
    }

    if (Array.isArray(a.answers)) {
      for (const row of a.answers) {
        if (answerLooksMalformed(row)) {
          c.attemptMalformedAnswer += 1;
          r.warn(`Attempt ${aid} malformed answer row`);
          break;
        }
      }
    }

    if (Array.isArray(a.questionIds) && Array.isArray(a.answers)) {
      const allowed = new Set(a.questionIds.map((x) => String(x)));
      const seen = new Set();
      for (const row of a.answers) {
        if (row?.questionId) seen.add(String(row.questionId));
      }
      if (seen.size !== a.answers.length) {
        c.attemptMalformedAnswer += 1;
        r.warn(`Attempt ${aid} duplicate questionId in answers`);
      }
      for (const row of a.answers) {
        const qid = row?.questionId ? String(row.questionId) : '';
        if (qid && !allowed.has(qid)) {
          c.attemptMalformedAnswer += 1;
          r.warn(`Attempt ${aid} answer for questionId not in attempt.questionIds`);
          break;
        }
      }
      if (a.answers.length !== a.questionIds.length && submitted) {
        c.answerCountMismatch += 1;
        r.warn(
          `Attempt ${aid} submitted with answers.length=${a.answers.length} vs questionIds.length=${a.questionIds.length}`
        );
      }
    }

    if (verbose && !submitted && a.startTime) {
      r.info(`open attempt ${aid} test=${tid}`);
    }
  }

  r.summary([
    `tests: ${tests.length}`,
    `attempts: ${attempts.length}`,
    ...Object.entries(c).map(([k, v]) => `${k}: ${v}`),
  ]);

  await closeDb();
  process.exit(r.exitCode());
}

main().catch((e) => {
  console.error('[ERROR]', e);
  process.exit(2);
});
