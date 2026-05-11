#!/usr/bin/env node
/**
 * Merge duplicate Subjects that share the same normalized name (case-insensitive),
 * remap Topic / Question / Note references, set canonical `postId` to null,
 * delete merged-away subject documents.
 *
 * Deploy **relaxed** backend (global subjects) **before** `--apply` if the DB
 * still has duplicate names that violate `uniq_subject_name_ci_global`.
 *
 * Usage (from `backend/`):
 *   node scripts/migrate-global-subjects.mjs           # dry-run (default)
 *   node scripts/migrate-global-subjects.mjs --apply   # execute writes
 *   node scripts/migrate-global-subjects.mjs --verbose
 */
import mongoose from 'mongoose';
import { Subject } from '../src/models/Subject.js';
import { Topic } from '../src/models/Topic.js';
import { Question } from '../src/models/Question.js';
import { Note } from '../src/models/Note.js';
import { openDb, closeDb } from './lib/db.mjs';

function normalizeName(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase();
}

function parseArgs(argv = process.argv.slice(2)) {
  return {
    apply: argv.includes('--apply'),
    verbose: argv.includes('--verbose'),
  };
}

/** True if moving loser topics under winner would violate topic uniqueness. */
async function topicNameConflictsWithWinner(winnerId, loserId) {
  const [winnerTopics, loserTopics] = await Promise.all([
    Topic.find({ subjectId: winnerId }).lean(),
    Topic.find({ subjectId: loserId }).lean(),
  ]);
  const winnerNames = new Set(winnerTopics.map((t) => normalizeName(t.name)));
  for (const lt of loserTopics) {
    const k = normalizeName(lt.name);
    if (k && winnerNames.has(k)) {
      return { conflict: true, topicName: lt.name, winnerTopicId: null };
    }
  }
  return { conflict: false };
}

async function refCounts(subjectId) {
  const sid = subjectId;
  const [topics, questions, notes] = await Promise.all([
    Topic.countDocuments({ subjectId: sid }),
    Question.countDocuments({ subjectId: sid }),
    Note.countDocuments({ subjectId: sid }),
  ]);
  return { topics, questions, notes, total: topics + questions + notes };
}

function pickCanonical(candidates, countsById) {
  const scored = candidates.map((s) => {
    const c = countsById.get(String(s._id)) || { total: 0, topics: 0, questions: 0, notes: 0 };
    const active = s.isActive !== false ? 1 : 0;
    const created = new Date(s.createdAt || 0).getTime();
    return { s, ...c, active, created };
  });
  scored.sort((a, b) => {
    if (b.active !== a.active) return b.active - a.active;
    if (b.total !== a.total) return b.total - a.total;
    if (a.created !== b.created) return a.created - b.created;
    return String(a.s._id).localeCompare(String(b.s._id));
  });
  return scored[0].s;
}

async function main() {
  const { apply, verbose } = parseArgs();
  console.log(`[SUMMARY] mode=${apply ? 'APPLY (writes enabled)' : 'DRY-RUN (no writes)'}`);

  await openDb();

  const subjects = await Subject.find({}).lean();
  const groups = new Map();
  for (const s of subjects) {
    const key = normalizeName(s.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  const mergeGroups = [...groups.entries()].filter(([, arr]) => arr.length > 1);
  console.log(`[INFO] subjects loaded: ${subjects.length}`);
  console.log(`[INFO] duplicate-name groups: ${mergeGroups.length}`);

  if (mergeGroups.length === 0) {
    console.log('[SUMMARY] Nothing to merge by normalized name.');
    await closeDb();
    process.exit(0);
  }

  const countsById = new Map();
  for (const s of subjects) {
    countsById.set(String(s._id), await refCounts(s._id));
  }

  const plan = [];
  for (const [key, arr] of mergeGroups) {
    const winner = pickCanonical(arr, countsById);
    const losers = arr.filter((x) => String(x._id) !== String(winner._id));
    plan.push({ key, winner, losers });
    console.log(`[FIXABLE] merge "${key}" → keep ${winner._id} (${winner.name}), drop ${losers.map((l) => String(l._id)).join(', ')}`);
    if (verbose) {
      for (const l of losers) {
        const c = countsById.get(String(l._id));
        console.log(`  loser ${l._id} refs topics=${c.topics} questions=${c.questions} notes=${c.notes}`);
      }
    }
  }

  if (!apply) {
    console.log('[SUMMARY] Re-run with --apply after backup + code deploy to execute.');
    await closeDb();
    process.exit(0);
  }

  const safePlan = [];
  for (const entry of plan) {
    const { winner, losers } = entry;
    let blocked = null;
    for (const loser of losers) {
      const chk = await topicNameConflictsWithWinner(winner._id, loser._id);
      if (chk.conflict) {
        blocked = chk;
        break;
      }
    }
    if (blocked) {
      console.error(
        `[ERROR] skip merge group "${entry.key}": topic "${blocked.topicName}" already exists on winner subject ${winner._id}. Resolve manually.`
      );
      continue;
    }
    safePlan.push(entry);
  }

  if (safePlan.length === 0) {
    console.error('[ERROR] No merge-safe groups after topic-collision checks. Abort.');
    await closeDb();
    process.exit(2);
  }

  let merged = 0;
  for (const { winner, losers } of safePlan) {
    const winId = winner._id;
    for (const loser of losers) {
      const lid = loser._id;
      const t = await Topic.updateMany({ subjectId: lid }, { $set: { subjectId: winId } });
      const q = await Question.updateMany({ subjectId: lid }, { $set: { subjectId: winId } });
      const n = await Note.updateMany({ subjectId: lid }, { $set: { subjectId: winId } });
      if (verbose) {
        console.log(
          `[INFO] remapped loser ${lid} → topics.modified=${t.modifiedCount} questions=${q.modifiedCount} notes=${n.modifiedCount}`
        );
      }
      await Subject.deleteOne({ _id: lid });
    }
    await Subject.updateOne({ _id: winId }, { $set: { postId: null } });
    merged += 1;
  }

  console.log(`[SUMMARY] merged groups: ${merged}`);

  try {
    await Subject.collection.dropIndex('uniq_postId_name_ci');
    console.log('[INFO] dropped legacy index uniq_postId_name_ci (if present)');
  } catch (e) {
    if (e?.code !== 27 && e?.codeName !== 'IndexNotFound') {
      console.warn('[WARN] could not drop legacy index:', e.message);
    }
  }

  try {
    await Subject.syncIndexes();
    console.log('[INFO] Subject.syncIndexes() completed');
  } catch (e) {
    console.warn('[WARN] syncIndexes failed — create indexes manually in Atlas:', e.message);
  }

  await closeDb();
  console.log('[SUMMARY] Done. Run: npm run audit:questions && npm run audit:topics');
  process.exit(0);
}

main().catch((e) => {
  console.error('[ERROR]', e);
  process.exit(2);
});
