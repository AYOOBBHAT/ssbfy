#!/usr/bin/env node
/**
 * Remove duplicate ObjectIds within Question.postIds (preserves first-seen order).
 * Default: dry-run. Writes require --apply.
 *
 * Usage:
 *   node scripts/fix-question-postids-dedupe.mjs [--dry-run] [--verbose]
 *   node scripts/fix-question-postids-dedupe.mjs --apply [--verbose]
 */
import { Question } from '../src/models/Question.js';
import { openDb, closeDb } from './lib/db.mjs';
import { createReporter, parseArgs } from './lib/reporter.mjs';

function dedupePreserveOrder(ids) {
  if (!Array.isArray(ids)) return ids;
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    const s = String(id);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(id);
  }
  return out;
}

async function main() {
  const { dryRun, verbose, apply } = parseArgs();
  const r = createReporter();
  const doWrite = apply && !dryRun;
  if (!apply) {
    r.info('Read-only. Pass --apply to persist deduped postIds (use with care).');
  }

  await openDb();

  let scanned = 0;
  let fixed = 0;

  const cursor = Question.find({ postIds: { $exists: true, $not: { $size: 0 } } }).cursor();

  for await (const q of cursor) {
    scanned += 1;
    const arr = q.postIds;
    if (!Array.isArray(arr)) continue;
    const next = dedupePreserveOrder(arr);
    if (next.length === arr.length) continue;

    fixed += 1;
    if (verbose) {
      r.fixable(`Question ${q._id} postIds ${arr.length} -> ${next.length}`);
    }

    if (doWrite) {
      await Question.updateOne({ _id: q._id }, { $set: { postIds: next } });
      r.info(`Applied dedupe for Question ${q._id}`);
    } else {
      r.fixable(`Would update Question ${q._id} postIds (dedupe)`);
    }
  }

  r.summary([
    `scanned: ${scanned}`,
    `questions with duplicate postIds: ${fixed}`,
    `writes performed: ${doWrite ? 'yes' : 'no'}`,
  ]);

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('[ERROR]', e);
  process.exit(2);
});
