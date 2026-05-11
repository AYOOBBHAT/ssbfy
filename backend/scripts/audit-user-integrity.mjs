#!/usr/bin/env node
/**
 * User + saved materials reference audit.
 * Usage: node scripts/audit-user-integrity.mjs [--verbose]
 */
import { User } from '../src/models/User.js';
import { SavedMaterial } from '../src/models/SavedMaterial.js';
import { Note } from '../src/models/Note.js';
import { PdfNote } from '../src/models/PdfNote.js';
import { openDb, closeDb } from './lib/db.mjs';
import { createReporter, parseArgs } from './lib/reporter.mjs';

async function main() {
  const { verbose } = parseArgs();
  const r = createReporter();
  await openDb();

  const users = await User.find({}).lean();
  const userIds = new Set(users.map((u) => String(u._id)));

  const dupEmailAgg = await User.aggregate([
    { $group: { _id: '$email', n: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { n: { $gt: 1 } } },
  ]);

  const c = {
    premiumExpiredButFlag: 0,
    badSubscriptionDate: 0,
    badPlanType: 0,
    duplicateEmail: 0,
    savedOrphanUser: 0,
    savedOrphanNote: 0,
    savedOrphanPdf: 0,
  };

  for (const row of dupEmailAgg) {
    c.duplicateEmail += row.n;
    r.error(
      `Duplicate email value stored: "${row._id}" (${row.n} docs) ids=${row.ids.map(String).join(',')}`
    );
  }

  const allowedPlan = new Set(['monthly', 'quarterly', 'yearly', 'lifetime']);

  for (const u of users) {
    const id = String(u._id);

    const now = Date.now();
    const subEnd = u.subscriptionEnd ? new Date(u.subscriptionEnd).getTime() : null;
    if (subEnd != null && Number.isFinite(subEnd) && subEnd < now && u.isPremium === true) {
      c.premiumExpiredButFlag += 1;
      r.warn(`User ${id} isPremium=true but subscriptionEnd in past`);
    }
    if (u.subscriptionEnd != null && !Number.isFinite(new Date(u.subscriptionEnd).getTime())) {
      c.badSubscriptionDate += 1;
      r.error(`User ${id} malformed subscriptionEnd`);
    }
    if (
      u.currentPlanType != null &&
      u.currentPlanType !== '' &&
      !allowedPlan.has(u.currentPlanType)
    ) {
      c.badPlanType += 1;
      r.warn(`User ${id} unexpected currentPlanType=${u.currentPlanType}`);
    }

    if (verbose) {
      /* password presence cannot be checked without select +password */
    }
  }

  const saved = await SavedMaterial.find({}).lean();
  const noteIds = new Set(
    (await Note.find({}, { _id: 1 }).lean()).map((n) => String(n._id))
  );
  const pdfIds = new Set(
    (await PdfNote.find({}, { _id: 1 }).lean()).map((p) => String(p._id))
  );

  for (const s of saved) {
    const sid = String(s._id);
    if (!userIds.has(String(s.userId))) {
      c.savedOrphanUser += 1;
      r.error(`SavedMaterial ${sid} references missing user ${s.userId}`);
    }
    if (s.materialType === 'note' && s.noteId) {
      const nid = String(s.noteId);
      if (!noteIds.has(nid)) {
        c.savedOrphanNote += 1;
        r.error(`SavedMaterial ${sid} references missing Note ${nid}`);
      }
    }
    if (s.materialType === 'pdf' && s.pdfId) {
      const pid = String(s.pdfId);
      if (!pdfIds.has(pid)) {
        c.savedOrphanPdf += 1;
        r.error(`SavedMaterial ${sid} references missing PdfNote ${pid}`);
      }
    }
  }

  r.summary([
    `users: ${users.length}`,
    `saved materials: ${saved.length}`,
    ...Object.entries(c).map(([k, v]) => `${k}: ${v}`),
  ]);

  await closeDb();
  process.exit(r.exitCode());
}

main().catch((e) => {
  console.error('[ERROR]', e);
  process.exit(2);
});
