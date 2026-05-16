#!/usr/bin/env node
/**
 * Production-safe index builder for SSBFY.
 *
 * Uses Mongoose `Model.createIndexes()` — creates missing schema indexes only.
 * Does NOT call `syncIndexes()` (which can drop indexes removed from schemas).
 * Does NOT call `dropIndexes()` or `collection.drop()`.
 *
 * Usage (from `backend/`, requires MONGO_URI in `.env`):
 *   npm run build:indexes
 *   node scripts/build-indexes.mjs --verbose
 *
 * Deploy: run during a low-traffic window before or after API deploy.
 * On Atlas replica sets, index builds are non-blocking for reads by default.
 */
import mongoose from 'mongoose';
import { openDb, closeDb } from './lib/db.mjs';
import { createReporter, parseArgs } from './lib/reporter.mjs';

/** Build smaller collections first; heavy collections last. */
const HEAVY_LAST = new Set(['Question', 'TestAttempt']);

const CREATE_OPTIONS = {
  /** Legacy hint; ignored on MongoDB 4.2+ replica sets (builds are concurrent-safe). */
  background: true,
};

function sortModelNames(names) {
  const light = names.filter((n) => !HEAVY_LAST.has(n)).sort();
  const heavy = names.filter((n) => HEAVY_LAST.has(n)).sort();
  return [...light, ...heavy];
}

async function indexSnapshot(db, collectionName) {
  const indexes = await db.collection(collectionName).indexes();
  return new Map(indexes.map((ix) => [ix.name, ix]));
}

function formatIndex(ix) {
  return { name: ix.name, key: ix.key, unique: Boolean(ix.unique) };
}

/**
 * @param {import('mongoose').Model} model
 */
async function buildModelIndexes(model, { verbose }, r) {
  const coll = model.collection.collectionName;
  const db = mongoose.connection.db;
  const before = await indexSnapshot(db, coll);

  await model.createIndexes(CREATE_OPTIONS);

  const after = await indexSnapshot(db, coll);
  const created = [...after.keys()].filter((name) => !before.has(name));
  const total = after.size;

  if (created.length) {
    r.info(`${model.modelName} (${coll}): created [${created.join(', ')}]`);
    if (verbose) {
      for (const name of created) {
        console.log('  +', formatIndex(after.get(name)));
      }
    }
  } else {
    r.info(`${model.modelName} (${coll}): up to date (${total} indexes)`);
  }

  if (verbose) {
    console.log(`  [${coll}] all indexes:`);
    for (const ix of after.values()) {
      console.log('   ', formatIndex(ix));
    }
  }

  return { modelName: model.modelName, collection: coll, created, total };
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

  r.info('Connecting (createIndexes only — no syncIndexes, no drops)');
  await openDb();
  /** Register models not yet in `src/models/index.js`. */
  await import('../src/models/SavedMaterial.js');
  await import('../src/models/SubscriptionPlan.js');

  const modelNames = sortModelNames(mongoose.modelNames());
  if (!modelNames.length) {
    r.error('No Mongoose models registered — check imports');
    await closeDb();
    process.exit(2);
  }

  r.info(`Building indexes for ${modelNames.length} model(s): ${modelNames.join(', ')}`);

  const results = [];
  for (const name of modelNames) {
    try {
      const row = await buildModelIndexes(mongoose.model(name), { verbose }, r);
      results.push(row);
    } catch (err) {
      r.error(`${name}: ${err?.message ?? err}`);
      if (verbose && err?.stack) console.error(err.stack);
    }
  }

  const createdTotal = results.reduce((n, row) => n + row.created.length, 0);
  const failed = r.counts.error;

  r.summary([
    `models processed: ${results.length}/${modelNames.length}`,
    `new index names this run: ${createdTotal}`,
    `errors: ${failed}`,
    'safety: syncIndexes() and dropIndexes() were NOT called',
  ]);

  await closeDb();
  process.exit(failed > 0 ? 2 : r.exitCode());
}

main().catch(async (err) => {
  console.error('[ERROR]', err?.message ?? err);
  if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
    console.error(err?.stack);
  }
  try {
    await closeDb();
  } catch {
    /* ignore disconnect errors on fatal path */
  }
  process.exit(2);
});
