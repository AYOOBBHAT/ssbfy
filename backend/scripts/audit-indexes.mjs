#!/usr/bin/env node
/**
 * Spot-check critical indexes (presence of leading keys). Partial/collation indexes need Atlas review.
 * Usage: node scripts/audit-indexes.mjs [--verbose]
 */
import mongoose from 'mongoose';
import { Topic } from '../src/models/Topic.js';
import { Question } from '../src/models/Question.js';
import { User } from '../src/models/User.js';
import { Test } from '../src/models/Test.js';
import { TestAttempt } from '../src/models/TestAttempt.js';
import { openDb, closeDb } from './lib/db.mjs';
import { createReporter, parseArgs } from './lib/reporter.mjs';

function hasLeadingKey(indexKey, field) {
  const keys = Object.keys(indexKey || {});
  return keys[0] === field || keys.includes(field);
}

/** Attempt partial unique: userId + testId + endTime — verify compound exists */
async function main() {
  const { verbose } = parseArgs();
  const r = createReporter();
  await openDb();

  const db = mongoose.connection.db;
  let missing = 0;

  const checks = [
    {
      model: Topic,
      desc: 'topics subjectId+name (compound)',
      pred: (ix) =>
        ix.key?.subjectId != null && ix.key?.name != null && Object.keys(ix.key).length >= 2,
    },
    {
      model: Question,
      desc: 'questions subjectId',
      pred: (ix) => hasLeadingKey(ix.key, 'subjectId'),
    },
    {
      model: Question,
      desc: 'questions topicId',
      pred: (ix) => hasLeadingKey(ix.key, 'topicId'),
    },
    {
      model: Question,
      desc: 'questions postIds',
      pred: (ix) => hasLeadingKey(ix.key, 'postIds'),
    },
    {
      model: User,
      desc: 'users email',
      pred: (ix) => ix.key?.email != null,
    },
    {
      model: Test,
      desc: 'tests type',
      pred: (ix) => ix.key?.type != null,
    },
    {
      model: TestAttempt,
      desc: 'testattempts userId+testId',
      pred: (ix) => ix.key?.userId != null && ix.key?.testId != null,
    },
  ];

  for (const chk of checks) {
    const coll = chk.model.collection.collectionName;
    const indexes = await db.collection(coll).indexes();
    const ok = indexes.some((ix) => chk.pred(ix));
    if (!ok) {
      missing += 1;
      r.warn(`[indexes] ${chk.desc} — no matching index found on ${coll}`);
      if (verbose) {
        console.log(
          '[INFO]',
          indexes.map((i) => ({ name: i.name, key: i.key }))
        );
      }
    } else if (verbose) {
      r.info(`OK ${chk.desc} (${coll})`);
    }
  }

  const dupWarnings = [];
  for (const name of mongoose.modelNames()) {
    const collName = mongoose.model(name).collection.collectionName;
    const indexes = await db.collection(collName).indexes();
    const byKey = new Map();
    for (const ix of indexes) {
      const sig = JSON.stringify(ix.key);
      byKey.set(sig, (byKey.get(sig) || 0) + 1);
    }
    for (const [sig, count] of byKey) {
      if (count > 1) dupWarnings.push({ coll: collName, sig, count });
    }
  }
  for (const d of dupWarnings) {
    r.warn(`Duplicate index definitions on ${d.coll}: key=${d.sig} (${d.count}x)`);
  }

  r.summary([
    `checks failed (missing pattern): ${missing}`,
    `duplicate-index-definition groups: ${dupWarnings.length}`,
    '[SUMMARY] TestAttempt uses partial unique on open attempts — verify in Atlas if warnings appear.',
  ]);

  await closeDb();
  process.exit(missing > 0 ? 1 : dupWarnings.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[ERROR]', e);
  process.exit(2);
});
