#!/usr/bin/env node
/**
 * Audit Question docs: refs, hierarchy, postIds, options, answers, soft-delete alignment.
 * Usage: node scripts/audit-question-integrity.mjs [--verbose]
 */
import { Question, QUESTION_TYPE_VALUES } from '../src/models/Question.js';
import { Subject } from '../src/models/Subject.js';
import { Topic } from '../src/models/Topic.js';
import { Post } from '../src/models/Post.js';
import { openDb, closeDb } from './lib/db.mjs';
import { createReporter, parseArgs } from './lib/reporter.mjs';

function hasDupPostIds(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return false;
  const s = new Set();
  for (const x of arr) {
    const k = String(x);
    if (s.has(k)) return true;
    s.add(k);
  }
  return false;
}

function indexSetValid(correctAnswers, optionsLen) {
  if (!Array.isArray(correctAnswers)) return false;
  for (const i of correctAnswers) {
    if (!Number.isInteger(i) || i < 0 || i >= optionsLen) return false;
  }
  return true;
}

async function main() {
  const { verbose } = parseArgs();
  const r = createReporter();
  await openDb();

  const subjectMap = new Map(
    (await Subject.find({}).lean()).map((s) => [String(s._id), s])
  );
  const topicMap = new Map(
    (await Topic.find({}).lean()).map((t) => [String(t._id), t])
  );
  const postMap = new Map((await Post.find({}).lean()).map((p) => [String(p._id), p]));

  let cursor = Question.find({}).cursor();
  let n = 0;
  const counts = {
    missingSubject: 0,
    missingTopic: 0,
    missingPostIds: 0,
    badSubjectRef: 0,
    badTopicRef: 0,
    badPostRef: 0,
    hierarchyMismatch: 0,
    dupPostIds: 0,
    badOptions: 0,
    badQuestionText: 0,
    badCorrectAnswers: 0,
    invalidQuestionType: 0,
    inactiveSubject: 0,
    inactiveTopic: 0,
    inactivePostInList: 0,
    inactiveQuestion: 0,
  };

  for await (const q of cursor) {
    n += 1;
    const id = String(q._id);
    if (!q.subjectId) {
      counts.missingSubject += 1;
      r.error(`Question ${id} missing subjectId`);
    }
    if (!q.topicId) {
      counts.missingTopic += 1;
      r.error(`Question ${id} missing topicId`);
    }
    if (!Array.isArray(q.postIds)) {
      counts.missingPostIds += 1;
      r.warn(`Question ${id} postIds not an array`);
    } else if (q.postIds.length === 0) {
      counts.missingPostIds += 1;
      r.warn(`Question ${id} has empty postIds`);
    }

    const sid = q.subjectId ? String(q.subjectId) : null;
    const tid = q.topicId ? String(q.topicId) : null;
    const sub = sid ? subjectMap.get(sid) : null;
    const top = tid ? topicMap.get(tid) : null;

    if (sid && !sub) {
      counts.badSubjectRef += 1;
      r.error(`Question ${id} references missing Subject ${sid}`);
    }
    if (tid && !top) {
      counts.badTopicRef += 1;
      r.error(`Question ${id} references missing Topic ${tid}`);
    }

    if (sub && top && String(top.subjectId) !== sid) {
      counts.hierarchyMismatch += 1;
      r.error(
        `Question ${id} subjectId ${sid} does not match Topic.subjectId ${String(top.subjectId)}`
      );
    }

    if (Array.isArray(q.postIds)) {
      if (hasDupPostIds(q.postIds)) {
        counts.dupPostIds += 1;
        r.fixable(`Question ${id} has duplicate entries in postIds`);
      }
      for (const pid of q.postIds) {
        const ps = String(pid);
        if (!postMap.has(ps)) {
          counts.badPostRef += 1;
          r.error(`Question ${id} references missing Post ${ps}`);
        } else if (postMap.get(ps).isActive === false) {
          counts.inactivePostInList += 1;
          r.warn(`Question ${id} references inactive Post ${ps}`);
        }
      }
    }

    const opts = q.options;
    if (!Array.isArray(opts) || opts.length < 2) {
      counts.badOptions += 1;
      r.error(`Question ${id} options invalid or < 2 entries`);
    }

    if (!q.questionText || String(q.questionText).trim() === '') {
      counts.badQuestionText += 1;
      r.error(`Question ${id} missing or empty questionText`);
    }

    const optLen = Array.isArray(opts) ? opts.length : 0;
    if (optLen > 0 && !indexSetValid(q.correctAnswers ?? [], optLen)) {
      counts.badCorrectAnswers += 1;
      r.warn(`Question ${id} correctAnswers indexes out of range or invalid`);
    }

    if (q.questionType && !QUESTION_TYPE_VALUES.includes(q.questionType)) {
      counts.invalidQuestionType += 1;
      r.error(`Question ${id} invalid questionType=${q.questionType}`);
    }

    if (sub && sub.isActive === false) {
      counts.inactiveSubject += 1;
      r.warn(`Question ${id} under inactive Subject ${sid}`);
    }
    if (top && top.isActive === false) {
      counts.inactiveTopic += 1;
      r.warn(`Question ${id} under inactive Topic ${tid}`);
    }
    if (q.isActive === false) {
      counts.inactiveQuestion += 1;
      if (verbose) r.info(`Question ${id} is inactive (informational)`);
    }
  }

  r.summary([
    `questions scanned: ${n}`,
    ...Object.entries(counts).map(([k, v]) => `${k}: ${v}`),
  ]);

  await closeDb();
  process.exit(r.exitCode());
}

main().catch((e) => {
  console.error('[ERROR]', e);
  process.exit(2);
});
