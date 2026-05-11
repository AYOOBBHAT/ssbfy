#!/usr/bin/env node
/**
 * Trim leading/trailing whitespace on Topic.name ONLY when no CI duplicate exists
 * under the same subject after trim (Mongo collation-aware check).
 * Default dry-run. Requires --apply to write.
 *
 * Usage:
 *   node scripts/fix-trim-topic-names.mjs
 *   node scripts/fix-trim-topic-names.mjs --apply [--verbose]
 */
import { Topic } from '../src/models/Topic.js';
import { openDb, closeDb } from './lib/db.mjs';
import { createReporter, parseArgs } from './lib/reporter.mjs';

async function main() {
  const { dryRun, apply, verbose } = parseArgs();
  const r = createReporter();
  const doWrite = apply && !dryRun;

  await openDb();

  const topics = await Topic.find({}).lean();
  let candidates = 0;
  let applied = 0;

  for (const t of topics) {
    const name = t.name;
    if (typeof name !== 'string') continue;
    const trimmed = name.trim();
    if (trimmed === name) continue;

    candidates += 1;

    const clash = await Topic.findOne({
      subjectId: t.subjectId,
      name: trimmed,
    }).collation({ locale: 'en', strength: 2 });

    if (clash && String(clash._id) !== String(t._id)) {
      r.warn(
        `Topic ${t._id} trim blocked — would collide with Topic ${clash._id} ("${trimmed}")`
      );
      continue;
    }

    r.fixable(`Topic ${t._id} name trim: ${JSON.stringify(name)} -> ${JSON.stringify(trimmed)}`);
    if (doWrite) {
      await Topic.updateOne({ _id: t._id }, { $set: { name: trimmed } });
      applied += 1;
      if (verbose) r.info(`Applied Topic ${t._id}`);
    }
  }

  r.summary([
    `topics scanned: ${topics.length}`,
    `trim candidates: ${candidates}`,
    `writes applied: ${doWrite ? applied : 0}`,
  ]);

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('[ERROR]', e);
  process.exit(2);
});
