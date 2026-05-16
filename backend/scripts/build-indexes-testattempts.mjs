#!/usr/bin/env node
/**
 * Targeted migration: create missing TestAttempt indexes only.
 *
 * Indexes (must match `src/models/TestAttempt.js`):
 *   - idx_attempt_user_test_completed — per-test completed history
 *   - idx_attempt_user_completed_recent — profile / global recent completed
 *
 * Safety:
 *   - Uses `collection.createIndex()` only (never syncIndexes / dropIndexes)
 *   - `background: true`, idempotent by index name
 *   - Does not modify any other collection
 *
 * Usage:
 *   npm run build:indexes:testattempts
 *   node scripts/build-indexes-testattempts.mjs --verbose
 *
 * After run:
 *   npm run audit:indexes
 */
import mongoose from 'mongoose';
import { openDb, closeDb } from './lib/db.mjs';
import { createReporter, parseArgs } from './lib/reporter.mjs';

/** Only register TestAttempt — no index builds on other models. */
import { TestAttempt } from '../src/models/TestAttempt.js';

/** @type {import('mongodb').CreateIndexesOptions & { name: string; key: Record<string, number> }[]} */
const TARGET_INDEXES = [
  {
    name: 'idx_attempt_user_test_completed',
    key: { userId: 1, testId: 1, endTime: -1, createdAt: -1 },
    partialFilterExpression: { endTime: { $exists: true } },
  },
  {
    name: 'idx_attempt_user_completed_recent',
    key: { userId: 1, endTime: -1, createdAt: -1 },
    partialFilterExpression: { endTime: { $exists: true } },
  },
];

function keysMatch(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * @param {import('mongodb').Collection} collection
 */
async function ensureIndex(collection, spec, verbose, r) {
  const indexes = await collection.indexes();
  const byName = indexes.find((ix) => ix.name === spec.name);

  if (byName) {
    const keyOk = keysMatch(byName.key, spec.key);
    const partialOk =
      JSON.stringify(byName.partialFilterExpression ?? null) ===
      JSON.stringify(spec.partialFilterExpression ?? null);
    if (keyOk && partialOk) {
      r.info(`${spec.name}: already exists`);
      if (verbose) console.log('  ', { key: byName.key, partial: byName.partialFilterExpression });
      return 'exists';
    }
    r.warn(
      `${spec.name}: name exists but definition differs — review manually in Atlas (not auto-dropped)`
    );
    if (verbose) {
      console.log('  expected:', { key: spec.key, partial: spec.partialFilterExpression });
      console.log('  actual:  ', {
        key: byName.key,
        partial: byName.partialFilterExpression,
      });
    }
    return 'mismatch';
  }

  await collection.createIndex(spec.key, {
    name: spec.name,
    background: true,
    partialFilterExpression: spec.partialFilterExpression,
  });

  r.info(`${spec.name}: created`);
  if (verbose) console.log('  ', { key: spec.key, partial: spec.partialFilterExpression });
  return 'created';
}

async function main() {
  const { verbose } = parseArgs();
  const r = createReporter();

  let shuttingDown = false;
  const onSignal = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    r.warn(`Received ${signal} — disconnecting`);
    await closeDb();
    process.exit(signal === 'SIGINT' ? 130 : 1);
  };
  process.once('SIGINT', () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));

  r.info('TestAttempt index migration (createIndex only, no drops)');
  await openDb();

  const collection = TestAttempt.collection;
  const collName = collection.collectionName;
  r.info(`Collection: ${collName}`);

  const outcomes = [];
  for (const spec of TARGET_INDEXES) {
    try {
      const status = await ensureIndex(collection, spec, verbose, r);
      outcomes.push({ name: spec.name, status });
    } catch (err) {
      r.error(`${spec.name}: ${err?.message ?? err}`);
      if (verbose && err?.stack) console.error(err.stack);
      outcomes.push({ name: spec.name, status: 'error' });
    }
  }

  const created = outcomes.filter((o) => o.status === 'created').length;
  const exists = outcomes.filter((o) => o.status === 'exists').length;
  const mismatches = outcomes.filter((o) => o.status === 'mismatch').length;
  const errors = outcomes.filter((o) => o.status === 'error').length;

  r.summary([
    `collection: ${collName}`,
    `created: ${created}`,
    `already existed: ${exists}`,
    `definition mismatch: ${mismatches}`,
    `errors: ${errors}`,
    'next: npm run audit:indexes',
  ]);

  await closeDb();
  const failed = errors > 0 || mismatches > 0;
  process.exit(failed ? 2 : 0);
}

main().catch(async (err) => {
  console.error('[ERROR]', err?.message ?? err);
  if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
    console.error(err?.stack);
  }
  try {
    await closeDb();
  } catch {
    /* ignore */
  }
  process.exit(2);
});
