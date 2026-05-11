#!/usr/bin/env node
/**
 * Audit duplicate topic names per subject (case-insensitive), bad subject refs, malformed names.
 * Does not modify data.
 *
 * Usage: node scripts/audit-duplicate-topics.mjs [--verbose]
 */
import { Topic } from '../src/models/Topic.js';
import { Subject } from '../src/models/Subject.js';
import { openDb, closeDb } from './lib/db.mjs';
import { createReporter, parseArgs } from './lib/reporter.mjs';

const MAX_NAME_LEN = 500;

async function main() {
  const { verbose } = parseArgs();
  const r = createReporter();
  await openDb();

  const subjectIds = new Set(
    (await Subject.find({}, { _id: 1 }).lean()).map((s) => String(s._id))
  );

  const topics = await Topic.find({}).lean();
  let missingSubject = 0;
  let inactiveSubjectRef = 0;
  let emptyName = 0;
  let whitespaceOnly = 0;
  let tooLong = 0;

  const subjectsById = new Map(
    (await Subject.find({}, { _id: 1, isActive: 1 }).lean()).map((s) => [
      String(s._id),
      s,
    ])
  );

  for (const t of topics) {
    const sid = t.subjectId;
    if (sid == null) {
      missingSubject += 1;
      r.error(`Topic ${t._id} has missing subjectId`);
      continue;
    }
    const sidStr = String(sid);
    if (!subjectIds.has(sidStr)) {
      missingSubject += 1;
      r.error(`Topic ${t._id} references missing Subject ${sidStr}`);
      continue;
    }
    const sub = subjectsById.get(sidStr);
    if (sub && sub.isActive === false) {
      inactiveSubjectRef += 1;
      r.warn(`Topic ${t._id} references inactive Subject ${sidStr}`);
    }

    const name = t.name;
    if (name == null || name === '') {
      emptyName += 1;
      r.error(`Topic ${t._id} has empty name`);
    } else if (typeof name === 'string' && name.trim() === '' && name.length > 0) {
      whitespaceOnly += 1;
      r.warn(`Topic ${t._id} has whitespace-only name`);
    }
    if (typeof name === 'string' && name.length > MAX_NAME_LEN) {
      tooLong += 1;
      r.warn(`Topic ${t._id} name length ${name.length} exceeds ${MAX_NAME_LEN}`);
    }
  }

  const dupAgg = await Topic.aggregate([
    {
      $match: {
        subjectId: { $exists: true, $ne: null },
        name: { $exists: true, $type: 'string' },
      },
    },
    {
      $group: {
        _id: {
          subjectId: '$subjectId',
          nameLower: { $toLower: { $trim: { input: '$name' } } },
        },
        ids: { $push: '$_id' },
        names: { $push: '$name' },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  let dupGroups = 0;
  for (const row of dupAgg) {
    dupGroups += 1;
    const ids = row.ids.map((id) => String(id)).join(', ');
    r.error(
      `Duplicate topic names (case-insensitive) under subject ${row._id.subjectId}: ${ids} (${row.count} docs) names=${JSON.stringify(row.names)}`
    );
    if (verbose) {
      r.info(JSON.stringify(row._id));
    }
  }

  if (dupGroups === 0 && !r.counts.error) {
    r.fixable('No duplicate topic name groups found by aggregation.');
  }

  r.summary([
    `topics scanned: ${topics.length}`,
    `duplicate name groups: ${dupGroups}`,
    `missing/bad subject ref: ${missingSubject}`,
    `inactive subject refs: ${inactiveSubjectRef}`,
    `empty name: ${emptyName}`,
    `whitespace-only name: ${whitespaceOnly}`,
    `name too long: ${tooLong}`,
  ]);

  await closeDb();
  process.exit(r.exitCode());
}

main().catch((e) => {
  console.error('[ERROR]', e);
  process.exit(2);
});
