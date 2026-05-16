#!/usr/bin/env node
/**
 * MongoDB index audit for SSBFY.
 *
 * Compares live collection indexes against the registry below (derived from
 * Mongoose schema.index() definitions). Partial/collation/uniqueness options
 * are checked loosely — use Atlas UI for full partialFilterExpression review.
 *
 * Usage:
 *   npm run audit:indexes
 *   node scripts/audit-indexes.mjs --verbose
 *   node scripts/audit-indexes.mjs --explain   # requires MONGO_URI + sample userId in env
 *
 * Critical hot paths (verify with explain in staging):
 *   - testAttemptRepository.aggregateProfileStats → idx_attempt_user_completed_recent
 *   - testAttemptRepository.findRecentCompletedByUser → idx_attempt_user_completed_recent
 *   - userRepository.findLeaderboard → idx_leaderboard_streak
 *   - questionRepository.findRandomByTopics → idx_question_topic_active
 *   - resultRepository.findByUser → idx_result_user_recent
 */
import mongoose from 'mongoose';
import { Topic } from '../src/models/Topic.js';
import { Question } from '../src/models/Question.js';
import { User } from '../src/models/User.js';
import { Test } from '../src/models/Test.js';
import { TestAttempt } from '../src/models/TestAttempt.js';
import { Result } from '../src/models/Result.js';
import { Note } from '../src/models/Note.js';
import { Subject } from '../src/models/Subject.js';
import { openDb, closeDb } from './lib/db.mjs';
import { createReporter, parseArgs } from './lib/reporter.mjs';

/** @type {Record<string, { name: string, key: Record<string, number>, optional?: boolean }[]>} */
const EXPECTED_BY_COLLECTION = {
  topics: [
    { name: 'uniq_subjectId_name_ci', key: { subjectId: 1, name: 1 } },
  ],
  subjects: [
    { name: 'uniq_subject_name_ci_global', key: { name: 1 } },
    { name: 'idx_subject_post_name', key: { postId: 1, name: 1 }, optional: true },
  ],
  questions: [
    { name: 'idx_question_subject', key: { subjectId: 1 } },
    { name: 'idx_question_topic', key: { topicId: 1 } },
    { name: 'idx_question_topic_active', key: { topicId: 1, isActive: 1 } },
    { name: 'idx_question_active_subject_topic', key: { isActive: 1, subjectId: 1, topicId: 1 } },
    { name: 'idx_question_smart_scope', key: { isActive: 1, subjectId: 1, topicId: 1, difficulty: 1 } },
    { name: 'idx_question_active_post', key: { isActive: 1, postIds: 1 } },
    { name: 'idx_question_admin_recent', key: { isActive: 1, createdAt: -1 } },
  ],
  users: [{ name: 'idx_leaderboard_streak', key: { streakCount: -1, _id: 1 } }],
  tests: [
    { name: 'idx_test_type', key: { type: 1 } },
    { name: 'idx_test_status_created', key: { status: 1, createdAt: -1 } },
    { name: 'idx_test_question_ids', key: { questionIds: 1 } },
  ],
  testattempts: [
    { name: 'idx_attempt_user_test', key: { userId: 1, testId: 1 } },
    { name: 'idx_attempt_user_test_completed', key: { userId: 1, testId: 1, endTime: -1, createdAt: -1 } },
    { name: 'idx_attempt_user_completed_recent', key: { userId: 1, endTime: -1, createdAt: -1 } },
    { name: 'idx_attempt_user_open_recent', key: { userId: 1, createdAt: -1 } },
    { name: 'uniq_attempt_user_test_open', key: { userId: 1, testId: 1, endTime: 1 } },
    { name: 'idx_attempt_question_ids', key: { questionIds: 1 } },
  ],
  results: [
    { name: 'idx_result_user_recent', key: { userId: 1, createdAt: -1 } },
    { name: 'idx_result_user_test_recent', key: { userId: 1, testId: 1, createdAt: -1 } },
  ],
  notes: [
    { name: 'isActive_1_topicId_1_createdAt_-1', key: { isActive: 1, topicId: 1, createdAt: -1 }, optional: true },
  ],
};

const MODELS = [
  { model: Topic, collection: 'topics' },
  { model: Subject, collection: 'subjects' },
  { model: Question, collection: 'questions' },
  { model: User, collection: 'users' },
  { model: Test, collection: 'tests' },
  { model: TestAttempt, collection: 'testattempts' },
  { model: Result, collection: 'results' },
  { model: Note, collection: 'notes' },
];

function keySignature(key) {
  return JSON.stringify(key);
}

function indexMatchesExpected(ix, expected) {
  if (expected.name && ix.name === expected.name) return true;
  return keySignature(ix.key) === keySignature(expected.key);
}

function hasLeadingKey(indexKey, field) {
  const keys = Object.keys(indexKey || {});
  return keys[0] === field || keys.includes(field);
}

async function printCollectionIndexes(db, collectionName, verbose, r) {
  const indexes = await db.collection(collectionName).indexes();
  if (verbose) {
    r.info(`[indexes] ${collectionName} (${indexes.length} total)`);
    for (const ix of indexes) {
      console.log('  ', {
        name: ix.name,
        key: ix.key,
        unique: ix.unique ?? false,
        partial: ix.partialFilterExpression ? Object.keys(ix.partialFilterExpression) : null,
      });
    }
  }
  return indexes;
}

