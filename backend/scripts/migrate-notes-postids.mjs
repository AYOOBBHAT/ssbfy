/**
 * Migrate legacy Note.postId → Note.postIds[] (non-destructive).
 *
 * Default: dry-run (no writes). Use --apply to persist.
 *
 * Rules:
 * - If `postIds` is missing/empty AND `postId` exists → set `postIds: [postId]`
 * - Never delete legacy `postId` (backward compatibility).
 */
import mongoose from 'mongoose';
import { closeDb, openDb } from './lib/db.mjs';
import { createReporter, parseArgs } from './lib/reporter.mjs';

const { apply, dryRun, verbose } = parseArgs();
const reporter = createReporter();

function asIdString(v) {
  if (!v) return '';
  return String(v).trim();
}

async function main() {
  await openDb();
  const Note = mongoose.model('Note');

  const cursor = Note.find(
    {
      postId: { $exists: true, $ne: null },
    },
    { _id: 1, postId: 1, postIds: 1 }
  )
    .lean()
    .cursor();

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for await (const note of cursor) {
    scanned += 1;
    const id = asIdString(note?._id);
    const legacyPostId = asIdString(note?.postId);
    const postIds = Array.isArray(note?.postIds) ? note.postIds.map(asIdString).filter(Boolean) : [];

    if (!legacyPostId) {
      skipped += 1;
      continue;
    }

    if (postIds.length > 0) {
      skipped += 1;
      if (verbose) reporter.info(`skip ${id} (already has postIds)`);
      continue;
    }

    updated += 1;
    if (verbose) reporter.fixable(`note ${id}: set postIds=[${legacyPostId}]`);

    if (apply && !dryRun) {
      await Note.updateOne(
        { _id: note._id },
        { $set: { postIds: [note.postId] } }
      ).exec();
    }
  }

  reporter.summary([
    `mode: ${apply && !dryRun ? 'APPLY' : 'DRY-RUN'}`,
    `scanned: ${scanned}`,
    `updated: ${updated}`,
    `skipped: ${skipped}`,
  ]);

  process.exitCode = reporter.exitCode();
}

main()
  .catch((err) => {
    reporter.error(err?.stack || String(err));
    process.exitCode = 2;
  })
  .finally(async () => {
    await closeDb();
  });

