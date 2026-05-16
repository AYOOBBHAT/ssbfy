#!/usr/bin/env node
/**
 * One-time backfill: persist immutable `resultSnapshot` on legacy completed TestAttempts.
 *
 * Purpose
 * -------
 * Before the immutable snapshot migration, completed attempts only stored score/
 * accuracy and live question references. Historical review/retry could drift when
 * admins edited the question bank. This script freezes a best-effort snapshot from
 * current question docs + stored attempt answers so Profile → historical Result
 * behaves like newly submitted attempts.
 *
 * What this script does NOT do
 * ----------------------------
 * - Does NOT recompute or overwrite score, accuracy, or timeTaken (stored values
 *   remain authoritative).
 * - Does NOT mutate attempts that already have resultSnapshot.
 * - Does NOT process in-progress attempts (endTime must be set).
 *
 * Safety
 * ------
 * - Default: dry-run (no writes). Pass --apply to persist.
 * - Resumable: conditional updates only apply when snapshot is still missing.
 * - Cursor-based batching (no full collection load).
 *
 * Usage (from `backend/`):
 *   node scripts/backfill-attempt-result-snapshots.mjs
 *   node scripts/backfill-attempt-result-snapshots.mjs --dry-run --verbose
 *   node scripts/backfill-attempt-result-snapshots.mjs --apply
 *   node scripts/backfill-attempt-result-snapshots.mjs --apply --verbose
 *
 * Manual QA after --apply:
 * - Same test, multiple attempts: each opens distinct historical review.
 * - Admin edits answers after backfill: old attempt review unchanged.
 * - Deleted question: placeholder in review; retry skips unavailable rows.
 * - Blank submit → snapshot wrongQuestionIds includes all unanswered questions.
 * - Rerun script: skippedExisting increases; updated stays 0.
 *
 * Compatibility: attempts that already have resultSnapshot are never overwritten.
 * Snapshots created before the "retry-worthy includes unanswered" change may list
 * only explicitly incorrect ids in wrongQuestionIds; the API recomputes retry lists
 * from frozen snapshot items at read time so Profile/historical retry stays correct.
 */
import mongoose from 'mongoose';
import { closeDb, moduleUrl, openDb } from './lib/db.mjs';
import { createReporter, parseArgs } from './lib/reporter.mjs';

const BATCH_LOG_EVERY = 100;

async function main() {
  const { apply, dryRun, verbose } = parseArgs();
  const reporter = createReporter();
  const mode = apply && !dryRun ? 'APPLY' : 'DRY-RUN';

  const {
    buildResultSnapshotForBackfill,
    missingSnapshotFilter,
    missingSnapshotUpdateFilter,
    normalizeAnswers,
    validateAttemptShapeForBackfill,
  } = await import(moduleUrl('src/utils/attemptResultSnapshot.js'));

  const { questionRepository } = await import(moduleUrl('src/repositories/questionRepository.js'));

  await openDb();
  const TestAttempt = mongoose.model('TestAttempt');

  const eligibleQuery = missingSnapshotFilter();
  const eligible = await TestAttempt.countDocuments(eligibleQuery).exec();

  reporter.info(`mode: ${mode}`);
  reporter.info(`eligible (missing snapshot): ${eligible}`);

  const stats = {
    eligible,
    updated: 0,
    skippedExisting: 0,
    skippedIncomplete: 0,
    skippedBroken: 0,
    skippedAllQuestionsMissing: 0,
    missingQuestions: 0,
    errors: 0,
  };

  const cursor = TestAttempt.find(eligibleQuery)
    .select('_id userId testId questionIds answers endTime score accuracy timeTaken resultSnapshot')
    .sort({ _id: 1 })
    .lean()
    .cursor();

  let processed = 0;

  for await (const attempt of cursor) {
    processed += 1;

    try {
      const check = validateAttemptShapeForBackfill(attempt);
      if (!check.ok) {
        if (check.reason === 'existing_snapshot') {
          stats.skippedExisting += 1;
        } else if (check.reason === 'incomplete') {
          stats.skippedIncomplete += 1;
        } else {
          stats.skippedBroken += 1;
          if (verbose) {
            reporter.warn(`skip ${attempt._id} (${check.reason})`);
          }
        }
        continue;
      }

      const questions = await questionRepository.findByIdsForScoring(attempt.questionIds);
      const qMap = new Map(questions.map((q) => [q._id.toString(), q]));

      const normalizedAnswers = normalizeAnswers(attempt.answers || []);
      const answerByQ = new Map(normalizedAnswers.map((a) => [a.questionId.toString(), a]));

      const { snapshot, resolvedQuestionCount, missingQuestionCount } =
        buildResultSnapshotForBackfill(attempt.questionIds, qMap, answerByQ);

      stats.missingQuestions += missingQuestionCount;

      if (resolvedQuestionCount === 0) {
        stats.skippedAllQuestionsMissing += 1;
        reporter.warn(
          `skip ${attempt._id}: all ${attempt.questionIds.length} question(s) missing from DB`
        );
        continue;
      }

      if (!snapshot.items.length) {
        stats.skippedBroken += 1;
        reporter.warn(`skip ${attempt._id}: empty snapshot items`);
        continue;
      }

      stats.updated += 1;

      if (verbose) {
        reporter.fixable(
          `attempt ${attempt._id}: items=${snapshot.items.length} wrong=${snapshot.wrongQuestionIds.length} missingQ=${missingQuestionCount} score=${attempt.score ?? '—'} accuracy=${attempt.accuracy ?? '—'}`
        );
      }

      if (apply && !dryRun) {
        const res = await TestAttempt.updateOne(
          missingSnapshotUpdateFilter(attempt._id),
          { $set: { resultSnapshot: snapshot } }
        ).exec();

        if (res.matchedCount === 0) {
          stats.skippedExisting += 1;
          stats.updated -= 1;
          if (verbose) {
            reporter.info(`race skip ${attempt._id} (snapshot appeared before write)`);
          }
        } else if (res.modifiedCount === 0 && verbose) {
          reporter.info(`no-op write ${attempt._id} (already had snapshot)`);
        }
      }
    } catch (e) {
      stats.errors += 1;
      reporter.error(`attempt ${attempt._id}: ${e?.message || String(e)}`);
    }

    if (processed % BATCH_LOG_EVERY === 0) {
      reporter.info(`progress: processed=${processed} updated=${stats.updated}`);
    }
  }

  reporter.summary([
    `mode: ${mode}`,
    `eligible: ${stats.eligible}`,
    `updated: ${stats.updated}`,
    `skippedExisting: ${stats.skippedExisting}`,
    `skippedIncomplete: ${stats.skippedIncomplete}`,
    `skippedBroken: ${stats.skippedBroken}`,
    `skippedAllQuestionsMissing: ${stats.skippedAllQuestionsMissing}`,
    `missingQuestions: ${stats.missingQuestions}`,
    `errors: ${stats.errors}`,
  ]);

  process.exitCode = stats.errors > 0 ? 2 : reporter.exitCode();
}

main()
  .catch((err) => {
    console.error('[ERROR]', err?.stack || String(err));
    process.exitCode = 2;
  })
  .finally(async () => {
    await closeDb();
  });