async function auditExpected(db, verbose, r) {
  let missing = 0;
  let optionalMissing = 0;

  for (const { collection } of MODELS) {
    const expectedList = EXPECTED_BY_COLLECTION[collection] || [];
    if (!expectedList.length) continue;

    const indexes = await db.collection(collection).indexes();
    if (verbose) await printCollectionIndexes(db, collection, false, r);

    for (const expected of expectedList) {
      const found = indexes.some((ix) => indexMatchesExpected(ix, expected));
      if (!found) {
        if (expected.optional) {
          optionalMissing += 1;
          r.info(`[optional] ${collection}: missing ${expected.name || keySignature(expected.key)}`);
        } else {
          missing += 1;
          r.warn(
            `[indexes] ${collection}: expected ${expected.name || keySignature(expected.key)} — not found`
          );
          if (verbose) {
            console.log(
              '[INFO] have:',
              indexes.map((i) => ({ name: i.name, key: i.key }))
            );
          }
        }
      } else if (verbose) {
        r.info(`OK ${collection}.${expected.name || keySignature(expected.key)}`);
      }
    }
  }

  return { missing, optionalMissing };
}

async function auditLegacyPatterns(db, verbose, r) {
  let missing = 0;
  const checks = [
    {
      collection: 'questions',
      desc: 'questions leading subjectId',
      pred: (ix) => hasLeadingKey(ix.key, 'subjectId'),
    },
    {
      collection: 'questions',
      desc: 'questions leading topicId',
      pred: (ix) => hasLeadingKey(ix.key, 'topicId'),
    },
    {
      collection: 'users',
      desc: 'users email unique',
      pred: (ix) => ix.key?.email === 1 && ix.unique === true,
    },
    {
      collection: 'testattempts',
      desc: 'testattempts userId+testId compound',
      pred: (ix) => ix.key?.userId === 1 && ix.key?.testId === 1,
    },
  ];

  for (const chk of checks) {
    const indexes = await db.collection(chk.collection).indexes();
    const ok = indexes.some((ix) => chk.pred(ix));
    if (!ok) {
      missing += 1;
      r.warn(`[indexes] ${chk.desc} — no matching index on ${chk.collection}`);
    } else if (verbose) {
      r.info(`OK ${chk.desc}`);
    }
  }
  return missing;
}

async function auditDuplicates(db, r) {
  const dupWarnings = [];
  for (const { model } of MODELS) {
    const collName = model.collection.collectionName;
    const indexes = await db.collection(collName).indexes();
    const byKey = new Map();
    for (const ix of indexes) {
      const sig = keySignature(ix.key);
      byKey.set(sig, (byKey.get(sig) || 0) + 1);
    }
    for (const [sig, count] of byKey) {
      if (count > 1) dupWarnings.push({ coll: collName, sig, count });
    }
  }
  for (const d of dupWarnings) {
    r.warn(`Duplicate index key pattern on ${d.coll}: ${d.sig} (${d.count}x)`);
  }
  return dupWarnings.length;
}

/**
 * Optional: run explain on one profile-style query when AUDIT_USER_ID is set.
 */
async function runExplainChecks(r) {
  const userId = process.env.AUDIT_USER_ID;
  if (!userId || !mongoose.isValidObjectId(userId)) {
    r.info('[explain] skipped — set AUDIT_USER_ID to a valid ObjectId to run executionStats');
    return;
  }
  const oid = new mongoose.Types.ObjectId(userId);
  const explain = await TestAttempt.find({ userId: oid, endTime: { $ne: null } })
    .sort({ endTime: -1, createdAt: -1 })
    .limit(5)
    .explain('executionStats');
  const stage = explain?.executionStats?.executionStages;
  const ix = explain?.queryPlanner?.winningPlan?.inputStage?.indexName;
  r.info(`[explain] recent completed attempts index: ${ix ?? stage?.indexName ?? 'see plan'}`);
  if (explain?.executionStats?.totalDocsExamined > 50) {
    r.warn(
      `[explain] high docs examined (${explain.executionStats.totalDocsExamined}) — review index`
    );
  }
}

async function main() {
  const { verbose } = parseArgs();
  const explain = process.argv.includes('--explain');
  const r = createReporter();
  await openDb();

  const db = mongoose.connection.db;

  if (verbose) {
    r.info('--- Live indexes (verbose) ---');
    for (const { collection } of MODELS) {
      await printCollectionIndexes(db, collection, true, r);
    }
  }

  const { missing: expectedMissing } = await auditExpected(db, verbose, r);
  const legacyMissing = await auditLegacyPatterns(db, verbose, r);
  const dupCount = await auditDuplicates(db, r);

  if (explain) {
    await runExplainChecks(r);
  }

  const totalMissing = expectedMissing + legacyMissing;
  r.summary([
    `expected-index gaps (required): ${expectedMissing}`,
    `legacy pattern gaps: ${legacyMissing}`,
    `duplicate key-pattern groups: ${dupCount}`,
    'Deploy note: new indexes build in background on Atlas; restart app so Mongoose syncIndex runs in dev.',
    'Production: prefer `db.collection.createIndex(..., { background: true })` during low traffic if collections are large.',
  ]);

  await closeDb();
  process.exit(totalMissing > 0 || dupCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[ERROR]', e);
  process.exit(2);
});
